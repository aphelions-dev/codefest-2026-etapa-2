"""Lugares con su conteo y su geometria, para el mapa coropletico."""

from datetime import date

import asyncpg

from app.db import period


async def by_level(
    pool: asyncpg.Pool,
    level: str,
    phenomenon: int | None,
    limit: int,
    entity_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[asyncpg.Record]:
    """Solo los lugares que el corpus nombra: pintar 242 paises en blanco no informa de nada.

    Con `entity_id`, solo los documentos que ademas nombran esa entidad: es el filtro global que
    una seleccion en otra vista propaga al mapa. Con periodo, solo los documentos fechados dentro.
    """
    conditions = ["p.level = $1"]
    args: list[object] = [level]
    if phenomenon is not None:
        args.append(phenomenon)
        conditions.append(f"m.phenomenon = ${len(args)}")
    join = ""
    if entity_id:
        args.append(entity_id)
        join = (
            "join entity_mentions e on e.doc_id = m.doc_id "
            f"and e.entity_id = ${len(args)}"
        )
    dated = period.documents("m.doc_id", date_from, date_to, args)

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select p.place_id, p.name, p.iso2, p.lon, p.lat, p.geometry,
                   count(distinct m.doc_id)::int as documents,
                   sum(m.mentions)::int          as mentions,
                   (array_agg(m.doc_id   order by m.mentions desc))[1] as sample_doc,
                   (array_agg(m.chunk_id order by m.mentions desc))[1] as sample_chunk
            from place_mentions m
            join places p using (place_id)
            {join}
            where {" and ".join(conditions)}{dated}
            group by 1, 2, 3, 4, 5, 6
            order by documents desc
            limit {limit}
            """,
            *args,
        )


async def by_id(pool: asyncpg.Pool, place_id: str) -> asyncpg.Record | None:
    """Un territorio por su identificador; `None` si no existe."""
    async with pool.acquire() as connection:
        return await connection.fetchrow(
            "select place_id, name, level, iso2, forms from places where place_id = $1", place_id
        )
