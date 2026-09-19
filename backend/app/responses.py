import json

"""Modelos de respuesta. Son la unica fuente del contrato: los tipos del frontend se generan de
aqui por OpenAPI, asi que nada se escribe a mano dos veces."""

from pydantic import BaseModel, ConfigDict, Field


class Trace(BaseModel):
    """De donde sale un dato. Todo lo que el tablero muestra tiene que poder rastrearse."""

    doc_id: str
    chunk_id: str


class BreakdownBucket(BaseModel):
    """Una barra: cuantos fragmentos y de cuantos documentos distintos."""

    label: str
    fragments: int
    documents: int


class Breakdown(BaseModel):
    """Comparacion, distribucion y composicion sobre la metadata del corpus."""

    field: str
    phenomenon: int | None = None
    total_fragments: int
    total_documents: int
    buckets: list[BreakdownBucket]


class DocumentFragment(BaseModel):
    chunk_id: str
    position: int
    num_tokens: int
    text: str


class Document(BaseModel):
    """El texto original que sustenta una visualizacion."""

    doc_id: str
    title: str | None = None
    observatory: str | None = None
    phenomenon: int
    language: str | None = None
    format: str | None = None
    fragments: list[DocumentFragment] = Field(default_factory=list)


class MatrixCell(BaseModel):
    """Una celda: el cruce de dos categorias, con el fragmento que la sustenta."""

    row: str
    col: str
    documents: int
    mentions: int
    trace: Trace


class Matrix(BaseModel):
    """Matriz de calor: dos variables categoricas y una numerica en el color."""

    rows: list[str]
    cols: list[str]
    cols_field: str
    phenomenon: int | None = None
    cells: list[MatrixCell]


class GraphNode(BaseModel):
    entity_id: str
    name: str
    type: str
    documents: int


class GraphEdge(BaseModel):
    """Una arista de co-ocurrencia: el peso son los documentos compartidos."""

    source: str
    target: str
    documents: int
    sample_doc: str


class Graph(BaseModel):
    """Red de co-ocurrencia, no un grafo de relaciones inferidas."""

    phenomenon: int | None = None
    min_documents: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class PlaceProperties(BaseModel):
    place_id: str
    name: str
    documents: int
    mentions: int
    trace: Trace


class PlaceFeature(BaseModel):
    """Un lugar como Feature de GeoJSON: el mapa lo consume tal cual."""

    type: str = "Feature"
    id: str
    geometry: dict
    properties: PlaceProperties


class Places(BaseModel):
    """FeatureCollection de GeoJSON con el conteo en las propiedades."""

    type: str = "FeatureCollection"
    level: str
    phenomenon: int | None = None
    features: list[PlaceFeature]


class TimelinePoint(BaseModel):
    year: int
    documents: int


class Timeline(BaseModel):
    """Evolucion temporal. `dated` y `total` dicen sobre cuantos documentos se puede afirmar algo."""

    phenomenon: int | None = None
    entity: str | None = None
    dated_documents: int
    total_documents: int
    points: list[TimelinePoint]


# --- Contrato del asistente conversacional (Reto 1) ---------------------------------------------
# Los nombres de campo van en espanol porque los fija la especificacion de la organizacion, que
# manda sobre la regla de identificadores en ingles del proyecto. `strict` en todos: es imposible
# entregar un JSON malformado o con un campo de mas.


class ChatRequest(BaseModel):
    """La pregunta del usuario. `input` es lo que manda el frontend de chat ya construido."""

    model_config = ConfigDict(extra="forbid")

    input: str = Field(min_length=1, max_length=4000)


class ToolCall(BaseModel):
    """Una herramienta invocada. El tablero deduce de `name` que componente activar."""

    model_config = ConfigDict(extra="forbid")

    name: str
    input_parameters: dict = Field(default_factory=dict)
    output: str


class Evaluation(BaseModel):
    """Lo que la organizacion mide: relevancia, fidelidad y trazabilidad de la respuesta."""

    model_config = ConfigDict(extra="forbid")

    input: str
    actual_output: str
    # Solo aparece si hubo recuperacion: es lo que exige la especificacion.
    retrieval_context: list[str] | None = None
    tools_called: list[ToolCall] = Field(default_factory=list)


class Tokens(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input: int
    output: int
    total: int


class AgentTokens(Tokens):
    """El gasto de una capa. Sumados dan `metadata.tokens`, nunca solo el del orquestador."""

    agente: str
    modelo: str


class Metadata(BaseModel):
    """El coste y el recorrido de la respuesta. `num_interacciones` son llamadas a modelo."""

    model_config = ConfigDict(extra="forbid")

    num_interacciones: int
    agentes_invocados: list[str]
    tokens: Tokens
    tokens_por_agente: list[AgentTokens]
    latencia_ms: int
    estado: str


class ChatResponse(BaseModel):
    """La respuesta del endpoint, con la estructura exacta que exige la especificacion."""

    model_config = ConfigDict(extra="forbid")

    respuesta: str
    evaluacion: Evaluation
    metadata: Metadata
