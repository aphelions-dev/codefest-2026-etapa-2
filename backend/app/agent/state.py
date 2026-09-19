"""Estado del grafo y contabilidad del gasto.

El gasto se acumula por capa, no global: la especificacion pide `tokens_por_agente` ademas del
total, y sin atribuirlo en el momento de la llamada no hay forma de reconstruirlo despues.
"""

import operator
from dataclasses import dataclass, field
from typing import Annotated, Any, TypedDict

from app.agent.retrieval import Fragment


@dataclass(frozen=True)
class Usage:
    """Lo que costo una llamada a modelo, atribuido a la capa que la hizo."""

    agent: str
    model: str
    input: int
    output: int

    @property
    def total(self) -> int:
        return self.input + self.output


@dataclass
class ToolRecord:
    """Una herramienta invocada, tal como viaja a `evaluacion.tools_called`."""

    name: str
    input_parameters: dict[str, Any] = field(default_factory=dict)
    output: str = ""


class State(TypedDict, total=False):
    """Lo que viaja entre nodos.

    Las listas se anotan con `operator.add` para que dos nodos puedan escribir sin pisarse: es lo
    que permite que el ciclo de reintento acumule el gasto de cada vuelta en vez de reemplazarlo.
    """

    question: str
    # La pregunta despues del guardian de entrada. Nunca se reescribe la original.
    sanitized: str
    phenomenon: int | None
    # A quien enruto el orquestador: "text", "visualization" o "both".
    route: str
    # Formulaciones con las que se busca. El orquestador puede descomponer una pregunta compuesta.
    queries: list[str]
    fragments: list[Fragment]
    # Los componentes que eligio el visualizador. Viajan tambien en `tools` para el contrato; aqui
    # se conservan aparte porque el redactor de la ruta visual necesita leerlos.
    components: list[ToolRecord]
    answer: str
    status: str
    # Por que el verificador rechazo la ultima respuesta. Alimenta la reescritura, nunca la salida.
    rejection: str
    retries: int

    usage: Annotated[list[Usage], operator.add]
    tools: Annotated[list[ToolRecord], operator.add]
    agents: Annotated[list[str], operator.add]
