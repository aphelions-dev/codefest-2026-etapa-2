"""Guardianes de entrada y de salida.

Los dos son del modelo barato y los dos fallan cerrado hacia el lado util: si el proxy no responde
o devuelve algo que no se puede leer, se deja pasar y la defensa queda en las otras dos capas. Un
guardian que convierte una caida del proxy en un bloqueo generalizado tumba la demo entera.
"""

import logging

from app.agent import prompts
from app.agent.llm import Client, ModelError, parse_json
from app.agent.state import ToolRecord, Usage

log = logging.getLogger("agent.guardrails")

ATTACK_SCHEMA = {
    "type": "object",
    "properties": {"attack": {"type": "boolean"}, "reason": {"type": "string"}},
    "required": ["attack", "reason"],
    "additionalProperties": False,
}

SAFE_SCHEMA = {
    "type": "object",
    "properties": {"safe": {"type": "boolean"}, "reason": {"type": "string"}},
    "required": ["safe", "reason"],
    "additionalProperties": False,
}


async def check_input(
    client: Client, model: str, message: str
) -> tuple[bool, str, list[Usage], list[ToolRecord]]:
    """Devuelve si la consulta puede seguir, y el motivo cuando no.

    El motivo se registra y se devuelve para el log, nunca para la respuesta: decirle al atacante
    que regla salto es ensenarle cual es el siguiente intento.
    """
    try:
        text, usage = await client.complete(
            agent="input_guardrail",
            model=model,
            system=prompts.INPUT_GUARDRAIL,
            user=message,
            json_schema=ATTACK_SCHEMA,
        )
    except ModelError:
        log.exception("el guardian de entrada no pudo evaluar; se deja pasar")
        return True, "", [], []

    verdict = parse_json(text, {"attack": False, "reason": ""})
    attack = bool(verdict.get("attack"))
    reason = str(verdict.get("reason", ""))

    tools = [
        ToolRecord(
            name="analyze_prompt_injection",
            input_parameters={"message": message},
            output="ataque" if attack else "limpio",
        )
    ]
    if attack:
        log.warning("consulta bloqueada en la entrada", extra={"motivo": reason})
    else:
        tools.append(
            ToolRecord(
                name="filter_input",
                input_parameters={"message": message, "verdict": "limpio"},
                output=message,
            )
        )
    return not attack, reason, [usage], tools


async def check_output(
    client: Client, model: str, answer: str
) -> tuple[bool, str, list[Usage], list[ToolRecord]]:
    """Ultima inspeccion: toxicidad y obediencia a instrucciones que venian en la evidencia."""
    try:
        text, usage = await client.complete(
            agent="output_guardrail",
            model=model,
            system=prompts.OUTPUT_GUARDRAIL,
            user=answer,
            json_schema=SAFE_SCHEMA,
        )
    except ModelError:
        log.exception("el guardian de salida no pudo evaluar; se entrega la respuesta")
        return True, "", [], []

    verdict = parse_json(text, {"safe": True, "reason": ""})
    safe = bool(verdict.get("safe", True))
    reason = str(verdict.get("reason", ""))

    tools = [
        ToolRecord(
            name="analyze_response_toxicity",
            input_parameters={"answer": answer},
            output="segura" if safe else "bloqueada",
        ),
        ToolRecord(
            name="detect_indirect_injection",
            input_parameters={"answer": answer},
            output="sin rastro" if safe else reason or "rastro de inyeccion",
        ),
    ]
    if not safe:
        log.warning("respuesta bloqueada en la salida", extra={"motivo": reason})
    return safe, reason, [usage], tools
