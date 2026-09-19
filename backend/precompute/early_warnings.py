"""Alertas tempranas de la Defensoria del Pueblo, leidas del propio indice.

    uv run --env-file ../.env python -m precompute.early_warnings

Los documentos de Alertas Tempranas traen sus campos estructurados dentro del texto indexado:
`codigo`, `tipo` y `fecha_emision`. Lo que aqui se extrae no esta en ninguna otra tabla: el tipo de
riesgo —inminente o estructural— y la fecha exacta de emision, que son lo que distingue una amenaza
inmediata de una sostenida en el tiempo.

El territorio no se extrae aqui: `place_mentions` ya sabe que departamentos nombra cada documento, y
duplicar esa extraccion solo abriria la puerta a que las dos discrepen.
"""

import asyncio
import os
import re
from datetime import date

import asyncpg

from app.db.schema import SCHEMA

# `codigo: 036-18`, `tipo: Estructural`, `fecha_emision: 2018-04-13`.
CODE = re.compile(r"codigo:\s*(\d{3}-\d{2})")
KIND = re.compile(r"tipo:\s*(Inminencia|Inminente|Estructural)", re.IGNORECASE)
ISSUED = re.compile(r"fecha_emision:\s*(\d{4})-(\d{2})-(\d{2})")

# La fuente escribe el riesgo inmediato de las dos maneras; en el tablero es uno solo.
KINDS = {"inminencia": "Inminencia", "inminente": "Inminencia", "estructural": "Estructural"}


def extract(text: str) -> dict | None:
    """Los campos de una alerta, o `None` si el fragmento no los trae."""
    code = CODE.search(text)
    kind = KIND.search(text)
    if not code or not kind:
        return None
    issued = ISSUED.search(text)
    return {
        "code": code.group(1),
        "kind": KINDS[kind.group(1).lower()],
        "issued_on": date(*(int(part) for part in issued.groups())) if issued else None,
    }


async def main() -> None:
    connection = await asyncpg.connect(os.environ["DATABASE_URL"])
    await connection.execute(SCHEMA)
    await connection.execute("truncate early_warnings")

    rows = await connection.fetch(
        "select doc_id, chunk_id, text from fragments "
        "where observatory = 'Alertas_Tempranas' order by doc_id, position"
    )
    print(f"{len(rows):,} fragmentos de Alertas Tempranas")

    # Una alerta por documento: se queda el primer fragmento que trae los campos completos, que es
    # la ficha de la alerta; lo que viene despues es su cuerpo, que los repite.
    found: dict[str, dict] = {}
    for row in rows:
        if row["doc_id"] in found:
            continue
        fields = extract(row["text"])
        if fields:
            found[row["doc_id"]] = fields | {"doc_id": row["doc_id"], "chunk_id": row["chunk_id"]}

    await connection.executemany(
        """
        insert into early_warnings (doc_id, code, kind, issued_on, chunk_id)
        values ($1,$2,$3,$4,$5)
        on conflict (doc_id) do update
            set code = excluded.code, kind = excluded.kind,
                issued_on = excluded.issued_on, chunk_id = excluded.chunk_id
        """,
        [(a["doc_id"], a["code"], a["kind"], a["issued_on"], a["chunk_id"]) for a in found.values()],
    )

    total = await connection.fetchval(
        "select count(distinct doc_id) from fragments where observatory = 'Alertas_Tempranas'"
    )
    print(f"{len(found):,} alertas de {total:,} documentos de la fuente")
    for record in await connection.fetch(
        "select kind, count(*)::int as alertas, min(issued_on) as desde, max(issued_on) as hasta "
        "from early_warnings group by 1 order by 2 desc"
    ):
        print(
            f"  {record['kind']:<14} {record['alertas']:>4,}  "
            f"{record['desde']} → {record['hasta']}"
        )
    covered = await connection.fetchval(
        """
        select count(distinct w.doc_id) from early_warnings w
        join place_mentions m using (doc_id)
        join places p using (place_id) where p.level = 'department'
        """
    )
    print(f"  {covered:,} alertas nombran al menos un departamento con geometria")

    await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
