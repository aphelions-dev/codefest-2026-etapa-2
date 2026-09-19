"""Consultas sobre las menciones de entidades: la matriz de calor y la red de co-ocurrencia."""

import asyncpg

MATRIX_ROWS = 18
GRAPH_NODES = 40
GRAPH_EDGES = 400

# Segunda categoria de la matriz. Lista cerrada: es un nombre de columna, no un parametro.
MATRIX_COLUMNS = {
    "observatory": "f.observatory",
    "phenomenon": "f.phenomenon::text",
    "language": "f.language",
    "format": "f.format",
}


async def matrix(pool: asyncpg.Pool, cols: str, phenomenon: int | None) -> list[asyncpg.Record]:
    """Entidades contra una segunda categoria, con el documento que sustenta cada celda.

    Las filas se acotan a las entidades mas presentes: una cuadricula de cientos de celdas no se
    lee, y el grafico tiene que resolver la tarea, no lucirla.
    """
    column = MATRIX_COLUMNS[cols]
    limit = "and m.phenomenon = $1" if phenomenon is not None else ""
    args = [phenomenon] if phenomenon is not None else []

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            with top_entities as (
                select m.entity_id
                from entity_mentions m
                where true {limit}
                group by m.entity_id
                order by count(distinct m.doc_id) desc
                limit {MATRIX_ROWS}
            )
            select e.entity_id                                     as row_id,
                   e.name                                          as row_label,
                   {column}                                        as col_label,
                   count(distinct m.doc_id)::int                    as documents,
                   sum(m.mentions)::int                             as mentions,
                   (array_agg(m.doc_id   order by m.mentions desc))[1] as sample_doc,
                   (array_agg(m.chunk_id order by m.mentions desc))[1] as sample_chunk
            from entity_mentions m
            join entities e using (entity_id)
            join fragments f on f.chunk_id = m.chunk_id
            where m.entity_id in (select entity_id from top_entities) {limit}
            group by 1, 2, 3
            order by 2, 3
            """,
            *args,
        )


async def cooccurrence(
    pool: asyncpg.Pool, entity_id: str | None, phenomenon: int | None, min_documents: int
) -> tuple[list[asyncpg.Record], list[asyncpg.Record]]:
    """Dos entidades se conectan si comparten documentos; el peso es cuantos comparten.

    Es la alternativa estadistica al grafo formal de tripletas: no inventa una relacion semantica
    que nadie extrajo, y cada arista se puede sustentar con los documentos que la producen. La
    traza de la arista es el fragmento mas denso de la primera entidad en uno de esos documentos.
    """
    phen = "and m.phenomenon = $1" if phenomenon is not None else ""
    phen_args = [phenomenon] if phenomenon is not None else []

    edge_args = [*phen_args, min_documents]
    focus = ""
    if entity_id:
        edge_args.append(entity_id)
        slot = f"${len(edge_args)}"
        focus = f"and (a.entity_id = {slot} or b.entity_id = {slot})"

    async with pool.acquire() as connection:
        edges = await connection.fetch(
            f"""
            with per_doc as (
                -- Un fragmento por entidad y documento: el mas denso, que es el que mejor
                -- sustenta la arista cuando el evaluador pide ver de donde sale.
                select m.entity_id,
                       m.doc_id,
                       (array_agg(m.chunk_id order by m.mentions desc, m.chunk_id))[1] as chunk_id
                from entity_mentions m
                where true {phen}
                group by 1, 2
            )
            select a.entity_id as source,
                   b.entity_id as target,
                   count(*)::int as documents,
                   (array_agg(a.doc_id   order by a.doc_id))[1] as sample_doc,
                   (array_agg(a.chunk_id order by a.doc_id))[1] as sample_chunk
            from per_doc a
            join per_doc b on a.doc_id = b.doc_id and a.entity_id < b.entity_id
            where true {focus}
            group by 1, 2
            having count(*) >= ${len(phen_args) + 1}
            order by 3 desc
            limit {GRAPH_EDGES}
            """,
            *edge_args,
        )
        nodes = await connection.fetch(
            f"""
            select e.entity_id, e.name, e.type, count(distinct m.doc_id)::int as documents
            from entity_mentions m
            join entities e using (entity_id)
            where true {phen}
            group by 1, 2, 3
            order by 4 desc
            limit {GRAPH_NODES}
            """,
            *phen_args,
        )
    return nodes, edges
