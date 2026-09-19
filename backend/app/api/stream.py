"""La misma pregunta que `POST /chat`, contada mientras ocurre y con sus visualizaciones.

`POST /chat/stream` corre el mismo grafo y emite, por Server-Sent Events, cada agente en cuanto
termina: el tablero y el chat enseñan el progreso en vivo en vez de un indicador mudo. El ultimo
evento es la respuesta completa, con el mismo contrato de la §2.4 que devuelve `POST /chat`.

Aqui, y solo aqui, corre ademas el agente de visualizaciones, **en paralelo** al grafo: decide los
componentes del tablero mientras el analista busca y redacta, asi que no suma latencia. El
`POST /chat` que evalua el Reto 1 queda intacto: ni un token ni un milisegundo mas.

Eventos:

- `step`: un agente termino; trae su nombre, sus herramientas y su gasto.
- `visualization`: los componentes que eligio el visualizador, en cuanto los tiene.
- `result`: la respuesta final, con el contrato de `POST /chat`.
"""

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agent import prompts
from app.agent.graph import BLOCKED_INPUT, INTERNAL_ERROR
from app.agent.state import ToolRecord, Usage
from app.agent.visualizer import AGENT as VISUALIZER
from app.api.chat import Agent, _assemble, _question

log = logging.getLogger("agent.stream")

router = APIRouter()


@router.post(
    "/chat/stream",
    summary="La pregunta al asistente, en vivo y con las visualizaciones que la responden",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def chat_stream(request: Request, agent: Agent) -> StreamingResponse:
    graph, _ = agent
    question = await _question(request)
    visualize = await _wants_visualizations(request)
    visualizer = getattr(request.app.state, "visualizer", None) if visualize else None
    return StreamingResponse(
        _events(graph, visualizer, question),
        media_type="text/event-stream",
        # Sin cache ni buffer en el proxy: cada evento tiene que salir en cuanto se emite.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _events(graph, visualizer, question: str) -> AsyncIterator[str]:
    started = time.perf_counter()
    plan = asyncio.create_task(visualizer.plan(question)) if visualizer else None
    records: list[ToolRecord] = []
    spent: list[Usage] = []
    announced = False
    final: dict = {}

    try:
        async for mode, chunk in graph.astream(
            {"question": question, "retries": 0, "usage": [], "tools": [], "agents": []},
            stream_mode=["updates", "values"],
        ):
            if mode == "values":
                final = chunk
                continue
            for node, update in chunk.items():
                yield _event("step", _step(node, update or {}))
            # Las visualizaciones salen en cuanto estan, aunque el analista siga redactando.
            if plan and plan.done() and not announced:
                records, spent = _collected(plan)
                announced = True
                if records and final.get("status") != BLOCKED_INPUT:
                    yield _event("visualization", {"tools": [_tool(record) for record in records]})
    except Exception:
        log.exception("la consulta en vivo fallo sin que ningun nodo lo atrapase")
        final = {"answer": prompts.FAILED, "status": INTERNAL_ERROR}

    if plan and not announced:
        if final.get("status") == BLOCKED_INPUT:
            # Una pregunta bloqueada no activa nada: lo que haya decidido el visualizador se tira.
            plan.cancel()
        else:
            try:
                records, spent = await plan
            except Exception:
                log.exception("el visualizador fallo")
                records, spent = [], []
            if records:
                yield _event("visualization", {"tools": [_tool(record) for record in records]})
    if final.get("status") == BLOCKED_INPUT:
        records, spent = [], []

    merged = {
        **final,
        "tools": [*(final.get("tools") or []), *records],
        "usage": [*(final.get("usage") or []), *spent],
        "agents": [*(final.get("agents") or []), *([VISUALIZER] if spent else [])],
    }
    latency = int((time.perf_counter() - started) * 1000)
    response = _assemble(question, merged, latency)
    yield _event("result", response.model_dump(mode="json"))


def _collected(plan: asyncio.Task) -> tuple[list[ToolRecord], list[Usage]]:
    try:
        return plan.result()
    except Exception:
        log.exception("el visualizador fallo")
        return [], []


async def _wants_visualizations(request: Request) -> bool:
    """`visualize: false` en el JSON apaga el visualizador; por defecto esta encendido."""
    try:
        payload = json.loads(await request.body())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return True
    return not (isinstance(payload, dict) and payload.get("visualize") is False)


def _step(node: str, update: dict) -> dict:
    """Lo que el nodo acaba de hacer, en la forma de la respuesta final.

    Una entrada bloqueada no revela que herramientas la detectaron, igual que en `POST /chat`.
    """
    blocked = update.get("status") == BLOCKED_INPUT
    return {
        "node": node,
        "agents": list(dict.fromkeys(update.get("agents") or [])),
        "tools": [] if blocked else [_tool(record) for record in update.get("tools") or []],
        "tokens": [
            {"agente": usage.agent, "modelo": usage.model, "total": usage.total}
            for usage in update.get("usage") or []
        ],
        "status": update.get("status"),
    }


def _tool(record: ToolRecord) -> dict:
    parameters = {key: value for key, value in record.input_parameters.items() if value is not None}
    return {"name": record.name, "input_parameters": parameters, "output": record.output}


def _event(name: str, data: dict) -> str:
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
