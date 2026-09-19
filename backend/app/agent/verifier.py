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

# Una cita no se reconoce por su envoltorio, sino por lo que nombra. Medido sobre las 50 consultas
# del reto, el redactor escribio el mismo identificador de seis formas distintas: entre corchetes,
# entre parentesis, en negrita de Markdown, con un espacio de ancho cero detras del corchete, con
# "-ch " en vez de "-chunk-" y con corchetes japoneses. Cada vez que el patron no reconocia una, el
# conjunto salia vacio y la comprobacion aprobaba sin mirar nada.
#
# Por eso se invierte: en vez de extraer lo que parece una cita y ver si existe, se recorren los
# identificadores que de verdad se recuperaron y se busca cada uno dentro de la respuesta. El
# envoltorio deja de importar, y la septima forma rara ya no rompe nada.
#
# El patron solo se usa para lo contrario: cazar algo con forma de identificador que no se
# recupero, que es la fabricacion que hay que rechazar.
IDENTIFICADOR = re.compile(r"\b([A-Z]\d-[A-Z]{2,}-\d{2,}(?:-chunk-\d+)?)\b")

# El modelo no escribe el guion ASCII. Medido contra gpt-oss-120b: usa U+2011, el guion no
# separable, y ahi el identificador deja de parecerse al del corpus. Sin normalizar esto, la
# extraccion no encuentra ninguna cita y la comprobacion de trazabilidad pasa sin comprobar nada,
# que es peor que no tenerla, porque parece que la tiene.
DASHES = str.maketrans({dash: "-" for dash in "‐‑‒–—―−­"})
# Espacios que el modelo mete dentro de la cita y que no son el espacio normal.
SPACES = str.maketrans({space: " " for space in "     "})
# Y tampoco escribe siempre el corchete ASCII: medido en produccion, usa los de raya japoneses.
BRACKETS = str.maketrans({"【": "[", "】": "]", "［": "[", "］": "]", "〔": "[", "〕": "]"})

VERDICT_SCHEMA = {
    "type": "object",
    "properties": {"ok": {"type": "boolean"}, "reason": {"type": "string"}},
    "required": ["ok", "reason"],
    "additionalProperties": False,
}


def _normalizar(answer: str) -> str:
    """Deja el texto con guiones, espacios y corchetes ASCII, y sin caracteres invisibles."""
    limpio = answer.translate(DASHES).translate(SPACES).translate(BRACKETS)
    for invisible in ("\u200b", "\u200c", "\u200d", "\ufeff"):
        limpio = limpio.replace(invisible, "")
    return limpio


def conocidos(fragments: list[Fragment]) -> set[str]:
    """Todo lo que se recupero, por documento y por fragmento: cualquiera de los dos vale citarlo."""
    return {f.doc_id for f in fragments} | {f.chunk_id for f in fragments}


def cited(answer: str, fragments: list[Fragment]) -> set[str]:
    """Los identificadores recuperados que aparecen en la respuesta, con el envoltorio que sea."""
    texto = _normalizar(answer)
    return {identificador for identificador in conocidos(fragments) if identificador in texto}


def untraceable(answer: str, fragments: list[Fragment]) -> set[str]:
    """Lo que tiene forma de identificador del corpus y no se recupero.

    Se compara tambien contra el documento del fragmento: citar el chunk es citar su documento.
    """
    disponibles = conocidos(fragments)
    sospechosos = set(IDENTIFICADOR.findall(_normalizar(answer)))
    return {
        s for s in sospechosos if s not in disponibles and s.split("-chunk-")[0] not in disponibles
    }


async def verify(
    client: Client, model: str, answer: str, fragments: list[Fragment]
) -> tuple[bool, str, list[Usage], list[ToolRecord]]:
    """Devuelve si la respuesta se entrega, y por que no cuando se rechaza."""
    referencias = cited(answer, fragments)
    fabricated = untraceable(answer, fragments)
    # Redactar sobre evidencia y no citar nada no es una respuesta valida, y ademas es la unica
    # senal de que la extraccion se ha quedado ciega ante una forma de cita que no reconoce. Sin
    # esta regla el conjunto vacio se lee como "ninguna cita inventada" y la comprobacion aprueba
    # sin haber mirado nada: ha pasado ya tres veces, con el guion no separable, con los espacios
    # dentro de los corchetes y con los corchetes japoneses. Rechazar convierte el proximo caso en
    # un reintento visible en la traza, en vez de en una garantia apagada en silencio.
    sin_citas = bool(fragments) and not referencias

    if fabricated:
        salida = f"citas inventadas: {sorted(fabricated)}"
    elif sin_citas:
        salida = "la respuesta no cita ninguna fuente"
    else:
        salida = f"las {len(referencias)} citas existen"
    tools = [
        ToolRecord(
            name="validate_traceability",
            input_parameters={"answer": answer, "doc_ids": sorted(referencias)},
            output=salida,
        )
    ]
    if fabricated:
        reason = f"la respuesta cita documentos que no se recuperaron: {', '.join(sorted(fabricated))}"
        log.warning("verificacion fallida por trazabilidad", extra={"citas": sorted(fabricated)})
        return False, reason, [], tools
    if sin_citas:
        log.warning("verificacion fallida: ninguna cita reconocible", extra={"fragmentos": len(fragments)})
        return False, "la respuesta no cita ninguna fuente de la evidencia", [], tools

    # Solo la evidencia que la respuesta cita. Para auditar una afirmacion basta el fragmento en
    # que se apoya, y mandar los doce costaba el 41% del presupuesto del sistema: el verificador
    # gastaba casi tanto como el redactor por releer lo que nadie habia usado.
    citados = [f for f in fragments if f.doc_id in referencias or f.chunk_id in referencias]
    evidence = prompts.evidence_block(citados or fragments)
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
                input_parameters={"answer": answer, "evidence": f"{len(citados)} fragmentos citados"},
                output="fiel" if ok else reason or "no fiel",
            ),
            ToolRecord(
                name="detect_injection",
                input_parameters={"answer": answer, "evidence": f"{len(citados)} fragmentos citados"},
                output="sin instrucciones inyectadas" if ok else reason or "posible inyeccion",
            ),
        ]
    )
    if not ok:
        log.warning("verificacion fallida", extra={"motivo": reason})
    return ok, reason, [usage], tools
