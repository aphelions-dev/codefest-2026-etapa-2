"""Alertas tempranas: por territorio y por ano, separando el riesgo inminente del estructural.

Las dos clases no se suman en una sola cifra: una alerta de inminencia declara una amenaza
inmediata y una estructural, una sostenida en el tiempo. Sumarlas daria un numero que no significa
nada, asi que viajan siempre por separado.

El territorio sale de `place_mentions`, que ya sabe que departamentos nombra cada documento: una
alerta de alcance nacional cuenta en cada departamento que nombra, y eso se declara en la vista.
"""

import asyncpg

KINDS = ("Inminencia", "Estructural")


async def coverage(pool: asyncpg.Pool) -> asyncpg.Record:
    """Cuantas alertas hay de cada clase y que periodo cubren."""
    async with pool.acquire() as connection:
        return await connection.fetchrow(
            """
            select count(*)::int                                        as alerts,
                   count(*) filter (where kind = 'Inminencia')::int     as imminent,
                   count(*) filter (where kind = 'Estructural')::int    as structural,
                   min(issued_on)                                       as since,
                   max(issued_on)                                       as until
            from early_warnings
            """
        )


async def by_territory(pool: asyncpg.Pool, kind: str | None) -> list[asyncpg.Record]:
    """Departamentos con su geometria y cuantas alertas de cada clase los nombran."""
    filtered = "and w.kind = $1" if kind else ""
    args = [kind] if kind else []

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select p.place_id,
                   p.name,
                   p.iso2,
                   p.geometry,
                   count(distinct w.doc_id)::int                                      as alerts,
                   count(distinct w.doc_id) filter (where w.kind = 'Inminencia')::int  as imminent,
                   count(distinct w.doc_id) filter (where w.kind = 'Estructural')::int as structural,
                   max(w.issued_on)                                                    as latest,
                   (array_agg(w.doc_id   order by w.issued_on desc nulls last))[1]     as sample_doc,
                   (array_agg(w.chunk_id order by w.issued_on desc nulls last))[1]     as sample_chunk
            from early_warnings w
            join place_mentions m using (doc_id)
            join places p using (place_id)
            where p.level = 'department' {filtered}
            group by 1, 2, 3, 4
            order by alerts desc
            """,
            *args,
        )


async def by_year(pool: asyncpg.Pool, kind: str | None) -> list[asyncpg.Record]:
    """Alertas emitidas por ano y clase. Solo las que traen fecha de emision."""
    filtered = "and kind = $1" if kind else ""
    args = [kind] if kind else []

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select extract(year from issued_on)::int                          as year,
                   count(*)::int                                              as alerts,
                   count(*) filter (where kind = 'Inminencia')::int           as imminent,
                   count(*) filter (where kind = 'Estructural')::int          as structural
            from early_warnings
            where issued_on is not null {filtered}
            group by 1
            order by 1
            """,
            *args,
        )


async def recent(pool: asyncpg.Pool, kind: str | None, limit: int) -> list[asyncpg.Record]:
    """Las alertas mas recientes, con su codigo y su traza."""
    filtered = "where kind = $1" if kind else ""
    args: list[object] = [kind] if kind else []

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select doc_id, code, kind, issued_on, chunk_id
            from early_warnings
            {filtered}
            order by issued_on desc nulls last
            limit {limit}
            """,
            *args,
        )
