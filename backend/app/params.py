"""Parametros compartidos por los endpoints de agregacion.

Los nombres son los que declaran las herramientas del agente: cambiar uno cambia el contrato con
el tablero y con la ficha, asi que viven en un solo sitio.
"""

from enum import Enum


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
