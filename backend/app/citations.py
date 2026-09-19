"""Verificación mecánica de citas y orden del contexto.

Los modelos de este tamaño citan bien entre el 68% y el 88% de las veces, y a veces inventan una
referencia plausible. El prompt no lo evita: se comprueba que cada cita exista en la evidencia.
"""

import re

# [F1-CSET-005] o agrupadas: [F2-CSIS-083, F2-CSIS-150]
CITATION_GROUP = re.compile(r"\[((?:\s*F\d-[A-Z0-9]+-\d+\s*[,;]?)+)\]")
DOC_ID = re.compile(r"F\d-[A-Z0-9]+-\d+")

UNVERIFIED = "[cita no verificada]"


def verify(answer: str, evidence: list[dict]) -> dict:
    allowed = {fragment["doc_id"] for fragment in evidence}
    cited = {doc_id for group in CITATION_GROUP.findall(answer) for doc_id in DOC_ID.findall(group)}
    valid = cited & allowed
    fabricated = cited - allowed

    def mark(group: re.Match) -> str:
        ids = DOC_ID.findall(group.group(1))
        return " ".join(f"[{i}]" if i in allowed else UNVERIFIED for i in ids)

    cleaned = CITATION_GROUP.sub(mark, answer)

    return {
        "answer": cleaned,
        "valid": sorted(valid),
        "fabricated": sorted(fabricated),
        "precision": len(valid) / len(cited) if cited else 0.0,
    }


def reorder(fragments: list[dict]) -> list[dict]:
    """Lo más relevante a los extremos (lost in the middle, arXiv 2307.03172): 1, 3, 5, 4, 2."""
    head, tail = fragments[0::2], fragments[1::2]
    return head + tail[::-1]
