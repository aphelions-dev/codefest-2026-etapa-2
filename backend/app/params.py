"""Parametros compartidos por los endpoints de agregacion.

Los nombres son los que declaran las herramientas del agente: cambiar uno cambia el contrato con
el tablero y con la ficha, asi que viven en un solo sitio.
"""

from datetime import date
from enum import Enum
from typing import Annotated

from fastapi import Path, Query


class Phenomenon(int, Enum):
    """Los tres fenomenos del reto."""

    ai_military = 1
    space_security = 2
    territorial = 3


class BreakdownField(str, Enum):
    """Campos por los que se puede agrupar el corpus. Lista cerrada: son columnas indexadas."""

    phenomenon = "phenomenon"
    observatory = "observatory"
    language = "language"
    format = "format"


class MatrixColumn(str, Enum):
    """Segunda categoria de la matriz de calor."""

    observatory = "observatory"
    phenomenon = "phenomenon"
    language = "language"
    format = "format"


class PlaceLevel(str, Enum):
    """Nivel territorial del mapa. El zoom del anexo pide cambiar de agregacion, no de fuente."""

    country = "country"
    department = "department"


# Identificadores de la Etapa 1. Validarlos en el borde convierte un valor imposible en un 422 y
# no en un 200 vacio, y cierra la ruta a cualquier cosa que no tenga la forma de un identificador.
DOC_ID_PATTERN = r"^F\d-[A-Z0-9]+-\d+$"
CHUNK_ID_PATTERN = r"^F\d-[A-Z0-9]+-\d+-chunk-\d+$"

DocId = Annotated[str, Path(pattern=DOC_ID_PATTERN, description="Identificador del documento")]
OptionalChunkId = Annotated[
    str | None,
    Query(pattern=CHUNK_ID_PATTERN, description="Fragmento en el que centrar la ventana"),
]

# El filtro global por periodo. Un documento entra cuando todo lo que se sabe de su fecha cae
# dentro: el que solo trae el ano entra si el periodo cubre ese ano entero (ver `app.db.period`).
DateFrom = Annotated[
    date | None, Query(description="Primer dia del periodo (ISO 8601); sin el, desde el principio")
]
DateTo = Annotated[
    date | None, Query(description="Ultimo dia del periodo (ISO 8601); sin el, hasta el final")
]
