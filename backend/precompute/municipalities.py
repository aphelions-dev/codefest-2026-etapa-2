"""Geometria municipal de la cuenca amazonica, para pintar la presencia armada donde se mide.

    uv run --env-file ../.env python -m precompute.municipalities --data <carpeta>

Amazon Underworld registra la presencia **por municipio**, y agregarla al departamento pierde
precisamente lo que la fuente aporta: dentro de un mismo departamento hay municipios con cuatro
grupos y municipios sin ninguno. La geometria municipal no sobrevivio a la indexacion de la Etapa 1,
asi que se toma de geoBoundaries (CC BY 4.0), que publica ADM2 de los seis paises.

El cruce es por nombre, porque geoBoundaries no publica el pcode de OCHA que usa Amazon Underworld.
Cuando un nombre se repite dentro del pais —«San Rafael» esta en varios departamentos— se
desambigua por geometria: gana el candidato cuyo departamento contiene el centro del poligono.
"""

import argparse
import asyncio
import json
import os
import unicodedata
from pathlib import Path

import asyncpg

from app.db.schema import SCHEMA

COUNTRIES = {
    "BOL": "Bolivia",
    "BRA": "Brasil",
    "COL": "Colombia",
    "ECU": "Ecuador",
    "PER": "Peru",
    "VEN": "Venezuela",
}


def fold(text: str) -> str:
    """Sin acentos y en minuscula: las dos fuentes escriben los nombres de maneras distintas."""
    stripped = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in stripped if not unicodedata.combining(c)).casefold().strip()


def centre(geometry: dict) -> tuple[float, float]:
    """El centro de la caja que envuelve al poligono. No es el centroide, y no hace falta que lo
    sea: solo sirve para decidir en que departamento cae un municipio."""
    lons: list[float] = []
    lats: list[float] = []

    def walk(coordinates) -> None:
        if isinstance(coordinates[0], (int, float)):
            lons.append(coordinates[0])
            lats.append(coordinates[1])
            return
        for part in coordinates:
            walk(part)

    walk(geometry["coordinates"])
    return (min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2


def contains(geometry: dict, point: tuple[float, float]) -> bool:
    """Si un punto cae dentro del poligono, por el algoritmo del rayo.

    Se escribe aqui en vez de traer una libreria de geometria: es la unica operacion espacial de
    todo el proyecto, y anadir shapely por ella significaria compilar GEOS en la imagen.
    """
    lon, lat = point
    rings = (
        [ring for polygon in geometry["coordinates"] for ring in polygon]
        if geometry["type"] == "MultiPolygon"
        else geometry["coordinates"]
    )
    inside = False
    for ring in rings:
        for index in range(len(ring)):
            x1, y1 = ring[index][0], ring[index][1]
            x2, y2 = ring[index - 1][0], ring[index - 1][1]
            if (y1 > lat) != (y2 > lat) and lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1:
                inside = not inside
    return inside


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data",
        required=True,
        help="Carpeta con los adm2_<ISO3>.json de geoBoundaries",
    )
    args = parser.parse_args()
    source = Path(args.data)

    connection = await asyncpg.connect(os.environ["DATABASE_URL"])
    await connection.execute(SCHEMA)

    # Los territorios de nivel 1 ya cargados, para desambiguar los nombres repetidos.
    regions = await connection.fetch(
        "select place_id, name, iso2, geometry from places where level in ('department', 'region')"
    )
    by_region: dict[str, list[asyncpg.Record]] = {}
    for record in regions:
        by_region.setdefault(fold(record["name"]), []).append(record)

    # Los municipios que hay que dibujar: solo los que registran presencia.
    towns = await connection.fetch(
        "select pcode, country, admin1, admin2 from armed_presence"
    )
    wanted: dict[tuple[str, str], list[asyncpg.Record]] = {}
    for town in towns:
        wanted.setdefault((town["country"], fold(town["admin2"])), []).append(town)

    matched: dict[str, dict] = {}
    ambiguous = 0

    for iso3, country in COUNTRIES.items():
        path = source / f"adm2_{iso3}.json"
        if not path.exists():
            print(f"  {country:<12} sin archivo, se salta")
            continue
        shapes = json.loads(path.read_text(encoding="utf-8"))["features"]
        hits = 0
        for shape in shapes:
            candidates = wanted.get((country, fold(shape["properties"]["shapeName"])), [])
            if not candidates:
                continue
            town = candidates[0]
            if len(candidates) > 1:
                # Mismo nombre en varios departamentos: gana aquel cuyo poligono lo contiene.
                point = centre(shape["geometry"])
                resolved = None
                for candidate in candidates:
                    for region in by_region.get(fold(candidate["admin1"]), []):
                        if contains(json.loads(region["geometry"]), point):
                            resolved = candidate
                            break
                    if resolved:
                        break
                if resolved is None:
                    ambiguous += 1
                    continue
                town = resolved
            # Un municipio puede aparecer dos veces en geoBoundaries (islas, enclaves): la primera
            # geometria que lo encuentra es la que se queda.
            if town["pcode"] not in matched:
                matched[town["pcode"]] = {"geometry": shape["geometry"]}
                hits += 1
        print(f"  {country:<12} {hits:>5,} municipios emparejados de {len(shapes):,} en el archivo")

    await connection.executemany(
        "update armed_presence set geometry = $2 where pcode = $1",
        [(pcode, json.dumps(data["geometry"])) for pcode, data in matched.items()],
    )

    total = await connection.fetchval("select count(*) from armed_presence")
    drawn = await connection.fetchval(
        "select count(*) from armed_presence where geometry is not null"
    )
    print(f"{drawn:,} de {total:,} municipios tienen geometria; {ambiguous:,} nombres sin resolver")

    await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
