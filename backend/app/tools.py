"""Las herramientas de los agentes, y lo que la ficha declara de cada una.

Una herramienta es el unico camino del agente hacia los datos: el modelo decide *que mirar*, nunca
*que dice el dato*. Su descripcion es el prompt que lee el modelo, con la politica de uso dentro.

El nombre de la herramienta es tambien lo que activa el componente del tablero: el frontend lo lee
de `tools_called`, asi que elegir una visualizacion no cuesta un solo token adicional.
"""

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

import asyncpg

from app.db import breakdown as breakdown_db
from app.db import entities as entities_db
from app.db import places as places_db
from app.db import quadrant as quadrant_db
from app.db import timeline as timeline_db
from app.retrieval import Retriever

PHENOMENON_PARAM = {
    "type": "integer",
    "description": "Fenomeno al que limitar: 1 IA militar, 2 seguridad espacial, 3 dinamicas territoriales",
}


@dataclass
class Tool:
    """Una herramienta declarable: lo que el modelo ve y lo que el backend ejecuta."""

    name: str
    description: str
    parameters: dict[str, Any]
    run: Callable[..., Awaitable[dict]]

    def schema(self) -> dict:
        """El formato de tool calling que entiende un endpoint compatible con OpenAI."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {"type": "object", "properties": self.parameters, "required": []},
            },
        }

    def card(self) -> dict:
        """Como aparece en la ficha del agente (seccion 2.3 de la especificacion)."""
        return {
            "name": self.name,
            "descripcion": self.description,
            "input_parameters": {key: value["type"] for key, value in self.parameters.items()},
        }


@dataclass
class Toolbox:
    """Las herramientas disponibles, atadas al pool y al indice de esta ejecucion."""

    pool: asyncpg.Pool
    retriever: Retriever | None
    tools: dict[str, Tool] = field(default_factory=dict)

    def __post_init__(self) -> None:
        for tool in (
            self._search_corpus(),
            self._metadata_breakdown(),
            self._entity_matrix(),
            self._cooccurrence(),
            self._quadrant(),
            self._places(),
            self._timeline(),
        ):
            self.tools[tool.name] = tool

    def schemas(self, names: list[str]) -> list[dict]:
        return [self.tools[name].schema() for name in names if name in self.tools]

    def _search_corpus(self) -> Tool:
        async def run(query: str = "", phenomenon: int | None = None) -> dict:
            if self.retriever is None:
                return {"error": "El indice no esta disponible en este despliegue."}
            fragments = await self.retriever.search(query, phenomenon)
            return {
                "fragments": [
                    {
                        "doc_id": fragment.doc_id,
                        "chunk_id": fragment.chunk_id,
                        "observatory": fragment.observatory,
                        "text": fragment.context or fragment.text,
                    }
                    for fragment in fragments
                ]
            }

        return Tool(
            name="search_corpus",
            description=(
                "Busca fragmentos del corpus documental por significado. Usala siempre antes de "
                "afirmar cualquier hecho: es la unica fuente de evidencia. Escribe la consulta con "
                "los terminos del usuario, no con sinonimos propios."
            ),
            parameters={
                "query": {"type": "string", "description": "Lo que hay que buscar, en lenguaje natural"},
                "phenomenon": PHENOMENON_PARAM,
            },
            run=run,
        )

    def _metadata_breakdown(self) -> Tool:
        async def run(by: str = "observatory", phenomenon: int | None = None) -> dict:
            if by not in {"phenomenon", "observatory", "language", "format"}:
                by = "observatory"
            fragments, documents, rows = await breakdown_db.by_field(self.pool, by, phenomenon)
            return {
                "field": by,
                "total_documents": documents,
                "total_fragments": fragments,
                "buckets": [
                    {"label": row["label"] or "sin dato", "documents": row["documents"]}
                    for row in rows
                ],
            }

        return Tool(
            name="get_metadata_breakdown",
            description=(
                "Cuenta documentos del corpus agrupados por un campo de su metadata: fenomeno, "
                "observatorio de origen, idioma o formato. Es la herramienta de las comparaciones y "
                "las composiciones simples; no la uses para preguntas sobre el contenido."
            ),
            parameters={
                "by": {
                    "type": "string",
                    "description": "Campo por el que agrupar: phenomenon, observatory, language o format",
                },
                "phenomenon": PHENOMENON_PARAM,
            },
            run=run,
        )

    def _entity_matrix(self) -> Tool:
        async def run(cols: str = "observatory", phenomenon: int | None = None) -> dict:
            if cols not in {"observatory", "phenomenon", "language", "format"}:
                cols = "observatory"
            rows = await entities_db.matrix(self.pool, cols, phenomenon)
            return {
                "cols_field": cols,
                "cells": [
                    {
                        "entity": row["row_label"],
                        "col": row["col_label"] or "sin dato",
                        "documents": row["documents"],
                        "doc_id": row["sample_doc"],
                        "chunk_id": row["sample_chunk"],
                    }
                    for row in rows
                ],
            }

        return Tool(
            name="get_entity_matrix",
            description=(
                "Cruza las entidades mas presentes con otra categoria (observatorio, fenomeno, "
                "idioma o formato) y devuelve cuantos documentos las nombran en cada cruce. "
                "Responde a 'que entidad domina cada fuente'."
            ),
            parameters={
                "cols": {
                    "type": "string",
                    "description": "Segunda categoria: observatory, phenomenon, language o format",
                },
                "phenomenon": PHENOMENON_PARAM,
            },
            run=run,
        )

    def _cooccurrence(self) -> Tool:
        async def run(
            entity: str | None = None, phenomenon: int | None = None, min_documents: int = 4
        ) -> dict:
            nodes, edges = await entities_db.cooccurrence(
                self.pool, entity, phenomenon, max(1, min(min_documents, 100))
            )
            return {
                "nodes": [
                    {
                        "entity_id": node["entity_id"],
                        "name": node["name"],
                        "type": node["type"],
                        "documents": node["documents"],
                    }
                    for node in nodes[:20]
                ],
                "edges": [
                    {
                        "source": edge["source"],
                        "target": edge["target"],
                        "documents": edge["documents"],
                        "doc_id": edge["sample_doc"],
                        "chunk_id": edge["sample_chunk"],
                    }
                    for edge in edges[:30]
                ],
            }

        return Tool(
            name="get_cooccurrence",
            description=(
                "Red de entidades que aparecen juntas en los mismos documentos, con cuantos "
                "comparten. Usala para preguntas sobre relaciones o actores que van asociados; no "
                "la uses para una comparacion simple, que se lee mejor en barras."
            ),
            parameters={
                "entity": {"type": "string", "description": "Entidad en la que centrar la red"},
                "phenomenon": PHENOMENON_PARAM,
                "min_documents": {
                    "type": "integer",
                    "description": "Documentos compartidos minimos para conectar dos entidades",
                },
            },
            run=run,
        )

    def _quadrant(self) -> Tool:
        async def run(phenomenon: int | None = None) -> dict:
            split = await quadrant_db.median_year(self.pool, phenomenon)
            if split is None:
                return {"points": [], "note": "No hay documentos con fecha para este filtro."}
            rows = await quadrant_db.by_entity(self.pool, phenomenon, split)
            return {
                "split_year": split,
                "points": [
                    {
                        "entity": row["name"],
                        "documents": row["documents"],
                        "recent": row["recent"],
                        "earlier": row["earlier"],
                        "doc_id": row["sample_doc"],
                        "chunk_id": row["sample_chunk"],
                    }
                    for row in rows[:20]
                ],
            }

        return Tool(
            name="get_quadrant",
            description=(
                "Situa cada entidad segun dos criterios a la vez: cuantos documentos la nombran y "
                "que proporcion de esos documentos es reciente. Usala cuando la pregunta sea a que "
                "prestar atencion primero, que esta emergiendo o que ya esta consolidado. No "
                "devuelve ningun puntaje de riesgo: son dos conteos."
            ),
            parameters={"phenomenon": PHENOMENON_PARAM},
            run=run,
        )

    def _places(self) -> Tool:
        async def run(level: str = "country", phenomenon: int | None = None) -> dict:
            level = "department" if level == "department" else "country"
            rows = await places_db.by_level(self.pool, level, phenomenon, 20)
            return {
                "level": level,
                "places": [
                    {
                        "name": row["name"],
                        "documents": row["documents"],
                        "doc_id": row["sample_doc"],
                        "chunk_id": row["sample_chunk"],
                    }
                    for row in rows
                ],
            }

        return Tool(
            name="get_places",
            description=(
                "Territorios que el corpus nombra y cuantos documentos lo hacen, por paises o por "
                "departamentos de Colombia. Activa el mapa del tablero. Usala solo cuando la "
                "pregunta sea sobre donde ocurre o se concentra algo."
            ),
            parameters={
                "level": {"type": "string", "description": "Nivel territorial: country o department"},
                "phenomenon": PHENOMENON_PARAM,
            },
            run=run,
        )

    def _timeline(self) -> Tool:
        async def run(phenomenon: int | None = None, entity: str | None = None) -> dict:
            dated, total = await timeline_db.coverage(self.pool, phenomenon)
            rows = await timeline_db.by_period(self.pool, phenomenon, entity)
            return {
                "dated_documents": dated,
                "total_documents": total,
                "points": [{"year": row["year"], "documents": row["documents"]} for row in rows],
            }

        return Tool(
            name="get_timeline",
            description=(
                "Documentos del corpus por ano de publicacion, para ver la evolucion de un tema. "
                "Declara sobre cuantos documentos hay fecha: si son cero, dilo en vez de afirmar "
                "una tendencia."
            ),
            parameters={
                "phenomenon": PHENOMENON_PARAM,
                "entity": {
                    "type": "string",
                    "description": "Limitar a documentos que nombran la entidad",
                },
            },
            run=run,
        )
