"""Modelos de respuesta. Son la unica fuente del contrato: los tipos del frontend se generan de
aqui por OpenAPI, asi que nada se escribe a mano dos veces."""

from pydantic import BaseModel, Field


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
