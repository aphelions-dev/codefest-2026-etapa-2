"""Intensidad y tendencia de cada entidad, para el cuadrante de priorizacion.

Las dos son conteos, no un indice compuesto: la intensidad son los documentos que nombran la
entidad, y la tendencia es cuantos de esos documentos son recientes frente a cuantos son antiguos.
El cuadrante no puntua nada, solo coloca cada entidad en el plano que forman esas dos cifras, y el
lector ve las dos por separado.
"""

import asyncpg

ENTITIES = 40


async def by_entity(
    pool: asyncpg.Pool, phenomenon: int | None, split_year: int
) -> list[asyncpg.Record]:
    """Entidades con sus documentos totales, los recientes, los antiguos y una traza.

    `split_year` parte el corpus en dos mitades comparables. Solo entran los documentos con fecha
    conocida: repartir los que no la tienen inventaria la tendencia.
    """
    conditions = ["true"]
    args: list[object] = [split_year]
    if phenomenon is not None:
        args.append(phenomenon)
        conditions.append(f"m.phenomenon = ${len(args)}")

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            with dated as (
                -- Una fila por entidad y documento, con el fragmento mas denso de ese documento:
                -- asi el conteo es de documentos y no de fragmentos, y la traza sigue siendo real.
                select m.entity_id,
                       m.doc_id,
                       d.published_on,
                       (array_agg(m.chunk_id order by m.mentions desc, m.chunk_id))[1] as chunk_id,
                       max(m.mentions)                                                 as mentions
                from entity_mentions m
                join document_dates d using (doc_id)
                where {" and ".join(conditions)}
                group by 1, 2, 3
            )
            select e.entity_id,
                   e.name,
                   e.type,
                   count(*)::int                                                    as documents,
                   count(*) filter (where extract(year from a.published_on) >= $1)::int as recent,
                   count(*) filter (where extract(year from a.published_on) <  $1)::int as earlier,
                   (array_agg(a.doc_id   order by a.mentions desc))[1]              as sample_doc,
                   (array_agg(a.chunk_id order by a.mentions desc))[1]              as sample_chunk
            from dated a
            join entities e using (entity_id)
            group by 1, 2, 3
            order by documents desc
            limit {ENTITIES}
            """,
            *args,
        )


async def median_year(pool: asyncpg.Pool, phenomenon: int | None) -> int | None:
    """El ano que parte en dos el corpus fechado. Se calcula, no se fija: asi el corte sigue al
    corpus en vez de depender de una constante que envejece."""
    phen = "where f.phenomenon = $1" if phenomenon is not None else ""
    args = [phenomenon] if phenomenon is not None else []
    async with pool.acquire() as connection:
        value = await connection.fetchval(
            f"""
            select percentile_disc(0.5) within group (order by extract(year from d.published_on))
            from document_dates d
            join (select distinct doc_id, phenomenon from fragments) f using (doc_id)
            {phen}
            """,
            *args,
        )
    return int(value) if value is not None else None
