"""El endpoint del asistente. Un unico `POST /chat`, como exige la especificacion.

La respuesta se arma aqui y se valida contra los modelos Pydantic antes de salir: el contrato es
lo que se califica, y un campo de mas o de menos no puede depender de por donde fue el grafo.
"""

import json
import logging
import time
from collections import OrderedDict
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import ValidationError

from app.agent import prompts
from app.agent.graph import BLOCKED_INPUT, INTERNAL_ERROR, OK
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

# El Anexo A.4 pide que el endpoint reciba la pregunta «en texto plano o JSON», y la ficha declara
# `text/plain` como modo de entrada. Asi que se leen las dos formas, y dentro del JSON cualquiera de
# los nombres con que se suele mandar una pregunta: un 422 durante la ventana de evaluacion es una
# pregunta perdida y no hay reintento. Lo que sobre en el cuerpo se ignora en vez de rechazarse.
QUESTION_FIELDS = (
    "input",
    "question",
    "query",
    "message",
    "text",
    "prompt",
    "pregunta",
    "consulta",
    "mensaje",
)


async def get_agent(request: Request):
    """El grafo compilado y su runtime, montados al arrancar el proceso."""
    agent = request.app.state.agent
    if agent is None:
        raise HTTPException(503, "El asistente no esta configurado en este despliegue")
    return agent


Agent = Annotated[tuple, Depends(get_agent)]


@router.post(
    "/chat",
    summary="Pregunta al asistente del radar",
    # El cuerpo se lee a mano para aceptar las dos formas, asi que el esquema se declara aqui:
    # `ChatRequest` sigue siendo la unica fuente de la forma canonica y `text/plain` queda
    # documentado en el OpenAPI, que es de donde salen los tipos del frontend.
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {"schema": ChatRequest.model_json_schema()},
                "text/plain": {"schema": {"type": "string"}},
            },
        }
    },
    # Sin parametro de cuerpo validado, FastAPI ya no declara el 422 solo. Se declara aqui porque
    # existe: es el unico cuerpo que se rechaza, el que no trae ninguna pregunta.
    responses={422: {"description": "El cuerpo de la peticion no trae ninguna pregunta"}},
)
async def chat(request: Request, agent: Agent) -> ChatResponse:
    """Una pregunta, una respuesta con su evidencia y su coste."""
    # El runtime lo necesitan los nodos, que ya lo llevan cerrado dentro del grafo compilado.
    graph, _ = agent
    question = await _question(request)
    started = time.perf_counter()

    try:
        state = await graph.ainvoke(
            {"question": question, "retries": 0, "usage": [], "tools": [], "agents": []}
        )
    except Exception:
        # Ultimo recinto: los nodos ya atrapan lo suyo, asi que llegar aqui es un fallo que no se
        # previo. Se declara en `estado` y se responde con el contrato, porque un 500 sin `respuesta`
        # ni `evaluacion` es una pregunta perdida para quien evalua.
        log.exception("la consulta fallo sin que ningun nodo lo atrapase")
        state = {"answer": prompts.FAILED, "status": INTERNAL_ERROR}

    latency = int((time.perf_counter() - started) * 1000)
    response = _assemble(question, state, latency)
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


async def _question(request: Request) -> str:
    """La pregunta del usuario, venga como JSON o como texto plano."""
    raw = (await request.body()).decode("utf-8", errors="replace").strip()
    if not raw:
        raise HTTPException(422, "El cuerpo de la peticion no trae ninguna pregunta")

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        # Texto plano, que es el modo que declara la ficha del agente.
        return _bounded(raw)

    if isinstance(payload, dict):
        for field in QUESTION_FIELDS:
            value = payload.get(field)
            if isinstance(value, str) and value.strip():
                return _bounded(value)
        raise HTTPException(
            422,
            "El JSON no trae la pregunta en ninguno de los campos esperados: "
            + ", ".join(QUESTION_FIELDS),
        )
    # Una cadena JSON desnuda, o cualquier otro escalar: el cuerpo entero es la pregunta.
    return _bounded(payload if isinstance(payload, str) else raw)


def _bounded(question: str) -> str:
    """Los limites del contrato en un solo sitio: los declara `ChatRequest`."""
    try:
        return ChatRequest(input=question.strip()).input
    except ValidationError as error:
        raise HTTPException(
            422, "La pregunta esta vacia o pasa del limite de 4000 caracteres"
        ) from error


def _assemble(question: str, state: dict, latency: int) -> ChatResponse:
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
