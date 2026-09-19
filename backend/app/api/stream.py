"""La misma pregunta que `POST /chat`, contada mientras ocurre.

`POST /chat/stream` corre **el mismo grafo** —con el mismo enrutado, los mismos agentes y el mismo
gasto— y emite por Server-Sent Events cada nodo en cuanto termina, para que el chat enseñe el
razonamiento en vivo en vez de un indicador mudo. Con la ruta `both`, el visualizador y el analista
corren en paralelo y sus eventos llegan intercalados: el tablero puede aplicar los componentes
elegidos antes de que el texto este redactado.

No cambia nada de lo que responde: el ultimo evento es la respuesta completa, armada por la misma
funcion que `POST /chat` y con el contrato de la §2.4. `POST /chat` sigue siendo el endpoint que
se evalua.

Eventos:

- `step`: un nodo termino; trae su nombre, los agentes, sus herramientas y su gasto.
- `result`: la respuesta final, identica a la de `POST /chat`.
"""

import json
import logging
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.agent import prompts
from app.agent.graph import BLOCKED_INPUT, INTERNAL_ERROR
from app.agent.state import ToolRecord
from app.api.chat import Agent, _assemble, _question

log = logging.getLogger("agent.stream")

router = APIRouter()


@router.post(
    "/chat/stream",
    summary="La pregunta al asistente, contada en vivo",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
async def chat_stream(request: Request, agent: Agent) -> StreamingResponse:
    graph, _ = agent
    question = await _question(request)
    return StreamingResponse(
        _events(graph, question),
        media_type="text/event-stream",
        # Sin cache ni buffer en el proxy: cada evento tiene que salir en cuanto se emite.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _events(graph, question: str) -> AsyncIterator[str]:
    started = time.perf_counter()
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
    except Exception:
        # El mismo ultimo recinto que `POST /chat`: se responde con el contrato, declarado.
        log.exception("la consulta en vivo fallo sin que ningun nodo lo atrapase")
        final = {"answer": prompts.FAILED, "status": INTERNAL_ERROR}

    latency = int((time.perf_counter() - started) * 1000)
    yield _event("result", _assemble(question, final, latency).model_dump(mode="json"))


def _step(node: str, update: dict) -> dict:
    """Lo que el nodo acaba de hacer, en la forma de la respuesta final.

    Una entrada bloqueada no revela que herramientas la detectaron, igual que en `POST /chat`.
    """
    blocked = update.get("status") == BLOCKED_INPUT
    records: list[ToolRecord] = update.get("tools") or []
    return {
        "node": node,
        "agents": list(dict.fromkeys(update.get("agents") or [])),
        "tools": [] if blocked else [_tool(record) for record in records],
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
