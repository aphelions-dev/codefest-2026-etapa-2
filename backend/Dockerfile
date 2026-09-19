# Multietapa: el entorno se construye con el toolchain de uv y solo viaja el resultado.
FROM ghcr.io/astral-sh/uv:0.9.9-python3.12-trixie-slim AS build

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app

# Las dependencias primero: cambiar el codigo no reinstala nada.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

COPY app ./app
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM python:3.12-slim-trixie AS runtime

# curl: el healthcheck de la plataforma se inyecta desde fuera de la imagen y usa curl o wget. Sin
# el, el despliegue se marca como no saludable y se revierte aunque la aplicacion este respondiendo.
# Sin root: el analisis estatico del codigo entregado lo revisa.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 radar

WORKDIR /app

COPY --from=build --chown=radar:radar /app /app
ENV PATH="/app/.venv/bin:$PATH"

USER radar
# Coolify toma el primer EXPOSE como puerto inicial del recurso.
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
