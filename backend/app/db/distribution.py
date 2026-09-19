"""Como se reparte una medida por documento: la tarea de distribucion del anexo (B.2.1).

Dos medidas, las dos conteos directos sobre la metadata: cuantos fragmentos tiene cada documento,
que es su longitud en la unidad del indice, y cuantas entidades distintas nombra. Ninguna se
pondera ni se combina con otra: es un histograma, no un indice.
"""

from datetime import date

import asyncpg

from app.db import period

# Lista cerrada: la medida se interpola como consulta, nunca texto del usuario.
MEASURES = {
    "fragments": "count(*)::int",
    "entities": "(select count(distinct e.entity_id) from entity_mentions e where e.doc_id = f.doc_id)::int",
}


async def per_document(
    pool: asyncpg.Pool,
    measure: str,
    phenomenon: int | None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[asyncpg.Record]:
    """Una fila por documento: su fenomeno, el valor de la medida y su primer fragmento."""
    args: list[object] = []
    where = "true"
    if phenomenon is not None:
        args.append(phenomenon)
        where += f" and f.phenomenon = ${len(args)}"
    where += period.documents("f.doc_id", date_from, date_to, args)

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select f.doc_id,
                   min(f.phenomenon)::int                          as phenomenon,
                   {MEASURES[measure]}                             as value,
                   (array_agg(f.chunk_id order by f.position))[1] as first_chunk
            from fragments f
            where {where}
            group by f.doc_id
            """,
            *args,
        )
