"""El documento y sus fragmentos, para el panel de evidencia trazable."""

import asyncpg


async def fetch(pool: asyncpg.Pool, doc_id: str) -> list[asyncpg.Record]:
    async with pool.acquire() as connection:
        return await connection.fetch(
            """
            select doc_id, chunk_id, position, num_tokens, text,
                   title, observatory, phenomenon, language, format
            from fragments
            where doc_id = $1
            order by position
            """,
            doc_id,
        )
