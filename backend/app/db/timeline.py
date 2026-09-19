"""Documentos por ano y por fuente, la base de la linea de tiempo.

La serie se parte por observatorio y no se deja como un total: un mismo ano puede crecer porque un
solo observatorio publico mucho o porque publicaron todos, y son dos lecturas distintas. Apilado,
el tablero responde a la vez a la tendencia y a la composicion.
"""

import asyncpg

# Observatorios con serie propia. El resto se agrupa: una leyenda de veinte entradas no se lee, y
# las fuentes con dos o tres documentos no forman una tendencia.
TOP_SOURCES = 5
OTHERS = "Otros"


async def by_period(
    pool: asyncpg.Pool, phenomenon: int | None, entity_id: str | None
) -> tuple[list[str], list[dict]]:
    """Las fuentes con serie propia y, por ano, cuantos documentos aporto cada una.

    Agrupado por ano: graficar cada fecha suelta no se lee, y el anexo pide unidades de analisis.
    Solo cuentan los documentos con fecha conocida; el endpoint informa de cuantos quedan fuera en
    vez de repartirlos y falsear la serie.
    """
    conditions = ["true"]
    args: list[object] = []
    if phenomenon is not None:
        args.append(phenomenon)
        conditions.append(f"f.phenomenon = ${len(args)}")
    join = ""
    if entity_id:
        args.append(entity_id)
        join = f"join entity_mentions m on m.doc_id = d.doc_id and m.entity_id = ${len(args)}"

    async with pool.acquire() as connection:
        rows = await connection.fetch(
            f"""
            select extract(year from d.published_on)::int as year,
                   f.observatory                          as source,
                   count(distinct d.doc_id)::int          as documents
            from document_dates d
            join (select distinct doc_id, phenomenon, observatory from fragments) f using (doc_id)
            {join}
            where {" and ".join(conditions)}
            group by 1, 2
            order by 1
            """,
            *args,
        )

    return _stack(rows)


def _stack(rows: list[asyncpg.Record]) -> tuple[list[str], list[dict]]:
    """Filas sueltas (ano, fuente, documentos) a una fila por ano con una columna por serie."""
    totals: dict[str, int] = {}
    for row in rows:
        source = row["source"] or "sin fuente"
        totals[source] = totals.get(source, 0) + row["documents"]

    ranked = sorted(totals, key=lambda source: totals[source], reverse=True)
    named = ranked[:TOP_SOURCES]
    series = [*named, OTHERS] if len(ranked) > TOP_SOURCES else named

    years: dict[int, dict[str, int]] = {}
    for row in rows:
        source = row["source"] or "sin fuente"
        bucket = years.setdefault(row["year"], {})
        key = source if source in named else OTHERS
        bucket[key] = bucket.get(key, 0) + row["documents"]

    points = [
        {
            "year": year,
            "total": sum(bucket.values()),
            "sources": {name: bucket.get(name, 0) for name in series},
        }
        for year, bucket in sorted(years.items())
    ]
    return series, points


async def coverage(pool: asyncpg.Pool, phenomenon: int | None) -> tuple[int, int]:
    """Cuantos documentos tienen fecha y cuantos hay en total."""
    phen = "where phenomenon = $1" if phenomenon is not None else ""
    args = [phenomenon] if phenomenon is not None else []
    async with pool.acquire() as connection:
        total = await connection.fetchval(
            f"select count(distinct doc_id) from fragments {phen}", *args
        )
        dated = await connection.fetchval(
            f"""select count(distinct d.doc_id) from document_dates d
                join (select distinct doc_id, phenomenon from fragments) f using (doc_id)
                {phen.replace("phenomenon", "f.phenomenon")}""",
            *args,
        )
    return dated, total
