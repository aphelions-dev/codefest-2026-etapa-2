"""Presencia de grupos armados: agregada al territorio que tiene forma, y detallada por municipio.

La fuente da el dato por municipio, pero la geometria municipal no sobrevivio a la indexacion de la
Etapa 1. El mapa agrega por departamento —que si tiene forma en `places`— y el detalle se lista
municipio a municipio con su traza, para no perder el nivel en el que el dato es cierto.

El cruce entre las dos fuentes es por nombre y no por codigo: Amazon Underworld usa los codigos de
OCHA (`CO52`) y las geometrias vienen de Natural Earth (`CO-NAR`), que no comparten nomenclatura.
"""

import asyncpg

# Los dos niveles con geometria de nivel 1: Colombia entro como `department` porque sus menciones
# del corpus y sus alertas tambien lo usan, y los otros cinco paises como `region`.
LEVELS = ("department", "region")

# Acentos fuera y todo en minuscula, para cruzar "Nariño" con "Narino". Se escribe aqui en vez de
# usar `unaccent` porque esa extension no esta en la imagen de Postgres y anadirla obligaria a una
# migracion solo para esta consulta.
FOLD = "lower(translate({0}, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))"


async def catalogue(pool: asyncpg.Pool) -> list[asyncpg.Record]:
    """Los grupos presentes y en cuantos municipios, para la leyenda y el filtro."""
    async with pool.acquire() as connection:
        return await connection.fetch(
            """
            select g as name,
                   count(*)::int as municipalities,
                   (array_agg(doc_id   order by population desc nulls last))[1] as sample_doc,
                   (array_agg(chunk_id order by population desc nulls last))[1] as sample_chunk
            from armed_presence, unnest(groups) as g
            group by 1
            order by 2 desc
            """
        )


async def coverage(pool: asyncpg.Pool, group: str | None) -> asyncpg.Record:
    """Cuantos municipios hay, cuantos con presencia y cuantos sin investigar."""
    async with pool.acquire() as connection:
        return await connection.fetchrow(
            """
            select count(*)::int                                          as municipalities,
                   count(*) filter (where cardinality(groups) > 0)::int   as with_presence,
                   count(*) filter (where no_info)::int                   as without_information,
                   count(*) filter (where $1::text is null
                                       or groups @> array[$1::text])::int as matching
            from armed_presence
            """,
            group,
        )


async def by_territory(
    pool: asyncpg.Pool, group: str | None, country: str | None = None
) -> list[asyncpg.Record]:
    """Territorios de nivel 1 con su geometria y cuantos municipios suyos registran presencia.

    Cubre los seis paises de la cuenca, no solo Colombia: Amazon Underworld mide en Brasil, Peru,
    Ecuador, Bolivia y Venezuela, y dejarlos fuera del dibujo haria pasar por vacio lo que solo
    estaba sin geometria.
    """
    conditions = ["true"]
    args: list[object] = []
    if group:
        args.append(group)
        conditions.append(f"m.groups @> array[${len(args)}::text]")
    if country:
        args.append(country)
        conditions.append(f"m.country = ${len(args)}")
    filtered = " and ".join(conditions)
    # Los dos lados del cruce se normalizan igual; el resto son literales controlados aqui.
    name = FOLD.format("p.name")
    admin = FOLD.format("a.admin1")

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            with per_admin1 as (
                -- `distinct m.pcode` y no `count(*)`: el unnest de los grupos multiplica la fila
                -- del municipio por cada grupo que registra, y sin el distinct un municipio con
                -- cuatro grupos contaria como cuatro municipios.
                select m.admin1,
                       -- El pcode de OCHA empieza por el ISO alfa-2 del pais: es el codigo con el
                       -- que la geometria de Natural Earth identifica al suyo.
                       min(left(m.pcode, 2))                                as iso2,
                       count(distinct m.pcode)::int                         as municipalities,
                       count(distinct m.pcode) filter (
                           where cardinality(m.groups) > 0
                       )::int                                               as with_presence,
                       count(distinct m.pcode) filter (where m.no_info)::int as without_information,
                       count(distinct g)::int                               as groups,
                       (array_agg(m.doc_id   order by cardinality(m.groups) desc))[1] as sample_doc,
                       (array_agg(m.chunk_id order by cardinality(m.groups) desc))[1] as sample_chunk
                from armed_presence m
                left join lateral unnest(m.groups) as g on true
                where {filtered}
                group by 1
            )
            -- `distinct on` porque un nombre puede repetirse entre paises («Amazonas» es un
            -- departamento de Colombia, un estado de Brasil y una region de Peru): gana el del
            -- mismo pais, que es el unico cruce correcto.
            select distinct on (a.admin1)
                   p.place_id, p.name, p.iso2, p.geometry,
                   a.municipalities, a.with_presence, a.without_information, a.groups,
                   a.sample_doc, a.sample_chunk
            from per_admin1 a
            join places p on p.level = any('{{department,region}}')
                 and {name} = {admin}
                 and (p.iso2 is null or p.iso2 = a.iso2)
            order by a.admin1, a.with_presence desc
            """,
            *args,
        )


async def municipalities(
    pool: asyncpg.Pool, group: str | None, country: str | None, limit: int, mapped: bool = False
) -> list[asyncpg.Record]:
    """Municipios con presencia, del que mas grupos registra al que menos.

    Con `mapped`, solo los que tienen poligono: son los que el mapa puede dibujar.
    """
    conditions = ["cardinality(groups) > 0"]
    if mapped:
        conditions.append("geometry is not null")
    args: list[object] = []
    if group:
        args.append(group)
        conditions.append(f"groups @> array[${len(args)}::text]")
    if country:
        args.append(country)
        conditions.append(f"country = ${len(args)}")

    async with pool.acquire() as connection:
        return await connection.fetch(
            f"""
            select pcode, country, admin1, admin2, population, groups, no_info, geometry,
                   doc_id, chunk_id
            from armed_presence
            where {" and ".join(conditions)}
            order by cardinality(groups) desc, population desc nulls last
            limit {limit}
            """,
            *args,
        )
