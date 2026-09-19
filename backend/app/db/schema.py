"""Tablas que crean los precomputos. Se aplican al arrancar el precomputo, no en la API."""

SCHEMA = """
create table if not exists entities (
    entity_id text primary key,
    name      text not null,
    type      text not null
);

create table if not exists entity_mentions (
    entity_id  text    not null references entities(entity_id) on delete cascade,
    doc_id     text    not null,
    chunk_id   text    not null,
    phenomenon integer not null,
    mentions   integer not null,
    primary key (entity_id, chunk_id)
);

create index if not exists entity_mentions_entity on entity_mentions(entity_id);
create index if not exists entity_mentions_doc    on entity_mentions(doc_id);
create index if not exists entity_mentions_phen   on entity_mentions(phenomenon);

create table if not exists places (
    place_id text primary key,
    name     text not null,
    level    text not null,
    -- ISO 3166-1 alfa-2 del pais al que pertenece el lugar: es el codigo que nombra la bandera.
    iso2     text,
    lon      double precision,
    lat      double precision,
    geometry jsonb
);

alter table places add column if not exists iso2 text;

create table if not exists place_mentions (
    place_id   text    not null references places(place_id) on delete cascade,
    doc_id     text    not null,
    chunk_id   text    not null,
    phenomenon integer not null,
    mentions   integer not null,
    primary key (place_id, chunk_id)
);

create index if not exists place_mentions_place on place_mentions(place_id);
create index if not exists place_mentions_phen  on place_mentions(phenomenon);

-- La fecha sale de la metadata original de cada fuente, no del texto: una fecha inferida del
-- cuerpo no es la fecha del documento y presentarla como tal seria una variable sin sustento.
create table if not exists document_dates (
    doc_id       text primary key,
    published_on date not null,
    source       text not null
);

create index if not exists document_dates_year on document_dates(published_on);

-- Presencia de grupos armados por municipio de la cuenca amazonica, reconstruida del indice.
-- `groups` vacio con `no_info` significa *sin informacion*, no *sin presencia*.
create table if not exists armed_presence (
    pcode       text primary key,
    country     text not null,
    admin1      text not null,
    admin1_code text,
    admin2      text not null,
    population  integer,
    area_km2    double precision,
    groups      text[] not null default '{}',
    no_info     boolean not null default false,
    -- Poligono del municipio, de geoBoundaries: la fuente mide aqui, no en el departamento.
    geometry    jsonb,
    doc_id      text not null,
    chunk_id    text not null
);

alter table armed_presence add column if not exists geometry jsonb;

create index if not exists armed_presence_admin1 on armed_presence(admin1_code);
create index if not exists armed_presence_country on armed_presence(country);

-- Alertas tempranas de la Defensoria del Pueblo. `kind` distingue el riesgo inminente —una amenaza
-- inmediata— del estructural, que es sostenido en el tiempo: son dos cosas y no se suman.
create table if not exists early_warnings (
    doc_id    text primary key,
    code      text not null,
    kind      text not null,
    issued_on date,
    chunk_id  text not null
);

create index if not exists early_warnings_kind on early_warnings(kind);
create index if not exists early_warnings_issued on early_warnings(issued_on);
"""
