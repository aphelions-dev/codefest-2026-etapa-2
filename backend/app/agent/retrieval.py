"""Recuperacion sobre el indice de la Etapa 1, cargado en pgvector.

La politica es la que se midio en la Etapa 1 (NDCG@10 0,7329) y se porta sin tocarla: BGE-M3, RRF
con k0 = 60, realce x1,05 del fenomeno pedido, deduplicacion por texto y tope por documento.

El embedding se calcula en el proceso, no en el proxy: la columna `fragments.embedding` se genero
con BGE-M3 y una consulta codificada con otro modelo no encuentra nada aunque la dimension cuadre.
"""

import asyncio
from dataclasses import asdict, dataclass

import asyncpg
import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import Settings

ENCODER_MODEL = "BAAI/bge-m3"
CANDIDATES = 200
RRF_K0 = 60
PHENOMENON_BOOST = 1.05

PHENOMENA = {
    1: "IA y Capacidades Estrategicas",
    2: "Seguridad del Entorno Espacial",
    3: "Dinamicas Territoriales",
}


@dataclass
class Fragment:
    chunk_id: str
    doc_id: str
    source_file: str
    phenomenon: int
    language: str
    observatory: str | None
    position: int | None
    text: str
    # Coseno: mide si hay evidencia. `score` es RRF y solo mide posicion.
    similarity: float
    score: float = 0.0
    context: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class Retriever:
    def __init__(self, pool: asyncpg.Pool, encoder: SentenceTransformer, settings: Settings):
        self._pool = pool
        self._encoder = encoder
        self._settings = settings

    @classmethod
    async def open(cls, pool: asyncpg.Pool, settings: Settings) -> "Retriever":
        """Carga el encoder una vez: residente, 0,36 s por consulta frente a 35,9 s recargandolo."""
        encoder = await asyncio.to_thread(SentenceTransformer, ENCODER_MODEL, device="cpu")
        return cls(pool, encoder, settings)

    async def search(self, queries: list[str], phenomenon: int | None = None) -> list[Fragment]:
        """Una o varias formulaciones de la misma pregunta, fusionadas por RRF."""
        rankings = [await self._candidates(query) for query in queries]
        fused = _fuse(rankings, phenomenon)
        diverse = _diversify(_drop_duplicates(fused), self._settings.max_fragments_per_doc)
        selected = diverse[: self._settings.top_k]
        await self._expand(selected)
        return selected

    async def _candidates(self, query: str) -> list[Fragment]:
        vector = await asyncio.to_thread(self._encode, query)
        async with self._pool.acquire() as conn, conn.transaction():
            await conn.execute(f"SET LOCAL hnsw.ef_search = {self._settings.hnsw_ef_search}")
            rows = await conn.fetch(
                """
                SELECT chunk_id, doc_id, source_file, phenomenon, language, observatory, position,
                       text, 1 - (embedding <=> $1) AS similarity
                FROM fragments ORDER BY embedding <=> $1 LIMIT $2
                """,
                vector,
                CANDIDATES,
            )
        return [Fragment(**dict(row)) for row in rows]

    def _encode(self, text: str) -> np.ndarray:
        return self._encoder.encode(text, normalize_embeddings=True, convert_to_numpy=True)

    async def _expand(self, fragments: list[Fragment]) -> None:
        """Fragmento mas sus vecinos del mismo documento: un chunk empieza y acaba a media idea."""
        keys = [
            (f.doc_id, f.position + offset)
            for f in fragments
            if f.position is not None
            for offset in (-1, 1)
        ]
        if not keys:
            return
        rows = await self._pool.fetch(
            """
            SELECT f.doc_id, f.position, f.text
            FROM fragments f JOIN unnest($1::text[], $2::int[]) AS k(doc_id, position)
              ON f.doc_id = k.doc_id AND f.position = k.position
            """,
            [doc_id for doc_id, _ in keys],
            [position for _, position in keys],
        )
        neighbors = {(row["doc_id"], row["position"]): row["text"] for row in rows}
        for fragment in fragments:
            before = neighbors.get((fragment.doc_id, (fragment.position or 0) - 1), "")
            after = neighbors.get((fragment.doc_id, (fragment.position or 0) + 1), "")
            fragment.context = "\n".join(p for p in (before, fragment.text, after) if p)


def _fuse(rankings: list[list[Fragment]], phenomenon: int | None) -> list[Fragment]:
    """RRF sobre los rankings de cada formulacion; la similitud es la mejor que obtuvo."""
    pooled: dict[str, Fragment] = {}
    for ranking in rankings:
        for rank, candidate in enumerate(ranking, start=1):
            fragment = pooled.setdefault(candidate.chunk_id, candidate)
            fragment.score += 1.0 / (RRF_K0 + rank)
            fragment.similarity = max(fragment.similarity, candidate.similarity)
    for fragment in pooled.values():
        if phenomenon is not None and fragment.phenomenon == phenomenon:
            fragment.score *= PHENOMENON_BOOST
    return sorted(pooled.values(), key=lambda c: c.score, reverse=True)


def _drop_duplicates(candidates: list[Fragment]) -> list[Fragment]:
    """El 3% de los fragmentos del corpus repite texto: tablas reimpresas, encabezados."""
    seen: set[str] = set()
    unique = []
    for candidate in candidates:
        key = " ".join(candidate.text.split()).casefold()
        if key not in seen:
            seen.add(key)
            unique.append(candidate)
    return unique


def _diversify(candidates: list[Fragment], max_per_doc: int) -> list[Fragment]:
    """Tope por documento; si la lista queda corta se completa con los descartados."""
    selected, rest, per_doc = [], [], {}
    for candidate in candidates:
        if per_doc.get(candidate.doc_id, 0) < max_per_doc:
            selected.append(candidate)
            per_doc[candidate.doc_id] = per_doc.get(candidate.doc_id, 0) + 1
        else:
            rest.append(candidate)
    return selected + rest
