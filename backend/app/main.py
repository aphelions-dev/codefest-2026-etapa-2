"""API del radar. Un unico puerto HTTP, como exige el despliegue en contenedor."""

import logging
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pgvector.asyncpg import register_vector

from app.agent.graph import Runtime, build
from app.agent.llm import Client
from app.agent.retrieval import Retriever
from app.api import aggregate, chat
from app.config import settings
from app.logging import configure

log = logging.getLogger("agent.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Un pool por proceso: abrir una conexion por peticion cuesta mas que la consulta.

    El encoder y el grafo se montan aqui tambien. BGE-M3 tarda unos segundos en cargar y se queda
    residente: cargarlo por consulta son 35,9 s frente a 0,36 s.

    Lo que falta degrada el servicio, no lo tumba: sin `DATABASE_URL` no hay datos, y sin proxy ni
    modelos no hay asistente, pero el contenedor arranca y responde para que el despliegue no se
    revierta antes de que el operador termine de configurarlo.
    """
    configure()

    # `register_vector` en cada conexion: sin el codec, asyncpg no sabe mandar un embedding.
    app.state.pool = (
        await asyncpg.create_pool(
            settings.database_url, min_size=1, max_size=8, init=register_vector
        )
        if settings.database_url
        else None
    )

    app.state.agent = None
    client: Client | None = None
    ready = all(
        (settings.litellm_base_url, settings.litellm_api_key, settings.fast_model, settings.deep_model)
    )
    if app.state.pool is not None and ready:
        client = Client.open(settings)
        retriever = await Retriever.open(app.state.pool, settings)
        runtime = Runtime(client=client, retriever=retriever, settings=settings)
        app.state.agent = (build(runtime), runtime)
        log.info("asistente listo", extra={"fast": settings.fast_model, "deep": settings.deep_model})
    else:
        log.warning("el asistente queda deshabilitado: falta base de datos, proxy o modelos")

    try:
        yield
    finally:
        if client is not None:
            await client.close()
        if app.state.pool is not None:
            await app.state.pool.close()


app = FastAPI(title="Radar Estrategico de Tendencias Aeroespaciales", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
# Las capas del mapa son GeoJSON: la presencia armada pasa de 13 MB con la geometria municipal
# completa, y el texto de coordenadas comprime como pocas cosas.
app.add_middleware(GZipMiddleware, minimum_size=1024, compresslevel=5)


app.include_router(aggregate.router)
app.include_router(chat.router)


@app.get("/health")
async def health(response: Response) -> dict[str, str]:
    """Lo que mira el healthcheck del contenedor.

    Comprueba la base de datos: un proceso que responde pero no puede consultar el corpus esta
    caido a efectos de la demo, y marcarlo sano solo retrasa el diagnostico.
    """
    if app.state.pool is None:
        response.status_code = 503
        return {"status": "degraded", "database": "sin configurar"}
    try:
        await app.state.pool.fetchval("select 1")
    except Exception:
        log.exception("el healthcheck no pudo consultar la base de datos")
        response.status_code = 503
        return {"status": "degraded", "database": "inalcanzable"}
    return {"status": "ok", "database": "ok", "agent": "ok" if app.state.agent else "deshabilitado"}
