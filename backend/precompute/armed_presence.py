"""Presencia de grupos armados por municipio, reconstruida desde el propio indice.

    uv run --env-file ../.env python -m precompute.armed_presence

Amazon Underworld publica sus datos como teselas vectoriales, y la Etapa 1 las indexo como texto:
cada fragmento trae los atributos del municipio en pares `clave: valor`, con una bandera por grupo
armado. Aqui se vuelven a leer de ahi, asi que **no hace falta el corpus crudo**: el dato ya esta
en la base, solo estaba en forma de texto.

Lo unico que no sobrevivio a esa indexacion es la geometria del poligono. El mapa agrega por
departamento, que si tiene forma en la base, y el municipio se lista con su nombre y su traza.

Cobertura: solo la cuenca amazonica de seis paises. Un municipio con `au_no_info` no se investigo:
es *sin informacion*, que no es lo mismo que *sin presencia*. Datos con licencia CC BY 4.0.
"""

import asyncio
import os
import re

import asyncpg

from app.db.schema import SCHEMA

# `clave: valor` separados por barras, tal como quedo el texto de la tesela en el indice.
FIELD = re.compile(r"([A-Za-z0-9_. ]+):\s*([^|]*)")

# Las banderas de grupo, con el nombre con que se muestran. `au_others` agrupa a los que la fuente
# no nombra por separado, y se conserva como tal en vez de repartirlo entre los demas.
GROUPS = {
    "au_eln": "ELN",
    "au_c_d_f": "Comandos de la Frontera",
    "au_emc": "Estado Mayor Central",
    "au_embf": "Estado Mayor de Bloques y Frentes",
    "au_seg_marq": "Segunda Marquetalia",
    "au_cv": "Comando Vermelho",
    "au_pcc": "Primeiro Comando da Capital",
    "au_lobos": "Los Lobos",
    "au_choneros": "Los Choneros",
    "au_others": "Otros",
}

TRUE = {"verdadeiro", "verdadero", "true", "si", "sí", "1"}



def parse(text: str) -> list[dict]:
    """Los municipios de un fragmento. Un fragmento puede traer varios, separados por `fid:`."""
    records = []
    for chunk in re.split(r"(?=\bfid:)", text):
        fields = {key.strip(): value.strip() for key, value in FIELD.findall(chunk)}
        pcode = fields.get("b_ADM2_PCODE")
        name = fields.get("b_ADM2_PT") or fields.get("b_ADM2_ES") or fields.get("au_level2")
        if not pcode or not name:
            continue
        groups = sorted(
            label for key, label in GROUPS.items() if fields.get(key, "").lower() in TRUE
        )
        records.append(
            {
                "pcode": pcode,
                "country": fields.get("au_country") or _country_of(pcode),
                "admin1": fields.get("b_ADM1_PT") or fields.get("b_ADM1_ES") or fields.get("au_level1") or "",
                "admin1_code": fields.get("b_ADM1_PCODE"),
                "admin2": name,
                "population": _number(fields.get("au_population")),
                "area_km2": _decimal(fields.get("au_area_km2")),
                "groups": groups,
                "no_info": fields.get("au_no_info", "").lower() in TRUE,
            }
        )
    return records


def _country_of(pcode: str) -> str:
    """El pais sale del prefijo ISO del codigo cuando el atributo no viene en el fragmento."""
    return {
        "BO": "Bolivia",
        "BR": "Brasil",
        "CO": "Colombia",
        "EC": "Ecuador",
        "PE": "Peru",
        "VE": "Venezuela",
    }.get(pcode[:2], "")


def _number(value: str | None) -> int | None:
    try:
        return int(float(value)) if value else None
    except ValueError:
        return None


def _decimal(value: str | None) -> float | None:
    try:
        return float(value) if value else None
    except ValueError:
        return None


async def main() -> None:
    connection = await asyncpg.connect(os.environ["DATABASE_URL"])
    await connection.execute(SCHEMA)
    await connection.execute("truncate armed_presence")

    rows = await connection.fetch(
        "select doc_id, chunk_id, text from fragments where observatory = 'Amazon_Underworld'"
    )
    print(f"{len(rows):,} fragmentos de Amazon Underworld")

    # Un municipio aparece en varias teselas y en varios niveles de zoom. Gana el registro con mas
    # informacion: el que nombra grupos por encima del que solo dice que no se investigo.
    best: dict[str, dict] = {}
    for row in rows:
        for record in parse(row["text"]):
            record |= {"doc_id": row["doc_id"], "chunk_id": row["chunk_id"]}
            current = best.get(record["pcode"])
            if current is None or _rank(record) > _rank(current):
                best[record["pcode"]] = record

    await connection.executemany(
        """
        insert into armed_presence
            (pcode, country, admin1, admin1_code, admin2, population, area_km2, groups, no_info,
             doc_id, chunk_id)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        """,
        [
            (
                r["pcode"], r["country"], r["admin1"], r["admin1_code"], r["admin2"],
                r["population"], r["area_km2"], r["groups"], r["no_info"], r["doc_id"], r["chunk_id"],
            )
            for r in best.values()
        ],
    )

    print(f"{len(best):,} municipios")
    for record in await connection.fetch(
        """
        select country,
               count(*)::int                                   as municipios,
               count(*) filter (where cardinality(groups) > 0)::int as con_presencia,
               count(*) filter (where no_info)::int            as sin_informacion
        from armed_presence group by 1 order by 2 desc
        """
    ):
        print(
            f"  {record['country'] or 'sin pais':<12} {record['municipios']:>5,} municipios · "
            f"{record['con_presencia']:>4,} con presencia · {record['sin_informacion']:>4,} sin información"
        )
    for record in await connection.fetch(
        """
        select unnest(groups) as grupo, count(*)::int as municipios
        from armed_presence group by 1 order by 2 desc
        """
    ):
        print(f"    {record['grupo']:<34} {record['municipios']:>4,}")

    await connection.close()


def _rank(record: dict) -> tuple[int, int, int]:
    """Cuanta informacion trae un registro: grupos primero, luego poblacion y area."""
    return (
        len(record["groups"]),
        1 if record["population"] else 0,
        1 if record["area_km2"] else 0,
    )


if __name__ == "__main__":
    asyncio.run(main())
