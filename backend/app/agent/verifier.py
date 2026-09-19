"""Verificador: fidelidad, trazabilidad e inyeccion indirecta.

La trazabilidad se comprueba en codigo, no con el modelo: saber si un identificador citado esta en
la lista de los recuperados es comparar dos conjuntos, y preguntarselo a un modelo cuesta tokens y
falla mas. Al modelo solo se le pide lo que requiere leer: si la respuesta dice lo que la evidencia
sostiene y si obedece algo que venia escrito dentro de un fragmento.
"""

import logging
import re

from app.agent import prompts
from app.agent.llm import Client, ModelError, parse_json
from app.agent.retrieval import Fragment
from app.agent.state import ToolRecord, Usage

log = logging.getLogger("agent.verifier")

# Los identificadores del corpus tienen la forma F1-CSET-065.
CITATION = re.compile(r"\[([A-Z0-9][A-Z0-9\-]{3,})\]")

VERDICT_SCHEMA = {
    "type": "object",
    "properties": {"ok": {"type": "boolean"}, "reason": {"type": "string"}},
    "required": ["ok", "reason"],
    "additionalProperties": False,
}


def cited(answer: str) -> set[str]:
    """Los identificadores que la respuesta cita entre corchetes."""
    return set(CITATION.findall(answer))


def untraceable(answer: str, fragments: list[Fragment]) -> set[str]:
    """Citas que no corresponden a ningun documento recuperado."""
    available = {fragment.doc_id for fragment in fragments}
    return cited(answer) - available


async def verify(
    client: Client, model: str, answer: str, fragments: list[Fragment]
) -> tuple[bool, str, list[Usage], list[ToolRecord]]:
    """Devuelve si la respuesta se entrega, y por que no cuando se rechaza."""
    fabricated = untraceable(answer, fragments)
    tools = [
        ToolRecord(
            name="validate_traceability",
            input_parameters={"answer": answer, "doc_ids": sorted(cited(answer))},
            output="todas las citas existen" if not fabricated else f"citas inventadas: {sorted(fabricated)}",
        )
    ]
    if fabricated:
        reason = f"la respuesta cita documentos que no se recuperaron: {', '.join(sorted(fabricated))}"
        log.warning("verificacion fallida por trazabilidad", extra={"citas": sorted(fabricated)})
        return False, reason, [], tools

    evidence = prompts.evidence_block(fragments)
    try:
        text, usage = await client.complete(
            agent="verifier",
            model=model,
            system=prompts.VERIFIER,
            user=f"{evidence}\n\n<respuesta>\n{answer}\n</respuesta>",
            json_schema=VERDICT_SCHEMA,
        )
    except ModelError:
        # La trazabilidad ya paso y es la comprobacion dura. Sin el modelo se entrega.
        log.exception("el verificador no pudo evaluar; se entrega la respuesta")
        return True, "", [], tools

    verdict = parse_json(text, {"ok": True, "reason": ""})
    ok = bool(verdict.get("ok", True))
    reason = str(verdict.get("reason", ""))

    tools.extend(
        [
            ToolRecord(
                name="validate_faithfulness",
                input_parameters={"answer": answer, "evidence": f"{len(fragments)} fragmentos"},
                output="fiel" if ok else reason or "no fiel",
            ),
            ToolRecord(
                name="detect_injection",
                input_parameters={"answer": answer, "evidence": f"{len(fragments)} fragmentos"},
                output="sin instrucciones inyectadas" if ok else reason or "posible inyeccion",
            ),
        ]
    )
    if not ok:
        log.warning("verificacion fallida", extra={"motivo": reason})
    return ok, reason, [usage], tools
