# Radar Estratégico de Tendencias Aeroespaciales

Codefest Ad Astra 2026, Etapa 2. Sistema multiagente que analiza tres fenómenos sobre el corpus de
la Etapa 1 y presenta los hallazgos en un tablero interactivo y un asistente conversacional, con
cada afirmación trazable a su fragmento de origen.

- **F1** — inteligencia artificial y capacidades estratégicas en entornos militares
- **F2** — seguridad del entorno espacial y órbita baja
- **F3** — dinámicas territoriales en América Latina y el Caribe

```
backend/    FastAPI + LangGraph: API de agregación, orquestador y agentes especializados
frontend/   Next.js + Recharts + MapLibre: tablero de componentes y chat
docs/       Arquitectura y decisiones
```

## Puesta en marcha local

Requisitos: Docker, [uv](https://docs.astral.sh/uv/), Node 22 y pnpm.

```bash
cp .env.example .env          # rellenar contraseña, endpoint de modelos y clave
docker compose up -d db

# Backend
cd backend
uv sync
uv run --env-file ../.env uvicorn app.main:app --port 8000

# Frontend
cd ../frontend && pnpm install && pnpm dev
```

El tablero queda en `http://localhost:3000` y la API en `http://127.0.0.1:8000`; `/health` responde
`{"status":"ok"}` cuando el backend está arriba.

Todo en contenedores: `docker compose up --build`.

Tras cambiar una respuesta del backend, regenerar los tipos del frontend con `pnpm api:types`.

## Despliegue

Tres recursos en Coolify, cada uno con build pack **Dockerfile** y su dominio propio:

| Recurso | Base Directory | Variables de build | Puerto |
|---|---|---|---|
| `agent.` | `/backend` | — | 8000 |
| `frontagent.` | `/frontend` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SURFACE=chat` | 3000 |
| `dashboard.` | `/frontend` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SURFACE=dashboard` | 3000 |

Las credenciales van en *Environment Variables* de cada recurso, nunca en el repositorio ni como
build args. En la configuración de cada dominio, `www redirect` queda en **No redirect** y el campo
*Port* tiene que coincidir con el puerto interno del contenedor.

## Licencia

Apache 2.0. El mapa usa teselas de OpenFreeMap (© OpenMapTiles, © OpenStreetMap), con uso comercial
permitido y atribución obligatoria.
