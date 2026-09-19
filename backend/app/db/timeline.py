"""Documentos por periodo, la base de la linea de tiempo."""

import asyncpg


async def by_period(
    pool: asyncpg.Pool, phenomenon: int | None, entity_id: str | None
) -> list[asyncpg.Record]:
    """Agrupado por ano: graficar cada fecha suelta no se lee, y el anexo pide unidades de analisis.

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
        return await connection.fetch(
            f"""
            select extract(year from d.published_on)::int as year,
                   count(distinct d.doc_id)::int          as documents
            from document_dates d
            join (select distinct doc_id, phenomenon from fragments) f using (doc_id)
            {join}
            where {" and ".join(conditions)}
            group by 1
            order by 1
            """,
            *args,
        )


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
