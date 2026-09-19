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
"""
