"""Endpoints de agregacion: los consume el tablero y, envueltos como herramientas, el agente.

No exponen el indice crudo. Cada respuesta llega lista para pintar, con los identificadores que
permiten volver al fragmento de origen.
"""

import json

from fastapi import APIRouter, HTTPException, Path, Query

from app.db import alerts as alerts_db
from app.db import breakdown as breakdown_db
from app.db import entities as entities_db
from app.db import places as places_db
from app.db import presence as presence_db
from app.db import quadrant as quadrant_db
from app.db import territory as territory_db
from app.db import timeline as timeline_db
from app.db import documents as documents_db
from app.db.pool import Pool
from app.params import (
    BreakdownField,
    DateFrom,
    DateTo,
    DocId,
    MatrixColumn,
    OptionalChunkId,
    Phenomenon,
    PlaceLevel,
)
from app.responses import (
    Alert,
    AlertFeature,
    AlertProperties,
    Alerts,
    AlertYear,
    Breakdown,
    BreakdownBucket,
    Document,
    DocumentFragment,
    Graph,
    GraphEdge,
    GraphNode,
    Matrix,
    MatrixCell,
    MatrixRow,
    PlaceFeature,
    PlaceProperties,
    ArmedGroup,
    Municipality,
    MunicipalityFeature,
    Places,
    Presence,
    PresenceFeature,
    PresenceProperties,
    PlaceFragment,
    Quadrant,
    QuadrantPoint,
    Territory,
    TerritoryAlert,
    Timeline,
    TimelinePoint,
    Trace,
)

router = APIRouter(tags=["aggregate"])


@router.get("/metadata/breakdown", summary="Conteos por un campo de la metadata")
async def metadata_breakdown(
    pool: Pool,
    by: BreakdownField = Query(description="Campo por el que agrupar"),
    phenomenon: Phenomenon | None = Query(default=None, description="Limitar a un fenomeno"),
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> Breakdown:
    """Alimenta el componente de barras: comparacion, distribucion y composicion."""
    value = phenomenon.value if phenomenon else None
    fragments, documents, rows = await breakdown_db.by_field(pool, by, value, date_from, date_to)
    return Breakdown(
        field=by.value,
        phenomenon=value,
        total_fragments=fragments,
        total_documents=documents,
        buckets=[
            BreakdownBucket(
                label=row["label"] or "sin dato",
                fragments=row["fragments"],
                documents=row["documents"],
            )
            for row in rows
        ],
    )


# Fragmentos por ventana. La mayoria de los documentos cabe entero, pero los mayores pasan del
# millar: servirlos completos son megabytes de JSON y otros tantos nodos en el DOM del lector.
WINDOW = 80


@router.get("/documents/{doc_id}", summary="El documento y sus fragmentos")
async def document(
    pool: Pool,
    doc_id: DocId,
    around: OptionalChunkId = None,
    start: int = Query(default=0, ge=0, description="Primer fragmento de la ventana"),
) -> Document:
    """El texto original detras de cualquier dato del tablero, en la ventana que contiene `around`.

    Sin `around`, la ventana empieza en `start`. Centrarla en el fragmento citado es lo que cierra
    la trazabilidad que exige la especificacion: el dato lleva a su `chunk_id`, no solo al `doc_id`.
    """
    head = await documents_db.header(pool, doc_id)
    if head is None:
        raise HTTPException(404, f"No hay ningun documento con doc_id {doc_id}")
    if around is not None:
        if not around.startswith(f"{doc_id}-chunk-"):
            raise HTTPException(404, f"El fragmento {around} no pertenece a {doc_id}")
        position = await documents_db.position_of(pool, around)
        if position is None:
            raise HTTPException(404, f"No hay ningun fragmento con chunk_id {around}")
        start = max(0, position - WINDOW // 2)
    # La ultima ventana se apoya en el final: asi no devuelve dos fragmentos sueltos.
    start = max(0, min(start, head["total"] - WINDOW))
    rows = await documents_db.window(pool, doc_id, start, WINDOW)
    return Document(
        doc_id=head["doc_id"],
        title=head["title"],
        observatory=head["observatory"],
        phenomenon=head["phenomenon"],
        language=head["language"],
        format=head["format"],
        total=head["total"],
        start=start,
        fragments=[
            DocumentFragment(
                chunk_id=row["chunk_id"],
                position=row["position"],
                num_tokens=row["num_tokens"],
                text=row["text"],
            )
            for row in rows
        ],
    )


@router.get("/entities/matrix", summary="Matriz de calor de entidades")
async def entity_matrix(
    pool: Pool,
    cols: MatrixColumn = Query(default=MatrixColumn.observatory, description="Segunda categoria"),
    phenomenon: Phenomenon | None = Query(default=None, description="Limitar a un fenomeno"),
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> Matrix:
    """Cruza las entidades mas presentes con otra categoria: que entidad domina cada fuente."""
    value = phenomenon.value if phenomenon else None
    rows = await entities_db.matrix(pool, cols.value, value, date_from, date_to)
    cells = [
        MatrixCell(
            row_id=row["row_id"],
            row=row["row_label"],
            col=row["col_label"] or "sin dato",
            documents=row["documents"],
            mentions=row["mentions"],
            trace=Trace(doc_id=row["sample_doc"], chunk_id=row["sample_chunk"]),
        )
        for row in rows
    ]
    return Matrix(
        rows=[
            MatrixRow(entity_id=entity_id, name=name)
            for entity_id, name in sorted({(cell.row_id, cell.row) for cell in cells}, key=lambda pair: pair[1])
        ],
        cols=sorted({cell.col for cell in cells}),
        cols_field=cols.value,
        phenomenon=value,
        cells=cells,
    )


@router.get("/entities/cooccurrence", summary="Red de co-ocurrencia de entidades")
async def entity_cooccurrence(
    pool: Pool,
    entity: str | None = Query(default=None, description="Centrar la red en una entidad"),
    phenomenon: Phenomenon | None = Query(default=None, description="Limitar a un fenomeno"),
    min_documents: int = Query(default=3, ge=1, le=100, description="Documentos compartidos minimos"),
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> Graph:
    """Que entidades aparecen juntas, y en cuantos documentos."""
    value = phenomenon.value if phenomenon else None
    nodes, edges = await entities_db.cooccurrence(
        pool, entity, value, min_documents, date_from, date_to
    )
    return Graph(
        phenomenon=value,
        min_documents=min_documents,
        nodes=[
            GraphNode(
                entity_id=node["entity_id"],
                name=node["name"],
                type=node["type"],
                documents=node["documents"],
            )
            for node in nodes
        ],
        edges=[
            GraphEdge(
                source=edge["source"],
                target=edge["target"],
                documents=edge["documents"],
                trace=Trace(doc_id=edge["sample_doc"], chunk_id=edge["sample_chunk"]),
            )
            for edge in edges
        ],
    )


@router.get("/places", summary="Lugares nombrados en el corpus")
async def places(
    pool: Pool,
    level: PlaceLevel = Query(default=PlaceLevel.country, description="Nivel territorial"),
    phenomenon: Phenomenon | None = Query(default=None, description="Limitar a un fenomeno"),
    limit: int = Query(default=80, ge=1, le=250, description="Cuantos lugares devolver"),
    entity: str | None = Query(default=None, description="Solo documentos que nombran la entidad"),
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> Places:
    """Alimenta el mapa coropletico. Solo devuelve lugares que el corpus nombra."""
    value = phenomenon.value if phenomenon else None
    rows = await places_db.by_level(pool, level.value, value, limit, entity, date_from, date_to)
    return Places(
        level=level.value,
        phenomenon=value,
        entity=entity,
        date_from=date_from,
        date_to=date_to,
        features=[
            PlaceFeature(
                id=row["place_id"],
                geometry=json.loads(row["geometry"]),
                properties=PlaceProperties(
                    place_id=row["place_id"],
                    name=row["name"],
                    iso2=row["iso2"],
                    documents=row["documents"],
                    mentions=row["mentions"],
                    trace=Trace(doc_id=row["sample_doc"], chunk_id=row["sample_chunk"]),
                ),
            )
            for row in rows
        ],
    )


@router.get("/timeline", summary="Documentos por ano")
async def timeline(
    pool: Pool,
    phenomenon: Phenomenon | None = Query(default=None, description="Limitar a un fenomeno"),
    entity: str | None = Query(default=None, description="Solo documentos que nombran la entidad"),
) -> Timeline:
    """Alimenta la linea de tiempo. Sin fechas precomputadas la serie sale vacia a proposito:
    inventar una fecha desde el texto seria presentar una variable sin sustento."""
    value = phenomenon.value if phenomenon else None
    dated, total = await timeline_db.coverage(pool, value)
    series, points = await timeline_db.by_period(pool, value, entity)
    return Timeline(
        phenomenon=value,
        entity=entity,
        dated_documents=dated,
        total_documents=total,
        series=series,
        points=[TimelinePoint(**point) for point in points],
    )


@router.get("/entities/quadrant", summary="Cuadrante de priorizacion de entidades")
async def entity_quadrant(
    pool: Pool,
    phenomenon: Phenomenon | None = Query(default=None, description="Limitar a un fenomeno"),
) -> Quadrant:
    """Intensidad contra tendencia: a que entidades mirar primero, sin puntuar ninguna.

    El eje horizontal son los documentos que nombran la entidad y el vertical, que proporcion de
    ellos esta en la mitad reciente del corpus. Los dos son conteos verificables; las lineas de
    corte son las medianas, asi que el cuadrante compara entidades entre si y no contra un umbral
    inventado.
    """
    value = phenomenon.value if phenomenon else None
    split = await quadrant_db.median_year(pool, value)
    dated, total = await timeline_db.coverage(pool, value)
    if split is None:
        return Quadrant(
            phenomenon=value,
            split_year=0,
            median_documents=0,
            median_recent_share=0,
            dated_documents=dated,
            total_documents=total,
            points=[],
        )

    rows = await quadrant_db.by_entity(pool, value, split)
    points = [
        QuadrantPoint(
            entity_id=row["entity_id"],
            name=row["name"],
            type=row["type"],
            documents=row["documents"],
            recent=row["recent"],
            earlier=row["earlier"],
            trace=Trace(doc_id=row["sample_doc"], chunk_id=row["sample_chunk"]),
        )
        for row in rows
    ]
    shares = sorted(point.recent / point.documents for point in points if point.documents)
    counts = sorted(point.documents for point in points)
    return Quadrant(
        phenomenon=value,
        split_year=split,
        median_documents=_median(counts),
        median_recent_share=_median(shares),
        dated_documents=dated,
        total_documents=total,
        points=points,
    )


def _median(values: list[float]) -> float:
    """La mediana de una lista ya ordenada; 0 si no hay nada que dividir."""
    if not values:
        return 0.0
    middle = len(values) // 2
    if len(values) % 2:
        return float(values[middle])
    return (values[middle - 1] + values[middle]) / 2


@router.get("/presence", summary="Presencia de grupos armados en la cuenca amazonica")
async def presence(
    pool: Pool,
    group: str | None = Query(default=None, description="Limitar a un grupo armado"),
    country: str | None = Query(default=None, description="Limitar la lista a un pais"),
    limit: int = Query(default=60, ge=1, le=300, description="Cuantos municipios listar"),
) -> Presence:
    """Que grupos armados registra cada territorio, y en que municipios.

    El dato viene por municipio, pero la geometria municipal no esta en el indice: el mapa agrega al
    territorio de nivel 1 —departamento, estado o provincia, segun el pais— y la lista conserva el
    municipio, que es donde la fuente mide. Cubre los seis paises de la cuenca amazonica.

    Es un conteo de presencia declarada por la fuente, no una medida de intensidad ni de riesgo.
    """
    counts = await presence_db.coverage(pool, group)
    territories = await presence_db.by_territory(pool, group, country)
    places = await presence_db.municipalities(pool, group, country, limit)
    # El mapa pide todos los que puede dibujar; la lista, solo los `limit` primeros.
    drawn = await presence_db.municipalities(pool, group, country, 2000, mapped=True)

    return Presence(
        group=group,
        country=country,
        municipalities=counts["municipalities"],
        with_presence=counts["with_presence"],
        without_information=counts["without_information"],
        matching=counts["matching"],
        groups=[
            ArmedGroup(name=row["name"], municipalities=row["municipalities"])
            for row in await presence_db.catalogue(pool)
        ],
        features=[
            MunicipalityFeature(
                id=row["pcode"],
                geometry=json.loads(row["geometry"]),
                properties=_municipality(row),
            )
            for row in drawn
        ],
        regions=[
            PresenceFeature(
                id=row["place_id"],
                geometry=json.loads(row["geometry"]),
                properties=PresenceProperties(
                    place_id=row["place_id"],
                    name=row["name"],
                    iso2=row["iso2"],
                    municipalities=row["municipalities"],
                    with_presence=row["with_presence"],
                    without_information=row["without_information"],
                    groups=row["groups"],
                    trace=Trace(doc_id=row["sample_doc"], chunk_id=row["sample_chunk"]),
                ),
            )
            for row in territories
        ],
        places=[_municipality(row) for row in places],
    )


def _municipality(row) -> Municipality:
    """Una fila de `armed_presence` como municipio, con su traza."""
    return Municipality(
        pcode=row["pcode"],
        country=row["country"],
        admin1=row["admin1"],
        admin2=row["admin2"],
        population=row["population"],
        groups=list(row["groups"]),
        no_info=row["no_info"],
        trace=Trace(doc_id=row["doc_id"], chunk_id=row["chunk_id"]),
    )


@router.get("/alerts", summary="Alertas tempranas de la Defensoria del Pueblo")
async def alerts(
    pool: Pool,
    kind: str | None = Query(default=None, description="Inminencia o Estructural"),
    entity: str | None = Query(default=None, description="Solo alertas que nombran la entidad"),
    limit: int = Query(default=20, ge=1, le=100, description="Cuantas alertas recientes listar"),
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> Alerts:
    """Donde y cuando se emitieron alertas, separando el riesgo inminente del estructural.

    Una alerta de alcance nacional nombra varios departamentos y cuenta en cada uno: la cifra es
    "alertas que nombran el territorio", no "alertas sobre el territorio", y la vista lo declara.

    Las alertas son documentos del corpus, asi que `entity` las recorta igual que al resto del
    tablero: es el filtro global, no uno propio de esta vista.
    """
    if kind is not None and kind not in alerts_db.KINDS:
        raise HTTPException(422, f"kind tiene que ser uno de {', '.join(alerts_db.KINDS)}")

    counts = await alerts_db.coverage(pool, entity, date_from, date_to)
    return Alerts(
        kind=kind,
        alerts=counts["alerts"],
        imminent=counts["imminent"],
        structural=counts["structural"],
        since=counts["since"],
        until=counts["until"],
        features=[
            AlertFeature(
                id=row["place_id"],
                geometry=json.loads(row["geometry"]),
                properties=AlertProperties(
                    place_id=row["place_id"],
                    name=row["name"],
                    iso2=row["iso2"],
                    alerts=row["alerts"],
                    imminent=row["imminent"],
                    structural=row["structural"],
                    latest=row["latest"],
                    trace=Trace(doc_id=row["sample_doc"], chunk_id=row["sample_chunk"]),
                ),
            )
            for row in await alerts_db.by_territory(pool, kind, entity, date_from, date_to)
        ],
        years=[
            AlertYear(
                year=row["year"],
                alerts=row["alerts"],
                imminent=row["imminent"],
                structural=row["structural"],
            )
            for row in await alerts_db.by_year(pool, kind, entity, date_from, date_to)
        ],
        recent=[
            Alert(
                doc_id=row["doc_id"],
                code=row["code"],
                kind=row["kind"],
                issued_on=row["issued_on"],
                trace=Trace(doc_id=row["doc_id"], chunk_id=row["chunk_id"]),
            )
            for row in await alerts_db.recent(pool, kind, limit, entity, date_from, date_to)
        ],
    )


@router.get("/territories/{place_id}", summary="Todo lo que el radar sabe de un territorio")
async def territory(
    pool: Pool,
    place_id: str = Path(pattern=r"^[A-Z]{3}$|^CO-[A-Z]{2,3}$", description="Pais o departamento"),
    phenomenon: Phenomenon | None = Query(default=None, description="Limitar a un fenomeno"),
    group: str | None = Query(default=None, description="Limitar los municipios a un grupo"),
    kind: str | None = Query(default=None, description="Limitar las alertas a una clase de riesgo"),
    limit: int = Query(default=12, ge=1, le=60, description="Cuantos fragmentos devolver"),
    date_from: DateFrom = None,
    date_to: DateTo = None,
) -> Territory:
    """La evidencia de un territorio, para el detalle de la barra lateral.

    Las tres secciones vienen de fuentes distintas y pueden no coincidir: un municipio puede
    registrar presencia armada sin que ningun documento del corpus lo nombre, y eso es informacion,
    no un error. Cada seccion declara de donde sale.
    """
    place = await places_db.by_id(pool, place_id)
    if place is None:
        raise HTTPException(404, f"No hay ningun territorio con id {place_id}")

    value = phenomenon.value if phenomenon else None
    total, rows = await territory_db.fragments(
        pool, place_id, value, limit, date_from, date_to
    )
    towns = (
        await territory_db.municipalities(pool, place["name"], group)
        if place["level"] == "department"
        else []
    )
    warnings = (
        await territory_db.alerts(pool, place_id, kind, date_from, date_to)
        if place["level"] == "department"
        else []
    )

    return Territory(
        place_id=place["place_id"],
        name=place["name"],
        iso2=place["iso2"],
        level=place["level"],
        phenomenon=value,
        total_fragments=total,
        fragments=[
            PlaceFragment(
                doc_id=row["doc_id"],
                chunk_id=row["chunk_id"],
                phenomenon=row["phenomenon"],
                observatory=row["observatory"],
                language=row["language"],
                mentions=row["mentions"],
                excerpt=row["excerpt"],
                truncated=row["truncated"],
            )
            for row in rows
        ],
        municipalities=[
            Municipality(
                pcode=row["pcode"],
                country=row["country"],
                admin1=row["admin1"],
                admin2=row["admin2"],
                population=row["population"],
                groups=list(row["groups"]),
                no_info=row["no_info"],
                trace=Trace(doc_id=row["doc_id"], chunk_id=row["chunk_id"]),
            )
            for row in towns
        ],
        alerts=[
            TerritoryAlert(
                doc_id=row["doc_id"],
                code=row["code"],
                kind=row["kind"],
                issued_on=row["issued_on"],
                excerpt=row["excerpt"],
                trace=Trace(doc_id=row["doc_id"], chunk_id=row["chunk_id"]),
            )
            for row in warnings
        ],
    )
