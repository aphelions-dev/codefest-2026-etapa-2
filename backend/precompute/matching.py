"""Busqueda de nombres propios en el texto del corpus, compartida por entidades y lugares.

Las tres reglas que la hacen fiable estan medidas:

- **Sensible a mayusculas.** "Chad", "Jordan" o "Maven" en minuscula son otra palabra.
- **Un unico patron con la forma mas larga primero.** Buscando nombre por nombre, "South Sudan"
  cuenta tambien como Sudan y "United States Space Force" como Space Force.
- **Sin plantillas editoriales.** Un contexto identico repetido en varios documentos es pie de
  imprenta o cabecera, no analisis: el pie de SIPRI ponia a Suecia entre lo mas citado.
"""

import collections
import re
from collections.abc import Iterable, Iterator

# Ventana de texto alrededor de la mencion con la que se reconoce una plantilla.
CONTEXT = 70
# Un mismo contexto en al menos tantos documentos distintos es plantilla y no cuenta.
TEMPLATE_DOCS = 4


def build(forms: dict[str, str], decoys: Iterable[str]) -> re.Pattern[str]:
    """Patron unico. Los senuelos van primero y sin dueno: consumen el texto sin contar."""
    ordered = sorted(decoys, key=len, reverse=True) + sorted(forms, key=len, reverse=True)
    alternatives = "|".join(re.escape(form) for form in ordered)
    return re.compile(rf"(?<![\w-])({alternatives})(?![\w-])")


def find(
    text: str, pattern: re.Pattern[str], forms: dict[str, str], lowercase_ok: set[str] = frozenset()
) -> Iterator[tuple[str, str]]:
    """Cada mencion como (identificador, contexto normalizado)."""
    for match in pattern.finditer(text):
        form = match.group(1)
        target = forms.get(form)
        if target is None:
            continue
        if form != form.lower() and form.lower() not in lowercase_ok and match.group(1) != form:
            continue
        start = max(0, match.start() - CONTEXT)
        context = re.sub(r"\s+", " ", text[start : match.end() + CONTEXT]).strip()
        yield target, context


def drop_templates(
    per_chunk: list[tuple[str, str, int, list[tuple[str, str]]]],
) -> tuple[list[tuple[str, str, str, int, int]], int]:
    """Cuenta menciones por fragmento descartando los contextos que son plantilla."""
    context_docs: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    for doc_id, _chunk, _phen, found in per_chunk:
        for target, context in found:
            context_docs[(target, context)].add(doc_id)
    templates = {key for key, docs in context_docs.items() if len(docs) >= TEMPLATE_DOCS}

    rows: list[tuple[str, str, str, int, int]] = []
    for doc_id, chunk_id, phenomenon, found in per_chunk:
        counts: collections.Counter[str] = collections.Counter()
        for target, context in found:
            if (target, context) not in templates:
                counts[target] += 1
        rows += [(target, doc_id, chunk_id, phenomenon, n) for target, n in counts.items()]
    return rows, len(templates)
