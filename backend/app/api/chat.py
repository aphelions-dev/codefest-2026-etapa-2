"""El endpoint del asistente. Un unico `POST /chat`, como exige la especificacion.

La respuesta se arma aqui y se valida contra los modelos Pydantic antes de salir: el contrato es
lo que se califica, y un campo de mas o de menos no puede depender de por donde fue el grafo.
"""

import logging
import time
from collections import OrderedDict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from app.agent.graph import BLOCKED_INPUT, OK, Runtime
from app.agent.state import ToolRecord, Usage
from app.responses import (
    AgentTokens,
    ChatRequest,
    ChatResponse,
    Evaluation,
    Metadata,
    Tokens,
    ToolCall,
)

log = logging.getLogger("agent.chat")

router = APIRouter()


async def get_agent(request: Request):
    """El grafo compilado y su runtime, montados al arrancar el proceso."""
    agent = request.app.state.agent
    if agent is None:
        raise HTTPException(503, "El asistente no esta configurado en este despliegue")
    return agent


Agent = Annotated[tuple, Depends(get_agent)]


@router.post("/chat", summary="Pregunta al asistente del radar")
async def chat(payload: ChatRequest, agent: Agent) -> ChatResponse:
    """Una pregunta, una respuesta con su evidencia y su coste."""
    graph, runtime = agent
    started = time.perf_counter()

    state = await graph.ainvoke(
        {"question": payload.input, "retries": 0, "usage": [], "tools": [], "agents": []}
    )

    latency = int((time.perf_counter() - started) * 1000)
    response = _assemble(payload.input, state, latency, runtime)
    log.info(
        "consulta atendida",
        extra={
            "estado": response.metadata.estado,
            "interacciones": response.metadata.num_interacciones,
            "tokens": response.metadata.tokens.total,
            "latencia_ms": latency,
        },
    )
    return response


def _assemble(question: str, state: dict, latency: int, runtime: Runtime) -> ChatResponse:
    usage: list[Usage] = state.get("usage") or []
    tools: list[ToolRecord] = state.get("tools") or []
    fragments = state.get("fragments") or []
    status = state.get("status") or OK

    # Cuando la entrada se bloquea no se revela nada de lo que vio el guardian: ni el motivo, ni
    # las herramientas que lo detectaron. El motivo ya quedo en el log.
    if status == BLOCKED_INPUT:
        tools = []

    return ChatResponse(
        respuesta=state.get("answer") or "",
        evaluacion=Evaluation(
            input=question,
            actual_output=state.get("answer") or "",
            # Solo si hubo recuperacion, como pide la especificacion.
            retrieval_context=[_citable(fragment) for fragment in fragments] or None,
            tools_called=[
                ToolCall(
                    name=tool.name,
                    input_parameters=_clean(tool.input_parameters),
                    output=tool.output,
                )
                for tool in tools
            ],
        ),
        metadata=Metadata(
            # Llamadas a modelo, que es la definicion de la especificacion.
            num_interacciones=len(usage),
            agentes_invocados=list(OrderedDict.fromkeys(state.get("agents") or [])),
            tokens=_total(usage),
            tokens_por_agente=_by_agent(usage),
            latencia_ms=latency,
            estado=status,
        ),
    )


def _citable(fragment) -> str:
    """El fragmento con su procedencia delante: la trazabilidad viaja con el texto."""
    return f"[{fragment.doc_id} · {fragment.chunk_id}] {fragment.context or fragment.text}"


def _clean(parameters: dict) -> dict:
    return {key: value for key, value in parameters.items() if value is not None}


def _total(usage: list[Usage]) -> Tokens:
    """La suma de TODAS las capas, no solo la del orquestador."""
    return Tokens(
        input=sum(entry.input for entry in usage),
        output=sum(entry.output for entry in usage),
        total=sum(entry.total for entry in usage),
    )


def _by_agent(usage: list[Usage]) -> list[AgentTokens]:
    """Agrupado por capa y modelo: dos vueltas del mismo agente son una sola fila."""
    grouped: OrderedDict[tuple[str, str], list[int]] = OrderedDict()
    for entry in usage:
        totals = grouped.setdefault((entry.agent, entry.model), [0, 0])
        totals[0] += entry.input
        totals[1] += entry.output
    return [
        AgentTokens(
            agente=agent,
            modelo=model,
            input=tokens_in,
            output=tokens_out,
            total=tokens_in + tokens_out,
        )
        for (agent, model), (tokens_in, tokens_out) in grouped.items()
    ]
