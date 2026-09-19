"""Geometria de nivel 1 de los seis paises de la cuenca amazonica.

    uv run --env-file ../.env python -m precompute.amazon_regions

Amazon Underworld cubre Bolivia, Brasil, Colombia, Ecuador, Peru y Venezuela, y el mapa solo tenia
forma para los departamentos de Colombia: los 935 municipios brasilenos y los 351 de los otros
cuatro paises quedaban fuera del dibujo aunque el dato estuviera cargado.

Estas geometrias son de Natural Earth (dominio publico) y entran en `places` con nivel `region`,
separado de `department`: el nivel colombiano lo usan tambien las menciones del corpus y las
alertas, y mezclarlos haria que un estado de Brasil apareciera donde solo caben departamentos.

El cruce con `armed_presence` es por nombre normalizado, porque Amazon Underworld usa los codigos
de OCHA (`BR13`) y Natural Earth los ISO 3166-2 (`BR-AM`), que no comparten nomenclatura.
"""

import asyncio
import json
import os
from pathlib import Path

import asyncpg

from app.db.schema import SCHEMA

DATA = Path(__file__).parent / "data"
REGIONS = DATA / "ne_10m_admin_1_amazon.geojson"

COUNTRY = {
    "BOL": "Bolivia",
    "BRA": "Brasil",
    "COL": "Colombia",
    "ECU": "Ecuador",
    "PER": "Peru",
    "VEN": "Venezuela",
}

ISO2 = {"BOL": "BO", "BRA": "BR", "COL": "CO", "ECU": "EC", "PER": "PE", "VEN": "VE"}


def regions() -> list[dict]:
    """Las unidades de nivel 1, con el nombre en espanol cuando Natural Earth lo trae."""
    data = json.loads(REGIONS.read_text(encoding="utf-8"))
    units = []
    for feature in data["features"]:
        props = feature["properties"]
        code = props["adm0_a3"]
        name = props.get("name_es") or props.get("name")
        if not name:
            continue  # Natural Earth trae islotes sin nombre, que no son una region
        units.append(
            {
                "place_id": props["iso_3166_2"],
                "name": name,
                "country": COUNTRY[code],
                "iso2": ISO2[code],
                "lon": props.get("longitude"),
                "lat": props.get("latitude"),
                "geometry": feature["geometry"],
            }
        )
    return units


async def main() -> None:
    connection = await asyncpg.connect(os.environ["DATABASE_URL"])
    await connection.execute(SCHEMA)
    await connection.execute("delete from places where level = 'region'")

    units = regions()
    await connection.executemany(
        """
        insert into places (place_id, name, level, iso2, lon, lat, geometry)
        values ($1, $2, 'region', $3, $4, $5, $6)
        on conflict (place_id) do nothing
        """,
        [
            (u["place_id"], u["name"], u["iso2"], u["lon"], u["lat"], json.dumps(u["geometry"]))
            for u in units
        ],
    )

    loaded = await connection.fetchval("select count(*) from places where level = 'region'")
    print(f"{loaded:,} regiones de {len(units):,} en el archivo")

    # Cuantos municipios de la presencia armada encuentran ahora su forma.
    matched = await connection.fetch(
        """
        with folded as (
            select p.place_id, p.iso2,
                   lower(translate(p.name, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) as name
            from places p where p.level = 'region'
        )
        select m.country,
               count(*)::int                                            as municipios,
               count(*) filter (where f.place_id is not null)::int       as con_region
        from armed_presence m
        left join folded f
          on lower(translate(m.admin1, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) = f.name
        group by 1 order by 2 desc
        """
    )
    for record in matched:
        print(
            f"  {record['country'] or 'sin pais':<12} {record['con_region']:>4,} de "
            f"{record['municipios']:>4,} municipios encuentran su region"
        )

    await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
