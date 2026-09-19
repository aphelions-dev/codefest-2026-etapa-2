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

El tablero queda en `http://localhost:3000` y la API en `http://127.0.0.1:8000`.

Todo en contenedores: `docker compose up --build`.

Tras cambiar una respuesta del backend, regenerar los tipos del frontend con `pnpm api:types`.

### Salud del servicio

`GET /health` consulta la base de datos antes de responder: un proceso que contesta pero no puede
leer el corpus está caído a efectos de la demo.

```json
{"status": "ok", "database": "ok", "agent": "ok"}
```

Devuelve **503** si no hay base de datos o si no responde. `agent` vale `deshabilitado` cuando
faltan el proxy o los identificadores de modelo: el contenedor arranca igual, para que un
despliegue no se revierta mientras se termina de configurar.

## El asistente conversacional (Reto 1)

Un único endpoint, `POST /chat`:

```bash
curl -X POST http://127.0.0.1:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"input": "¿Qué desafíos plantea la IA en las operaciones espaciales?"}'
```

Responde con el contrato de la especificación: `respuesta`, `evaluacion` (con `retrieval_context`
y `tools_called`) y `metadata` (tokens por agente, número de interacciones, latencia y estado).

El diseño del grafo, el reparto de modelos y las defensas frente a inyección están en
[`ARQUITECTURA.md`](ARQUITECTURA.md).

### Los identificadores de modelo no se suponen

`FAST_MODEL` y `DEEP_MODEL` tienen que ser los que expone el proxy, que cambian entre entornos:

```bash
curl -s -H "Authorization: Bearer $LITELLM_API_KEY" "$LITELLM_BASE_URL/models"
```

Con esos valores puestos se genera la ficha del agente, que se produce a partir de la declaración
de agentes y nunca se escribe a mano:

```bash
cd backend && PYTHONUTF8=1 uv run --env-file ../.env python -m scripts.agent_card
```

El script verifica contra `GET /v1/models` que los dos identificadores existen antes de escribir
`agent_card.json`.

### Tests

```bash
cd backend && PYTHONUTF8=1 uv run --group dev pytest
```

Cubren los dos guardarraíles con casos conocidos de inyección, el verificador, y el grafo completo
de punta a punta con el proxy y el índice mockeados.

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

### Variables de entorno del recurso `agent.`

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | sí | Postgres con pgvector y la tabla `fragments` de la Etapa 1 |
| `LITELLM_BASE_URL` | sí | El proxy, incluyendo `/v1` |
| `LITELLM_API_KEY` | sí | La clave de la organización. Nunca como build arg |
| `FAST_MODEL` | sí | Identificador del modelo barato, de `GET /v1/models` |
| `DEEP_MODEL` | sí | Identificador del modelo grande, de `GET /v1/models` |
| `CORS_ORIGINS` | sí | Los dominios de `frontagent.` y `dashboard.`, separados por coma |
| `HNSW_EF_SEARCH`, `EVIDENCE_THRESHOLD`, `TOP_K`, `MAX_FRAGMENTS_PER_DOC`, `MAX_RETRIES` | no | Valores medidos en la Etapa 1; solo se tocan con una medición delante |

La imagen del backend lleva dentro BGE-M3 (~2,2 GB), el encoder con el que se generó el índice.
La primera construcción tarda; las siguientes reutilizan la capa. El contenedor no descarga pesos
en tiempo de ejecución a propósito: si faltaran, es mejor que falle al arrancar y no en la demo.

## Licencia

Apache 2.0. El mapa usa teselas de OpenFreeMap (© OpenMapTiles, © OpenStreetMap), con uso comercial
permitido y atribución obligatoria.
