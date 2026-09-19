"""API del radar. Un unico puerto HTTP, como exige el despliegue en contenedor."""

from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings


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
    try:
        yield
    finally:
        if app.state.pool is not None:
            await app.state.pool.close()


app = FastAPI(title="Radar Estrategico de Tendencias Aeroespaciales", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    """Lo que mira el healthcheck del contenedor antes de dar el servicio por arriba."""
    return {"status": "ok"}
