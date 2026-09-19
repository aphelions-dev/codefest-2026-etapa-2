"""Menciones de entidades por fragmento: lo que alimenta la matriz de calor y el grafo.

    uv run --env-file ../.env python -m precompute.entities

Tres filtros, los tres necesarios y medibles:

- **Sensible a mayusculas.** "Maven", "Galileo" o "Sentinel" en minuscula son otra cosa; solo los
  terminos que el corpus escribe en minuscula por convencion se marcan como tal.
- **Un unico patron con la forma mas larga primero.** Buscando entidad por entidad, "Space Force"
  contaria tambien dentro de "United States Space Force" y el conteo se duplica.
- **Sin plantillas editoriales.** Un contexto de mencion identico repetido en muchos documentos es
  pie de imprenta o cabecera, no analisis, y no cuenta.
"""

import asyncio
import collections
import os
import re
import unicodedata

import asyncpg

from app.db.schema import SCHEMA
from precompute.gazetteer import DECOYS, ENTITIES

# Ventana de texto alrededor de la mencion con la que se detecta una plantilla.
CONTEXT = 70
# Un mismo contexto en mas documentos que esto es plantilla del editor, no una mencion util.
TEMPLATE_DOCS = 4
# Terminos que el corpus escribe en minuscula: para estos la busqueda ignora las mayusculas.
LOWERCASE_OK = {"machine learning", "large language model", "computer vision", "autonomous weapon",
                "remote sensing", "lethal autonomous weapon", "geostationary orbit"}


def slug(name: str) -> str:
    plain = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")


def build_pattern() -> tuple[re.Pattern[str], dict[str, str]]:
    """Un patron con todas las formas, la mas larga primero, y el mapa forma -> entidad."""
    owner: dict[str, str] = {}
    forms: list[str] = []
    for name, _type, variants in ENTITIES:
        for form in variants:
            owner[form] = slug(name)
            forms.append(form)

    # Los senuelos entran primero y sin dueno: consumen el texto y la mencion no cuenta.
    ordered = sorted(DECOYS, key=len, reverse=True) + sorted(forms, key=len, reverse=True)
    pattern = "|".join(re.escape(form) for form in ordered)
    return re.compile(rf"(?<![\w-])({pattern})(?![\w-])"), owner


def matches(text: str, pattern: re.Pattern[str], owner: dict[str, str]):
    """Cada mencion con su contexto, saltando senuelos y respetando las mayusculas."""
    for match in pattern.finditer(text):
        form = match.group(1)
        entity = owner.get(form)
        if entity is None:
            continue  # senuelo
        if form.lower() in LOWERCASE_OK or form == form.lower():
            pass  # el corpus lo escribe en minuscula
        elif match.group(1) != form:
            continue
        start = max(0, match.start() - CONTEXT)
        context = text[start : match.end() + CONTEXT]
        yield entity, re.sub(r"\s+", " ", context).strip()


async def main() -> None:
    pattern, owner = build_pattern()
    connection = await asyncpg.connect(os.environ["DATABASE_URL"])
    await connection.execute(SCHEMA)
    await connection.execute("truncate entity_mentions")
    await connection.execute("delete from entities")
    await connection.executemany(
        "insert into entities (entity_id, name, type) values ($1, $2, $3)",
        [(slug(name), name, kind) for name, kind, _ in ENTITIES],
    )

    rows = await connection.fetch("select doc_id, chunk_id, phenomenon, text from fragments")
    print(f"{len(rows):,} fragmentos")

    # Primera pasada: contar en cuantos documentos distintos aparece cada contexto.
    context_docs: dict[tuple[str, str], set[str]] = collections.defaultdict(set)
    per_chunk: list[tuple[str, str, int, list[tuple[str, str]]]] = []
    for row in rows:
        found = list(matches(row["text"], pattern, owner))
        if not found:
            continue
        per_chunk.append((row["doc_id"], row["chunk_id"], row["phenomenon"], found))
        for entity, context in found:
            context_docs[(entity, context)].add(row["doc_id"])

    templates = {key for key, docs in context_docs.items() if len(docs) >= TEMPLATE_DOCS}

    # Segunda pasada: contar menciones descartando las plantillas.
    mentions: list[tuple[str, str, str, int, int]] = []
    for doc_id, chunk_id, phenomenon, found in per_chunk:
        counts: collections.Counter[str] = collections.Counter()
        for entity, context in found:
            if (entity, context) in templates:
                continue
            counts[entity] += 1
        mentions += [
            (entity, doc_id, chunk_id, phenomenon, count) for entity, count in counts.items()
        ]

    await connection.executemany(
        """insert into entity_mentions (entity_id, doc_id, chunk_id, phenomenon, mentions)
           values ($1, $2, $3, $4, $5)""",
        mentions,
    )

    covered = await connection.fetchval("select count(distinct doc_id) from entity_mentions")
    total_docs = await connection.fetchval("select count(distinct doc_id) from fragments")
    print(f"{len(mentions):,} menciones en {covered:,} de {total_docs:,} documentos "
          f"({covered / total_docs:.0%})")
    print(f"{len(templates):,} contextos descartados por plantilla")
    top = await connection.fetch(
        """select e.name, e.type, sum(m.mentions) as total, count(distinct m.doc_id) as docs
           from entity_mentions m join entities e using (entity_id)
           group by 1, 2 order by docs desc limit 12"""
    )
    for row in top:
        print(f"  {row['name']:<34} {row['type']:<20} {row['docs']:>5} doc  {row['total']:>7} menciones")
    await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
