"""Endpoints de agregacion: los consume el tablero y, envueltos como herramientas, el agente.

No exponen el indice crudo. Cada respuesta llega lista para pintar, con los identificadores que
permiten volver al fragmento de origen.
"""

import json

from fastapi import APIRouter, HTTPException, Query

from app.db import breakdown as breakdown_db
from app.db import entities as entities_db
from app.db import places as places_db
from app.db import quadrant as quadrant_db
from app.db import timeline as timeline_db
from app.db import documents as documents_db
from app.db.pool import Pool
from app.params import (
    BreakdownField,
    DocId,
    MatrixColumn,
    OptionalChunkId,
    Phenomenon,
    PlaceLevel,
)
from app.responses import (
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
    Places,
    Quadrant,
    QuadrantPoint,
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
) -> Breakdown:
    """Alimenta el componente de barras: comparacion, distribucion y composicion."""
    value = phenomenon.value if phenomenon else None
    fragments, documents, rows = await breakdown_db.by_field(pool, by, value)
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
) -> Matrix:
    """Cruza las entidades mas presentes con otra categoria: que entidad domina cada fuente."""
    value = phenomenon.value if phenomenon else None
    rows = await entities_db.matrix(pool, cols.value, value)
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
) -> Graph:
    """Que entidades aparecen juntas, y en cuantos documentos."""
    value = phenomenon.value if phenomenon else None
    nodes, edges = await entities_db.cooccurrence(pool, entity, value, min_documents)
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
) -> Places:
    """Alimenta el mapa coropletico. Solo devuelve lugares que el corpus nombra."""
    value = phenomenon.value if phenomenon else None
    rows = await places_db.by_level(pool, level.value, value, limit, entity)
    return Places(
        level=level.value,
        phenomenon=value,
        entity=entity,
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
