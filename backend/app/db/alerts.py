"""Alertas tempranas: por territorio y por ano, separando el riesgo inminente del estructural.

Las dos clases no se suman en una sola cifra: una alerta de inminencia declara una amenaza
inmediata y una estructural, una sostenida en el tiempo. Sumarlas daria un numero que no significa
nada, asi que viajan siempre por separado.

El territorio sale de `place_mentions`, que ya sabe que departamentos nombra cada documento: una
alerta de alcance nacional cuenta en cada departamento que nombra, y eso se declara en la vista.

Una alerta es un documento del corpus, asi que el filtro global por entidad tambien la recorta.
"""

import asyncpg

KINDS = ("Inminencia", "Estructural")


def _entity_join(entity_id: str | None, args: list[object]) -> str:
    """El cruce con las menciones de entidad, cuando hay filtro global puesto."""
    if not entity_id:
        return ""
    args.append(entity_id)
    return f"join entity_mentions e on e.doc_id = w.doc_id and e.entity_id = ${len(args)}"


async def coverage(pool: asyncpg.Pool, entity_id: str | None = None) -> asyncpg.Record:
    """Cuantas alertas hay de cada clase y que periodo cubren."""
    args: list[object] = []
    join = _entity_join(entity_id, args)

    async with pool.acquire() as connection:
        return await connection.fetchrow(
            f"""
            select count(distinct w.doc_id)::int                                      as alerts,
                   count(distinct w.doc_id) filter (where w.kind = 'Inminencia')::int  as imminent,
                   count(distinct w.doc_id) filter (where w.kind = 'Estructural')::int as structural,
                   min(w.issued_on)                                                    as since,
                   max(w.issued_on)                                                    as until
            from early_warnings w
            {join}
            """,
            *args,
        )


async def by_territory(
    pool: asyncpg.Pool, kind: str | None, entity_id: str | None = None
) -> list[asyncpg.Record]:
    """Departamentos con su geometria y cuantas alertas de cada clase los nombran."""
    conditions = ["p.level = 'department'"]
    args: list[object] = []
    if kind:
        args.append(kind)
        conditions.append(f"w.kind = ${len(args)}")
    join = _entity_join(entity_id, args)

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
            {join}
            where {" and ".join(conditions)}
            group by 1, 2, 3, 4
            order by alerts desc
            """,
            *args,
        )


async def by_year(
    pool: asyncpg.Pool, kind: str | None, entity_id: str | None = None
) -> list[asyncpg.Record]:
    """Alertas emitidas por ano y clase. Solo las que traen fecha de emision."""
    conditions = ["w.issued_on is not null"]
    args: list[object] = []
    if kind:
        args.append(kind)
        conditions.append(f"w.kind = ${len(args)}")
    join = _entity_join(entity_id, args)

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select extract(year from w.issued_on)::int                                as year,
                   count(distinct w.doc_id)::int                                      as alerts,
                   count(distinct w.doc_id) filter (where w.kind = 'Inminencia')::int  as imminent,
                   count(distinct w.doc_id) filter (where w.kind = 'Estructural')::int as structural
            from early_warnings w
            {join}
            where {" and ".join(conditions)}
            group by 1
            order by 1
            """,
            *args,
        )


async def recent(
    pool: asyncpg.Pool, kind: str | None, limit: int, entity_id: str | None = None
) -> list[asyncpg.Record]:
    """Las alertas mas recientes, con su codigo y su traza."""
    conditions = ["true"]
    args: list[object] = []
    if kind:
        args.append(kind)
        conditions.append(f"w.kind = ${len(args)}")
    join = _entity_join(entity_id, args)

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select distinct w.doc_id, w.code, w.kind, w.issued_on, w.chunk_id
            from early_warnings w
            {join}
            where {" and ".join(conditions)}
            order by w.issued_on desc nulls last
            limit {limit}
            """,
            *args,
        )
