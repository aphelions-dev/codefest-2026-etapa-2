"""Lugares con su conteo y su geometria, para el mapa coropletico."""

import asyncpg


async def by_level(
    pool: asyncpg.Pool, level: str, phenomenon: int | None, limit: int
) -> list[asyncpg.Record]:
    """Solo los lugares que el corpus nombra: pintar 242 paises en blanco no informa de nada."""
    phen = "and m.phenomenon = $2" if phenomenon is not None else ""
    args: list[object] = [level]
    if phenomenon is not None:
        args.append(phenomenon)

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select p.place_id, p.name, p.lon, p.lat, p.geometry,
                   count(distinct m.doc_id)::int as documents,
                   sum(m.mentions)::int          as mentions,
                   (array_agg(m.doc_id   order by m.mentions desc))[1] as sample_doc,
                   (array_agg(m.chunk_id order by m.mentions desc))[1] as sample_chunk
            from place_mentions m
            join places p using (place_id)
            where p.level = $1 {phen}
            group by 1, 2, 3, 4, 5
            order by documents desc
            limit {limit}
            """,
            *args,
        )
