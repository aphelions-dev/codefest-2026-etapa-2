"""Fecha de publicacion de cada documento, extraida de la metadata de su fuente.

    uv run --env-file ../.env python -m precompute.document_dates

La fecha sale de la ruta y del nombre del archivo en el corpus original, que son metadata de la
fuente, nunca del cuerpo del texto: un ano mencionado dentro de un informe es el ano del que habla,
no el ano en que se publico, y presentarlo como fecha del documento seria una variable inventada.

Cada regla deja escrito en `source` de donde salio la fecha, asi que cualquier punto de la linea de
tiempo se puede auditar hasta el archivo que lo produjo.
"""

import asyncio
import os
import re
from datetime import date

import asyncpg

from app.db.schema import SCHEMA

# El corpus no tiene nada anterior ni posterior a esto; fuera de rango es un falso positivo.
MIN_YEAR = 1990
MAX_YEAR = date.today().year

# Alertas tempranas de la Defensoria: "ALERTAS_029-20-91742" es la alerta 29 del ano 2020.
ALERT = re.compile(r"ALERTAS_(\d{3})-(\d{2})-")
# Carpeta con el ano, como "UNOOSA\\pdfs\\2021\\...".
YEAR_DIR = re.compile(r"[\\/](19\d{2}|20\d{2})[\\/]")
# Fecha compacta en el nombre: "CSIS_220202-harrison-..." es 2022-02-02.
COMPACT = re.compile(r"_(\d{2})(\d{2})(\d{2})[-_]")
# Fecha ISO dentro del nombre: "..._2024-03-15_...".
ISO = re.compile(r"(19\d{2}|20\d{2})-(\d{2})-(\d{2})")
# Ano suelto en el nombre, ultimo recurso: "..._informe_2019.pdf".
LOOSE_YEAR = re.compile(r"(?:^|[^0-9])(19\d{2}|20\d{2})(?:[^0-9]|$)")


def extract(source_file: str, path: str) -> tuple[date, str] | None:
    """La fecha del documento y la regla que la produjo, o `None` si no hay senal fiable.

    El orden es de mas preciso a menos: una fecha completa en el nombre vale mas que la carpeta del
    ano, y esta mas que un numero de cuatro cifras suelto.
    """
    if match := ISO.search(source_file):
        year, month, day = (int(part) for part in match.groups())
        if _valid(year, month, day):
            return date(year, month, day), "iso_en_nombre"

    if match := COMPACT.search(source_file):
        year, month, day = (int(part) for part in match.groups())
        year += 2000
        if _valid(year, month, day):
            return date(year, month, day), "aammdd_en_nombre"

    if match := ALERT.search(source_file):
        year = 2000 + int(match.group(2))
        if MIN_YEAR <= year <= MAX_YEAR:
            # La alerta no lleva mes en el identificador: se fecha al 1 de enero de su ano y la
            # linea de tiempo agrega por ano, que es la unidad en la que el dato es cierto.
            return date(year, 1, 1), "ano_de_la_alerta"

    if match := YEAR_DIR.search(path):
        year = int(match.group(1))
        if MIN_YEAR <= year <= MAX_YEAR:
            return date(year, 1, 1), "carpeta_del_ano"

    if match := LOOSE_YEAR.search(source_file):
        year = int(match.group(1))
        if MIN_YEAR <= year <= MAX_YEAR:
            return date(year, 1, 1), "ano_en_el_nombre"

    return None


def _valid(year: int, month: int, day: int) -> bool:
    if not (MIN_YEAR <= year <= MAX_YEAR and 1 <= month <= 12 and 1 <= day <= 31):
        return False
    try:
        date(year, month, day)
    except ValueError:
        return False
    return True


async def main() -> None:
    connection = await asyncpg.connect(os.environ["DATABASE_URL"])
    await connection.execute(SCHEMA)
    await connection.execute("truncate document_dates")

    rows = await connection.fetch(
        "select doc_id, min(source_file) as source_file, min(path) as path "
        "from fragments group by doc_id"
    )
    dated = [
        (row["doc_id"], *found)
        for row in rows
        if (found := extract(row["source_file"], row["path"] or ""))
    ]
    await connection.executemany(
        "insert into document_dates (doc_id, published_on, source) values ($1,$2,$3) "
        "on conflict (doc_id) do update set published_on = excluded.published_on, "
        "source = excluded.source",
        dated,
    )

    print(f"{len(dated):,} de {len(rows):,} documentos fechados")
    for record in await connection.fetch(
        "select source, count(*)::int as documents from document_dates group by 1 order by 2 desc"
    ):
        print(f"  {record['source']:<20} {record['documents']:>5,}")
    for record in await connection.fetch(
        "select extract(year from published_on)::int as year, count(*)::int as documents "
        "from document_dates group by 1 order by 1"
    ):
        print(f"  {record['year']}  {record['documents']:>5,}")

    await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
