"""API del radar. Un unico puerto HTTP, como exige el despliegue en contenedor."""

from contextlib import asynccontextmanager

import asyncpg
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agents import Models, Orchestrator
from app.api import aggregate, chat
from app.config import settings
from app.retrieval import Retriever
from app.tools import Toolbox


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Un pool por proceso: abrir una conexion por peticion cuesta mas que la consulta.

    Sin `DATABASE_URL` el servicio arranca igual y solo falla lo que consulta datos. El contenedor
    tiene que poder desplegarse y responder al healthcheck antes de que exista la base.
    """
    app.state.pool = (
        await asyncpg.create_pool(settings.database_url, min_size=1, max_size=8)
        if settings.database_url
        else None
    )
    # El encoder tarda en cargar y ocupa memoria: se carga una vez por proceso, y solo si hay
    # indice al que preguntar.
    retriever = (
        await Retriever.open(app.state.pool)
        if app.state.pool is not None and settings.load_index
        else None
    )
    app.state.client = httpx.AsyncClient()
    app.state.toolbox = (
        Toolbox(pool=app.state.pool, retriever=retriever) if app.state.pool is not None else None
    )
    app.state.orchestrator = (
        Orchestrator(Models(settings, app.state.client), app.state.toolbox, settings)
        if app.state.toolbox is not None and settings.litellm_api_key
        else None
    )
    try:
        yield
    finally:
        await app.state.client.aclose()
        if app.state.pool is not None:
            await app.state.pool.close()


app = FastAPI(title="Radar Estrategico de Tendencias Aeroespaciales", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


app.include_router(aggregate.router)
app.include_router(chat.router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Lo que mira el healthcheck del contenedor antes de dar el servicio por arriba."""
    return {"status": "ok"}
