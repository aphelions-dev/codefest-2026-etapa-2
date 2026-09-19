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
    lon      double precision,
    lat      double precision,
    geometry jsonb
);

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
"""
