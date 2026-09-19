"""Endpoints de agregacion: los consume el tablero y, envueltos como herramientas, el agente.

No exponen el indice crudo. Cada respuesta llega lista para pintar, con los identificadores que
permiten volver al fragmento de origen.
"""

from fastapi import APIRouter, HTTPException, Query

from app.db import breakdown as breakdown_db
from app.db import entities as entities_db
from app.db import documents as documents_db
from app.db.pool import Pool
from app.params import BreakdownField, MatrixColumn, Phenomenon
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


@router.get("/documents/{doc_id}", summary="El documento y sus fragmentos")
async def document(pool: Pool, doc_id: str) -> Document:
    """El texto original detras de cualquier dato del tablero."""
    rows = await documents_db.fetch(pool, doc_id)
    if not rows:
        raise HTTPException(404, f"No hay ningun documento con doc_id {doc_id}")
    first = rows[0]
    return Document(
        doc_id=first["doc_id"],
        title=first["title"],
        observatory=first["observatory"],
        phenomenon=first["phenomenon"],
        language=first["language"],
        format=first["format"],
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
            row=row["row_label"],
            col=row["col_label"] or "sin dato",
            documents=row["documents"],
            mentions=row["mentions"],
            trace=Trace(doc_id=row["sample_doc"], chunk_id=row["sample_chunk"]),
        )
        for row in rows
    ]
    return Matrix(
        rows=sorted({cell.row for cell in cells}),
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
                sample_doc=edge["sample_doc"],
            )
            for edge in edges
        ],
    )
