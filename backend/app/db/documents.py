"""El documento y sus fragmentos, en orden y por ventanas, para la evidencia trazable.

El corpus original no viaja con la aplicacion: un documento es exactamente sus fragmentos del
indice concatenados por `position`, que es el mismo texto que leyo el agente. Las `position` de un
documento son 0..n-1 sin huecos, asi que sirven de desplazamiento de la ventana.
"""

import asyncpg


async def header(pool: asyncpg.Pool, doc_id: str) -> asyncpg.Record | None:
    """Cabecera del documento y cuantos fragmentos tiene; `None` si el indice no lo conoce."""
    async with pool.acquire() as connection:
        return await connection.fetchrow(
            """
            select doc_id,
                   min(title)       as title,
                   min(observatory) as observatory,
                   min(phenomenon)  as phenomenon,
                   min(language)    as language,
                   min(format)      as format,
                   count(*)::int    as total
            from fragments
            where doc_id = $1
            group by doc_id
            """,
            doc_id,
        )


async def position_of(pool: asyncpg.Pool, chunk_id: str) -> int | None:
    """Que lugar ocupa un fragmento dentro de su documento, para centrar la ventana en el."""
    async with pool.acquire() as connection:
        return await connection.fetchval(
            "select position from fragments where chunk_id = $1", chunk_id
        )


async def window(pool: asyncpg.Pool, doc_id: str, start: int, limit: int) -> list[asyncpg.Record]:
    """Los `limit` fragmentos del documento a partir de la posicion `start`."""
    async with pool.acquire() as connection:
        return await connection.fetch(
            """
            select chunk_id, position, num_tokens, text
            from fragments
            where doc_id = $1 and position >= $2
            order by position
            limit $3
            """,
            doc_id,
            start,
            limit,
        )
