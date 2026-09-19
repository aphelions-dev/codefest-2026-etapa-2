"""Lugares nombrados en el corpus: los paises de F1 y F2, y los departamentos de Colombia de F3.

    uv run --env-file ../.env python -m precompute.places

Las geometrias son de Natural Earth, dominio publico, y quedan en la base para que el mapa
coropletico las sirva sin exponer el indice.
"""

import asyncio
import json
import os
import re
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
    # Homonimos medidos en el corpus (auditoria de 2026-09-19): cada uno contaba documentos que no
    # hablan del territorio. Un grupo armado, un municipio de otro departamento, una region que
    # cruza varios, un tratado, una universidad y los estados de Brasil y Venezuela.
    "Libertadores del Vichada", "Puerto Santander", "Magdalena Medio", "María Magdalena",
    "Maria Magdalena", "Bajo Cauca", "Bloque Amazonas", "Pacto de Bogotá", "Pacto de Bogota",
    "b_ADM1_PT: Amazonas", "estado de Amazonas", "estado Amazonas", "state of Amazonas",
    "Amazonas state", "Georgia Institute of Technology", "Georgia Tech", "Georgia State University",
]

# Las alertas llevan el membrete de quien firma ("Carrera 9 # 16-21, Bogota D.C.", la Defensoria) y
# la direccion de a quien van ("Carrera 8 No 12B-31 Bogota D.C", la CIPRAT). Son remitente y
# destinatario, no un territorio del que se hable. El filtro de plantillas no las atrapa porque el
# OCR las escribe distinto en cada documento, asi que se quitan antes de buscar.
ADDRESS = re.compile(
    r"(?:Carrera|Calle|Avenida|Av\.)\s*\d+[A-Z]?\W{0,6}(?:No\.?|N°|#)?\s*\d+[A-Z]?\s*-\s*\d+"
    r"\W{0,6}Bogot[aá]\s*,?\s*D\.?\s*C\.?"
)

# "Meta" es la palabra inglesa y la empresa; "Cordoba" y "Guainia" tambien son ciudades de otro
# pais. Estos departamentos solo cuentan cuando el texto los nombra como departamento.
AMBIGUOUS_DEPARTMENTS = {"CO-MET", "CO-COR", "CO-GUA", "CO-SUC", "CO-CAS", "CO-BOL", "CO-ATL"}

# Natural Earth le pone a Bogota el codigo de Cundinamarca (CO-CUN). Son dos entidades territoriales
# distintas: sin corregirlo, cada mencion de Bogota contaba para Cundinamarca y una geometria
# pisaba a la otra. CO-DC es su codigo ISO 3166-2.
CAPITAL = {"code": "CO-DC", "name": "Bogotá D.C.", "forms": ["Bogotá", "Bogota", "Distrito Capital"]}


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
            "forms": sorted(filter(None, names)),
            "name": props.get("NAME_ES") or props["NAME"],
            # Natural Earth deja ISO_A2 vacio en los territorios disputados; ISO_A2_EH si lo trae.
            "iso2": props.get("ISO_A2_EH") or props.get("ISO_A2"),
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
        if props.get("name") == "Bogota":
            code, label = CAPITAL["code"], CAPITAL["name"]
            names |= set(CAPITAL["forms"])
        spelled: list[str] = []
        for name in filter(None, names):
            if code in AMBIGUOUS_DEPARTMENTS:
                # Solo cuenta nombrado como departamento: "Meta" o "Cordoba" a secas es otra cosa.
                variants = [f"departamento del {name}", f"departamento de {name}", f"{name} department"]
            else:
                variants = [name]
            for variant in variants:
                forms[variant] = code
            spelled += variants
        places[code] = {
            "forms": sorted(spelled),
            "name": label,
            "iso2": "CO",  # los departamentos son todos de Colombia
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
            "insert into places (place_id, name, level, iso2, lon, lat, geometry, forms) "
            "values ($1,$2,$3,$4,$5,$6,$7,$8)",
            [
                (code, place["name"], level, place["iso2"], place["lon"], place["lat"],
                 json.dumps(place["geometry"]), place["forms"])
                for code, place in places.items()
            ],
        )
        pattern = matching.build(forms, DECOYS)
        per_chunk = []
        for row in rows:
            found = list(matching.find(ADDRESS.sub(" ", row["text"]), pattern, forms))
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
