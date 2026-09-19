"""Recuperacion sobre el indice de la Etapa 1, cargado en pgvector.

La politica de la lista de fragmentos es la que midio la Etapa 1 (NDCG@10 0,7329): BGE-M3 solo,
RRF con k0 = 60, realce del fenomeno pedido, deduplicacion por texto y tope de fragmentos por
documento. Es lo que come el agente de corpus, y lo que viaja como `retrieval_context`.
"""

import asyncio
from dataclasses import dataclass

import asyncpg
import numpy as np
from sentence_transformers import SentenceTransformer

ENCODER_MODEL = "BAAI/bge-m3"
CANDIDATES = 200
RRF_K0 = 60
PHENOMENON_BOOST = 1.05
TOP_K = 8
MAX_PER_DOC = 3
HNSW_EF_SEARCH = 200

PHENOMENA = {
    1: "IA y capacidades estrategicas en entornos militares",
    2: "Seguridad del entorno espacial y orbita baja",
    3: "Dinamicas territoriales en America Latina",
}


@dataclass
class Fragment:
    """Un fragmento recuperado, con lo que hace falta para citarlo y para volver a su documento."""

    chunk_id: str
    doc_id: str
    phenomenon: int
    observatory: str | None
    position: int | None
    text: str
    # Coseno: mide si hay evidencia. `score` es RRF y solo mide posicion en el ranking.
    similarity: float
    score: float = 0.0
    context: str = ""


class Retriever:
    """El indice, detras de una interfaz que solo sabe buscar. Nada mas lo toca."""

    def __init__(self, pool: asyncpg.Pool, encoder: SentenceTransformer):
        self._pool = pool
        self._encoder = encoder

    @classmethod
    async def open(cls, pool: asyncpg.Pool) -> "Retriever":
        """Carga el encoder una vez: residente cuesta decimas por consulta, recargado cuesta medio minuto."""
        encoder = await asyncio.to_thread(SentenceTransformer, ENCODER_MODEL, device="cpu")
        return cls(pool, encoder)

    async def search(self, query: str, phenomenon: int | None = None) -> list[Fragment]:
        """Los fragmentos mas relevantes para la pregunta, ya diversificados por documento."""
        candidates = await self._candidates(query)
        fused = _boost(candidates, phenomenon)
        diverse = _diversify(_drop_duplicates(fused), MAX_PER_DOC)[:TOP_K]
        await self._expand(diverse)
        return diverse

    async def _candidates(self, query: str) -> list[Fragment]:
        vector = await asyncio.to_thread(self._encode, query)
        async with self._pool.acquire() as connection, connection.transaction():
            await connection.execute(f"set local hnsw.ef_search = {HNSW_EF_SEARCH}")
            rows = await connection.fetch(
                """
                select chunk_id, doc_id, phenomenon, observatory, position, text,
                       1 - (embedding <=> $1) as similarity
                from fragments
                order by embedding <=> $1
                limit $2
                """,
                str(vector.tolist()),
                CANDIDATES,
            )
        return [
            Fragment(
                chunk_id=row["chunk_id"],
                doc_id=row["doc_id"],
                phenomenon=row["phenomenon"],
                observatory=row["observatory"],
                position=row["position"],
                text=row["text"],
                similarity=row["similarity"],
                score=1.0 / (RRF_K0 + rank),
            )
            for rank, row in enumerate(rows, start=1)
        ]

    def _encode(self, text: str) -> np.ndarray:
        return self._encoder.encode(text, normalize_embeddings=True, convert_to_numpy=True)

    async def _expand(self, fragments: list[Fragment]) -> None:
        """Fragmento mas sus vecinos del documento: un corte empieza y acaba a media idea."""
        keys = [
            (fragment.doc_id, fragment.position + offset)
            for fragment in fragments
            if fragment.position is not None
            for offset in (-1, 1)
        ]
        if not keys:
            return
        async with self._pool.acquire() as connection:
            rows = await connection.fetch(
                """
                select f.doc_id, f.position, f.text
                from fragments f
                join unnest($1::text[], $2::int[]) as k(doc_id, position)
                  on f.doc_id = k.doc_id and f.position = k.position
                """,
                [doc_id for doc_id, _ in keys],
                [position for _, position in keys],
            )
        neighbours = {(row["doc_id"], row["position"]): row["text"] for row in rows}
        for fragment in fragments:
            before = neighbours.get((fragment.doc_id, (fragment.position or 0) - 1), "")
            after = neighbours.get((fragment.doc_id, (fragment.position or 0) + 1), "")
            fragment.context = "\n".join(part for part in (before, fragment.text, after) if part)


def _boost(candidates: list[Fragment], phenomenon: int | None) -> list[Fragment]:
    """Realce del fenomeno pedido: no descarta el resto, solo lo adelanta cuando empata."""
    if phenomenon is not None:
        for candidate in candidates:
            if candidate.phenomenon == phenomenon:
                candidate.score *= PHENOMENON_BOOST
    return sorted(candidates, key=lambda candidate: candidate.score, reverse=True)


def _drop_duplicates(candidates: list[Fragment]) -> list[Fragment]:
    """Parte del corpus repite texto: tablas reimpresas, encabezados, pies de pagina."""
    seen: set[str] = set()
    unique = []
    for candidate in candidates:
        key = " ".join(candidate.text.split()).casefold()
        if key not in seen:
            seen.add(key)
            unique.append(candidate)
    return unique


def _diversify(candidates: list[Fragment], max_per_doc: int) -> list[Fragment]:
    """Tope por documento: sin el, un solo informe largo copa la evidencia entera."""
    selected, rest, per_doc = [], [], {}
    for candidate in candidates:
        if per_doc.get(candidate.doc_id, 0) < max_per_doc:
            selected.append(candidate)
            per_doc[candidate.doc_id] = per_doc.get(candidate.doc_id, 0) + 1
        else:
            rest.append(candidate)
    return selected + rest
