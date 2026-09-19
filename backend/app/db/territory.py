"""El detalle de un territorio: lo que el corpus dice de el, y lo que registran las otras fuentes.

Es el nivel al que el tablero deja de mostrar cifras y empieza a mostrar evidencia. Cada consulta
devuelve fragmentos con su `doc_id` y su `chunk_id`, que es lo que convierte un numero del mapa en
algo que el evaluador puede leer y comprobar.
"""

from datetime import date

import asyncpg

from app.db import period

# Cuanto texto se manda de cada fragmento. Suficiente para juzgar si el fragmento viene a cuento,
# sin enviar el documento entero: para eso esta la vista del documento.
EXCERPT = 420


async def fragments(
    pool: asyncpg.Pool,
    place_id: str,
    phenomenon: int | None,
    limit: int,
    date_from: date | None = None,
    date_to: date | None = None,
    entity_id: str | None = None,
) -> tuple[int, list[asyncpg.Record]]:
    """Los fragmentos que nombran el territorio, del que mas lo menciona al que menos.

    Con `entity_id`, solo los de documentos que ademas nombran la entidad: el mismo recorte que el
    mapa aplica a la cifra, para que el detalle ensene la evidencia de esa cifra y no otra.
    """
    conditions = ["m.place_id = $1"]
    args: list[object] = [place_id]
    if phenomenon is not None:
        args.append(phenomenon)
        conditions.append(f"m.phenomenon = ${len(args)}")
    if entity_id:
        args.append(entity_id)
        conditions.append(
            "exists (select 1 from entity_mentions e "
            f"where e.doc_id = m.doc_id and e.entity_id = ${len(args)})"
        )
    where = " and ".join(conditions) + period.documents("m.doc_id", date_from, date_to, args)

    async with pool.acquire() as connection:
        total = await connection.fetchval(
            f"select count(*)::int from place_mentions m where {where}", *args
        )
        rows = await connection.fetch(
            f"""
            select m.doc_id,
                   m.chunk_id,
                   m.mentions,
                   f.phenomenon,
                   f.observatory,
                   f.language,
                   left(f.text, {EXCERPT}) as excerpt,
                   length(f.text) > {EXCERPT} as truncated
            from place_mentions m
            join fragments f using (chunk_id)
            where {where}
            order by m.mentions desc, m.doc_id
            limit {limit}
            """,
            *args,
        )
    return total, rows


async def municipalities(pool: asyncpg.Pool, place_name: str, group: str | None) -> list[asyncpg.Record]:
    """Los municipios del departamento con presencia registrada, del que mas grupos tiene al que menos.

    El cruce es por nombre porque las dos fuentes usan nomenclaturas distintas; se normaliza igual
    en los dos lados.
    """
    fold = "lower(translate({0}, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))"
    conditions = [f"{fold.format('admin1')} = {fold.format('$1')}"]
    args: list[object] = [place_name]
    if group:
        args.append(group)
        conditions.append(f"groups @> array[${len(args)}::text]")

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select pcode, country, admin1, admin2, population, groups, no_info, doc_id, chunk_id
            from armed_presence
            where {" and ".join(conditions)}
            order by cardinality(groups) desc, population desc nulls last
            """,
            *args,
        )


async def alerts(
    pool: asyncpg.Pool,
    place_id: str,
    kind: str | None,
    date_from: date | None = None,
    date_to: date | None = None,
    entity_id: str | None = None,
) -> list[asyncpg.Record]:
    """Las alertas que nombran el departamento, de la mas reciente a la mas antigua."""
    conditions = ["m.place_id = $1"]
    args: list[object] = [place_id]
    if kind:
        args.append(kind)
        conditions.append(f"w.kind = ${len(args)}")
    dated = period.issued("w.issued_on", date_from, date_to, args)
    if entity_id:
        args.append(entity_id)
        dated += (
            " and exists (select 1 from entity_mentions e "
            f"where e.doc_id = w.doc_id and e.entity_id = ${len(args)})"
        )

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select distinct on (w.doc_id)
                   w.doc_id,
                   w.code,
                   w.kind,
                   w.issued_on,
                   w.chunk_id,
                   left(f.text, {EXCERPT}) as excerpt
            from early_warnings w
            join place_mentions m using (doc_id)
            join fragments f on f.chunk_id = w.chunk_id
            where {" and ".join(conditions)}{dated}
            order by w.doc_id, w.issued_on desc
            """,
            *args,
        )
