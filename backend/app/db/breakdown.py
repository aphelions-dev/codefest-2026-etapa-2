"""Conteos agrupados por un campo de la metadata.

El campo llega como enumeracion y se interpola en el nombre de la columna, nunca texto del usuario:
una columna no puede ir como parametro de la consulta.
"""

from datetime import date

import asyncpg

from app.db import period
from app.params import BreakdownField


async def by_field(
    pool: asyncpg.Pool,
    field: BreakdownField,
    phenomenon: int | None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[int, int, list[asyncpg.Record]]:
    column = field.value
    args: list[object] = [phenomenon] if phenomenon is not None else []
    where = "where phenomenon = $1" if phenomenon is not None else "where true"
    where += period.documents("fragments.doc_id", date_from, date_to, args)

    async with pool.acquire() as connection:
        totals = await connection.fetchrow(
            f"select count(*) as fragments, count(distinct doc_id) as documents from fragments {where}",
            *args,
        )
        rows = await connection.fetch(
            f"""
            select {column}::text as label,
                   count(*) as fragments,
                   count(distinct doc_id) as documents,
                   (array_agg(doc_id   order by doc_id, position))[1] as sample_doc,
                   (array_agg(chunk_id order by doc_id, position))[1] as sample_chunk
            from fragments
            {where}
            group by {column}
            order by count(*) desc
            """,
            *args,
        )
    return totals["fragments"], totals["documents"], rows
