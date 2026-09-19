"""Acceso al pool. Las consultas viven en los modulos de `db/`, nunca en los endpoints."""

from typing import Annotated

import asyncpg
from fastapi import Depends, HTTPException, Request


async def get_pool(request: Request) -> asyncpg.Pool:
    pool = request.app.state.pool
    if pool is None:
        raise HTTPException(503, "El servicio no tiene base de datos configurada")
    return pool


Pool = Annotated[asyncpg.Pool, Depends(get_pool)]
