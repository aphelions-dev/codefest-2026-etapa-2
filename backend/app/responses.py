import json
from datetime import date

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
    # Un documento que la cifra cuenta, en un fragmento suyo: toda cifra del tablero lleva a su origen.
    trace: Trace


class Breakdown(BaseModel):
    """Comparacion, distribucion y composicion sobre la metadata del corpus."""

    field: str
    phenomenon: int | None = None
    total_fragments: int
    total_documents: int
    buckets: list[BreakdownBucket]


class DistributionBin(BaseModel):
    """Un tramo del histograma: documentos cuyo valor cae entre `low` y `high`, por fenomeno."""

    label: str
    low: int
    # Sin techo en el ultimo tramo.
    high: int | None = None
    documents: int
    # Documentos del tramo por fenomeno, con la clave "1", "2" o "3": se apilan en su color.
    by_phenomenon: dict[str, int]
    # El documento con el valor mas alto del tramo, en su primer fragmento. Sin el en un tramo vacio.
    trace: Trace | None = None


class Distribution(BaseModel):
    """Como se reparte una medida por documento, con sus cuartiles.

    Los tramos son potencias de dos: la medida tiene una cola larga (la mediana de fragmentos por
    documento va de 1 a 8 segun el fenomeno y el p95 pasa de 100), y con tramos iguales todo caeria
    en la primera barra.
    """

    measure: str
    phenomenon: int | None = None
    date_from: date | None = None
    date_to: date | None = None
    documents: int
    # Percentiles 25, 50 y 75 de la medida, sobre los documentos del filtro.
    quartiles: list[int]
    bins: list[DistributionBin]


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
    # El fragmento que mas veces nombra la entidad.
    trace: Trace


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
    # Periodo al que se limito el conteo, cuando el filtro global lo fija.
    date_from: date | None = None
    date_to: date | None = None
    features: list[PlaceFeature]


class PresenceProperties(BaseModel):
    """Lo que el mapa pinta de un departamento: cuantos municipios suyos registran presencia."""

    place_id: str
    name: str
    iso2: str | None = None
    municipalities: int
    with_presence: int
    without_information: int
    groups: int
    trace: Trace


class PresenceFeature(BaseModel):
    type: str = "Feature"
    id: str
    geometry: dict
    properties: PresenceProperties


class MunicipalityFeature(BaseModel):
    """Un municipio como Feature de GeoJSON: es donde la fuente mide, y donde el mapa lo pinta."""

    type: str = "Feature"
    id: str
    geometry: dict
    properties: "Municipality"


class Municipality(BaseModel):
    """El nivel en el que la fuente da el dato, con su traza al fragmento que lo sustenta."""

    pcode: str
    country: str
    admin1: str
    admin2: str
    population: int | None = None
    groups: list[str]
    no_info: bool
    trace: Trace


class ArmedGroup(BaseModel):
    name: str
    municipalities: int
    # El registro de uno de sus municipios, el de mas poblacion.
    trace: Trace


class Presence(BaseModel):
    """Presencia de grupos armados en la cuenca amazonica.

    El mapa agrega al departamento porque es el territorio con geometria; la lista conserva el
    municipio, que es donde la fuente mide. Un municipio sin grupos y con `no_info` es *sin
    informacion*, no *sin presencia*, y las dos cifras van separadas por eso.
    """

    group: str | None = None
    country: str | None = None
    municipalities: int
    with_presence: int
    without_information: int
    matching: int
    groups: list[ArmedGroup]
    # El mapa pinta municipios: es el nivel en el que la fuente mide, y agregarlos al departamento
    # perderia justo lo que aporta, que dentro de un departamento unos tienen cuatro grupos y otros
    # ninguno. `regions` acompana con el agregado de nivel 1, para el ranking y la comparacion.
    features: list[MunicipalityFeature]
    regions: list[PresenceFeature]
    places: list[Municipality]


class AlertProperties(BaseModel):
    """Lo que el mapa pinta de un departamento: cuantas alertas de cada clase lo nombran."""

    place_id: str
    name: str
    iso2: str | None = None
    alerts: int
    imminent: int
    structural: int
    latest: date | None = None
    trace: Trace


class AlertFeature(BaseModel):
    type: str = "Feature"
    id: str
    geometry: dict
    properties: AlertProperties


class AlertYear(BaseModel):
    year: int
    alerts: int
    imminent: int
    structural: int
    # La ultima alerta emitida ese ano.
    trace: Trace


class Alert(BaseModel):
    """Una alerta concreta, con su codigo y el fragmento donde consta."""

    doc_id: str
    code: str
    kind: str
    issued_on: date | None = None
    trace: Trace


class Alerts(BaseModel):
    """Alertas tempranas de la Defensoria del Pueblo.

    `imminent` y `structural` van siempre separadas: una declara una amenaza inmediata y la otra una
    sostenida en el tiempo, y sumarlas daria una cifra sin significado.
    """

    kind: str | None = None
    alerts: int
    imminent: int
    structural: int
    since: date | None = None
    until: date | None = None
    features: list[AlertFeature]
    years: list[AlertYear]
    recent: list[Alert]


class PlaceFragment(BaseModel):
    """Un fragmento que nombra el territorio, con lo justo para juzgarlo y abrirlo entero."""

    doc_id: str
    chunk_id: str
    phenomenon: int
    observatory: str | None = None
    language: str | None = None
    mentions: int
    excerpt: str
    truncated: bool


class TerritoryAlert(BaseModel):
    """Una alerta que nombra el territorio."""

    doc_id: str
    code: str
    kind: str
    issued_on: date | None = None
    excerpt: str
    trace: Trace


class Territory(BaseModel):
    """Todo lo que el radar sabe de un territorio: quien lo nombra, quien opera y que se alerto.

    Es el nivel en el que el tablero deja de mostrar cifras y muestra evidencia: cada elemento lleva
    su `doc_id` y su `chunk_id`, y desde ahi se abre el documento por el fragmento exacto.
    """

    place_id: str
    name: str
    iso2: str | None = None
    level: str
    # Como lo nombra el corpus («United States», «EE. UU.»): lo que se marca en cada fragmento.
    forms: list[str] = []
    phenomenon: int | None = None
    # Cuantos fragmentos del corpus nombran el territorio, mas alla de los que se devuelven, y en
    # cuantos documentos distintos: la ficha del mapa cuenta documentos.
    total_fragments: int
    total_documents: int
    fragments: list[PlaceFragment]
    municipalities: list[Municipality]
    alerts: list[TerritoryAlert]


class TimelinePoint(BaseModel):
    """Un ano: el total y cuanto aporto cada fuente, para apilar la barra."""

    year: int
    total: int
    sources: dict[str, int]
    # Un documento publicado ese ano, en su primer fragmento.
    trace: Trace


class Timeline(BaseModel):
    """Evolucion temporal por fenomeno o por fuente.

    `dated` y `total` dicen sobre cuantos documentos se puede afirmar algo; `series` son lo que tiene
    barra propia, en el orden en que se apila: `F1`, `F2` y `F3` sin filtro de fenomeno, y las
    fuentes con el filtro puesto.
    """

    phenomenon: int | None = None
    entity: str | None = None
    dated_documents: int
    total_documents: int
    series: list[str]
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
