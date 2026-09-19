"""Genera `agent_card.json` desde la declaracion de agentes.

La ficha se genera, no se escribe: escrita a mano miente a la tercera semana, y el campo `modelo`
tiene que ser el identificador exacto que expone el proxy, no el que suponemos.

    PYTHONUTF8=1 uv run python -m scripts.agent_card

Falla si `FAST_MODEL` o `DEEP_MODEL` no estan configurados, y comprueba contra `GET /v1/models`
que existen cuando hay clave: una ficha con un modelo inventado es una ficha equivocada.
"""

import asyncio
import json
import pathlib
import sys

from app.agent.llm import Client
from app.agent.tools import ORCHESTRATOR, SUBAGENTS, Agent
from app.config import settings

CARD = pathlib.Path(__file__).resolve().parents[2] / "agent_card.json"

ENDPOINT = "https://agent.aphelion.codefest2026.augusta.avaldigitallabs.com/chat"
PROVIDER = "LiteLLM (Amazon Bedrock)"

NOMBRE = "Radar Estrategico de Tendencias Aeroespaciales"
DESCRIPCION = (
    "Asistente conversacional que responde sobre inteligencia artificial en entornos militares, "
    "seguridad del entorno espacial y dinamicas territoriales en America Latina, con evidencia "
    "del corpus trazable hasta su doc_id y su chunk_id."
)


def model_for(agent: Agent) -> str:
    return settings.deep_model if agent.tier == "deep" else settings.fast_model


def as_card(agent: Agent, *, subagent: bool) -> dict:
    """El orden de las claves es el de la especificacion: la ficha se lee con los ojos."""
    identity = {"id": agent.id} if subagent else {}
    activation = (
        {
            "activado_por": "orquestador",
            "ejemplos_de_activacion": list(agent.ejemplos_de_activacion),
        }
        if subagent
        else {}
    )
    return {
        **identity,
        "nombre": agent.nombre,
        "descripcion": agent.descripcion,
        "modelo": model_for(agent),
        "proveedor": PROVIDER,
        **activation,
        "tools": [tool.as_card() for tool in agent.tools],
    }


def build() -> dict:
    return {
        "agente": {
            "nombre": NOMBRE,
            "descripcion": DESCRIPCION,
            "version": "1.0.0",
            "endpoint": ENDPOINT,
            "input_modes": ["text/plain"],
            "output_modes": ["application/json"],
        },
        "orquestador": as_card(ORCHESTRATOR, subagent=False),
        "subagentes": [as_card(agent, subagent=True) for agent in SUBAGENTS],
    }


async def verify_models() -> None:
    """Comprueba contra el proxy que los dos identificadores existen de verdad."""
    if not (settings.litellm_base_url and settings.litellm_api_key):
        print("aviso: sin proxy configurado, no se pudo verificar contra GET /v1/models")
        return
    client = Client.open(settings)
    try:
        available = await client.models()
    finally:
        await client.close()
    missing = {settings.fast_model, settings.deep_model} - set(available)
    if missing:
        sys.exit(f"el proxy no expone {sorted(missing)}. Disponibles: {sorted(available)}")
    print(f"modelos verificados contra el proxy: {settings.fast_model}, {settings.deep_model}")


def main() -> None:
    if not (settings.fast_model and settings.deep_model):
        sys.exit("FAST_MODEL y DEEP_MODEL tienen que ser los identificadores que expone el proxy")
    asyncio.run(verify_models())
    CARD.write_text(json.dumps(build(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"escrito {CARD}")


if __name__ == "__main__":
    main()
