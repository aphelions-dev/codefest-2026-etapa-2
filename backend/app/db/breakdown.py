"""Conteos agrupados por un campo de la metadata.

El campo llega como enumeracion y se interpola en el nombre de la columna, nunca texto del usuario:
una columna no puede ir como parametro de la consulta.
"""

import asyncpg

from app.params import BreakdownField


async def by_field(
    pool: asyncpg.Pool, field: BreakdownField, phenomenon: int | None
) -> tuple[int, int, list[asyncpg.Record]]:
    column = field.value
    where = "where phenomenon = $1" if phenomenon is not None else ""
    args = [phenomenon] if phenomenon is not None else []

    async with pool.acquire() as connection:
        totals = await connection.fetchrow(
            f"select count(*) as fragments, count(distinct doc_id) as documents from fragments {where}",
            *args,
        )
        rows = await connection.fetch(
            f"""
            select {column}::text as label,
                   count(*) as fragments,
                   count(distinct doc_id) as documents
            from fragments
            {where}
            group by {column}
            order by count(*) desc
            """,
            *args,
        )
    return totals["fragments"], totals["documents"], rows
