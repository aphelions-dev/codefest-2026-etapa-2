"""El contrato del agente, palabra por palabra como lo fija la seccion 2.4 de la especificacion.

Los nombres de estos campos van en espanol, al contrario que el resto del codigo: no son nuestros,
son los que consumen las metricas de calidad de ADL y el calculo de costo por pregunta. Cambiar uno
rompe la evaluacion, asi que viven aislados aqui y no se reutilizan en ninguna otra capa.
"""

from typing import Any

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """La consulta. `input` es el nombre que usa el bloque de evaluacion para la pregunta."""

    input: str = Field(min_length=1, max_length=4000, description="La pregunta del usuario")


class ToolCall(BaseModel):
    """Una herramienta invocada, con sus parametros y lo que devolvio."""

    name: str
    input_parameters: dict[str, Any] = Field(default_factory=dict)
    output: str = ""


class Evaluation(BaseModel):
    """Insumo de las metricas de calidad: relevancia, fidelidad, toxicidad y tono."""

    input: str
    actual_output: str
    # Solo aplica si hubo recuperacion; vacio si el agente no recupero nada.
    retrieval_context: list[str] = Field(default_factory=list)
    tools_called: list[ToolCall] = Field(default_factory=list)


class Tokens(BaseModel):
    """Consumo de toda la solucion, no solo del orquestador."""

    input: int = 0
    output: int = 0
    total: int = 0


class AgentTokens(BaseModel):
    """Desglose por agente y modelo: permite calcular el costo con la tarifa de cada uno."""

    agente: str
    modelo: str
    input: int = 0
    output: int = 0
    total: int = 0


class Metadata(BaseModel):
    """Insumo de las metricas de eficiencia."""

    num_interacciones: int = 0
    agentes_invocados: list[str] = Field(default_factory=list)
    tokens: Tokens = Field(default_factory=Tokens)
    tokens_por_agente: list[AgentTokens] = Field(default_factory=list)
    latencia_ms: int = 0
    # `ok` si se genero respuesta; un codigo de error si el procesamiento fallo.
    estado: str = "ok"


class ChatResponse(BaseModel):
    """Los tres bloques que ADL espera de cada consulta."""

    respuesta: str
    evaluacion: Evaluation
    metadata: Metadata


class CardTool(BaseModel):
    name: str
    descripcion: str
    input_parameters: dict[str, str] = Field(default_factory=dict)


class CardAgent(BaseModel):
    nombre: str
    descripcion: str
    version: str
    endpoint: str
    input_modes: list[str]
    output_modes: list[str]


class CardOrchestrator(BaseModel):
    nombre: str
    descripcion: str
    modelo: str
    proveedor: str
    tools: list[CardTool] = Field(default_factory=list)


class CardSubagent(BaseModel):
    id: str
    nombre: str
    descripcion: str
    modelo: str
    proveedor: str
    activado_por: str
    ejemplos_de_activacion: list[str] = Field(default_factory=list)
    tools: list[CardTool] = Field(default_factory=list)


class AgentCard(BaseModel):
    """La ficha de la seccion 2.3: formato propio de ADL, no el estandar A2A."""

    agente: CardAgent
    orquestador: CardOrchestrator
    subagentes: list[CardSubagent] = Field(default_factory=list)
