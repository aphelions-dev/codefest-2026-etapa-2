import json

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
    """El texto original que sustenta una visualizacion, en una ventana de sus fragmentos.

    `total` y `start` situan la ventana dentro del documento: el lector sabe cuanto queda a cada
    lado y puede pedir el tramo anterior o el siguiente sin traerse el documento entero.
    """

    doc_id: str
    title: str | None = None
    observatory: str | None = None
    phenomenon: int
    language: str | None = None
    format: str | None = None
    total: int
    start: int
    fragments: list[DocumentFragment] = Field(default_factory=list)


class MatrixCell(BaseModel):
    """Una celda: el cruce de dos categorias, con el fragmento que la sustenta."""

    # Identificador de la entidad de la fila: es lo que propaga la seleccion a las demas vistas.
    row_id: str
    row: str
    col: str
    documents: int
    mentions: int
    trace: Trace


class MatrixRow(BaseModel):
    entity_id: str
    name: str


class Matrix(BaseModel):
    """Matriz de calor: dos variables categoricas y una numerica en el color."""

    rows: list[MatrixRow]
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
    """Una arista de co-ocurrencia: el peso son los documentos compartidos.

    `trace` es el fragmento concreto en el que las dos entidades coinciden: seleccionar una arista
    tiene que llevar al texto que la sustenta, no solo al documento.
    """

    source: str
    target: str
    documents: int
    trace: Trace


class Graph(BaseModel):
    """Red de co-ocurrencia, no un grafo de relaciones inferidas."""

    phenomenon: int | None = None
    min_documents: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class QuadrantPoint(BaseModel):
    """Una entidad en el plano. Las dos coordenadas son conteos, no un indice inventado."""

    entity_id: str
    name: str
    type: str
    # Intensidad: documentos fechados que nombran la entidad.
    documents: int
    # Tendencia: como se reparten esos documentos entre la mitad reciente y la anterior.
    recent: int
    earlier: int
    trace: Trace


class Quadrant(BaseModel):
    """Cuadrante de priorizacion: intensidad contra tendencia, con las lineas de corte explicitas."""

    phenomenon: int | None = None
    # Ano que parte el corpus fechado en dos mitades comparables.
    split_year: int
    # Medianas de cada eje: son las lineas que dividen el plano en los cuatro cuadrantes.
    median_documents: float
    median_recent_share: float
    dated_documents: int
    total_documents: int
    points: list[QuadrantPoint]


class PlaceProperties(BaseModel):
    place_id: str
    name: str
    # ISO 3166-1 alfa-2: lo que necesita la bandera del lugar.
    iso2: str | None = None
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
    # Entidad a la que se limito el conteo, cuando el tablero propago esa seleccion.
    entity: str | None = None
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
