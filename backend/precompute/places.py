"""Lugares nombrados en el corpus: los paises de F1 y F2, y los departamentos de Colombia de F3.

    uv run --env-file ../.env python -m precompute.places

Las geometrias son de Natural Earth, dominio publico, y quedan en la base para que el mapa
coropletico las sirva sin exponer el indice.
"""

import asyncio
import json
import os
from pathlib import Path

import asyncpg

from app.db.schema import SCHEMA
from precompute import matching

DATA = Path(__file__).parent / "data"
COUNTRIES = DATA / "ne_50m_admin_0_countries.geojson"
DEPARTMENTS = DATA / "ne_10m_admin_1_colombia.geojson"

# Formas con las que los informes nombran un pais cuyo nombre de Natural Earth no aparece tal cual.
COUNTRY_ALIASES = {
    "USA": ["United States", "Estados Unidos", "EE. UU.", "EE.UU.", "EEUU", "U.S.", "US"],
    "GBR": ["United Kingdom", "Reino Unido", "Britain", "UK"],
    "RUS": ["Russia", "Rusia", "Russian Federation"],
    "CHN": ["China"],
    "KOR": ["South Korea", "Republic of Korea", "Corea del Sur"],
    "PRK": ["North Korea", "Corea del Norte", "DPRK"],
    "IRN": ["Iran"],
    "TWN": ["Taiwan"],
    "COD": ["Democratic Republic of the Congo", "DR Congo", "RD Congo"],
    "BRA": ["Brazil", "Brasil"],
    "COL": ["Colombia"],
    "VEN": ["Venezuela"],
    "PER": ["Peru"],
    "ECU": ["Ecuador"],
    "BOL": ["Bolivia"],
    "MEX": ["Mexico"],
}

# Frases que llevan dentro el nombre de un lugar sin nombrarlo. Se consumen antes y no cuentan.
DECOYS = [
    "Gulf of Guinea", "Golfo de Guinea", "New Mexico", "Nuevo Mexico", "Gulf of Mexico",
    "Golfo de Mexico", "University of Georgia", "Atlanta, Georgia", "New Jersey",
    "Indiana University", "Washington, D.C.", "Washington DC",
]

# "Meta" es la palabra inglesa y la empresa; "Cordoba" y "Guainia" tambien son ciudades de otro
# pais. Estos departamentos solo cuentan cuando el texto los nombra como departamento.
AMBIGUOUS_DEPARTMENTS = {"CO-MET", "CO-COR", "CO-GUA", "CO-SUC", "CO-CAS", "CO-BOL", "CO-ATL"}


def country_forms() -> tuple[dict[str, str], dict[str, dict]]:
    """Nombre -> ADM0_A3, y la geometria por pais."""
    data = json.loads(COUNTRIES.read_text(encoding="utf-8"))
    forms: dict[str, str] = {}
    places: dict[str, dict] = {}
    for feature in data["features"]:
        props = feature["properties"]
        code = props["ADM0_A3"]
        names = {props.get(key) for key in ("NAME", "NAME_EN", "NAME_ES", "NAME_PT")}
        names |= set(COUNTRY_ALIASES.get(code, []))
        for name in filter(None, names):
            forms[name] = code
        places[code] = {
            "name": props.get("NAME_ES") or props["NAME"],
            "lon": props.get("LABEL_X"),
            "lat": props.get("LABEL_Y"),
            "geometry": feature["geometry"],
        }
    return forms, places


def department_forms() -> tuple[dict[str, str], dict[str, dict]]:
    """Nombre -> iso_3166_2, y la geometria por departamento de Colombia."""
    data = json.loads(DEPARTMENTS.read_text(encoding="utf-8"))
    forms: dict[str, str] = {}
    places: dict[str, dict] = {}
    for feature in data["features"]:
        props = feature["properties"]
        code = props["iso_3166_2"]
        label = props.get("name_es") or props.get("name")
        if not label:
            continue  # Natural Earth trae islotes sin nombre, que no son un departamento
        names = {props.get("name"), props.get("name_es"), props.get("name_alt")}
        for name in filter(None, names):
            if code in AMBIGUOUS_DEPARTMENTS:
                # Solo cuenta nombrado como departamento: "Meta" o "Cordoba" a secas es otra cosa.
                forms[f"departamento del {name}"] = code
                forms[f"departamento de {name}"] = code
                forms[f"{name} department"] = code
            else:
                forms[name] = code
        places[code] = {
            "name": label,
            "lon": props.get("longitude"),
            "lat": props.get("latitude"),
            "geometry": feature["geometry"],
        }
    return forms, places


async def main() -> None:
    connection = await asyncpg.connect(os.environ["DATABASE_URL"])
    await connection.execute(SCHEMA)
    await connection.execute("truncate place_mentions")
    await connection.execute("delete from places")

    rows = await connection.fetch("select doc_id, chunk_id, phenomenon, text from fragments")
    print(f"{len(rows):,} fragmentos")

    for level, (forms, places) in (
        ("country", country_forms()),
        ("department", department_forms()),
    ):
        await connection.executemany(
            "insert into places (place_id, name, level, lon, lat, geometry) values ($1,$2,$3,$4,$5,$6)",
            [
                (code, place["name"], level, place["lon"], place["lat"], json.dumps(place["geometry"]))
                for code, place in places.items()
            ],
        )
        pattern = matching.build(forms, DECOYS)
        per_chunk = []
        for row in rows:
            found = list(matching.find(row["text"], pattern, forms))
            if found:
                per_chunk.append((row["doc_id"], row["chunk_id"], row["phenomenon"], found))
        mentions, templates = matching.drop_templates(per_chunk)
        await connection.executemany(
            """insert into place_mentions (place_id, doc_id, chunk_id, phenomenon, mentions)
               values ($1,$2,$3,$4,$5) on conflict do nothing""",
            mentions,
        )
        covered = await connection.fetchval(
            """select count(distinct m.doc_id) from place_mentions m
               join places p using (place_id) where p.level = $1""",
            level,
        )
        print(f"  {level:<11} {len(mentions):>7,} menciones en {covered:>5,} documentos, "
              f"{templates:,} contextos de plantilla descartados")
        top = await connection.fetch(
            """select p.name, count(distinct m.doc_id) as docs
               from place_mentions m join places p using (place_id)
               where p.level = $1 group by 1 order by 2 desc limit 6""",
            level,
        )
        print("    " + ", ".join(f"{r['name']} ({r['docs']})" for r in top))

    await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
