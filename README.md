# Radar Estratégico de Tendencias Aeroespaciales

Codefest Ad Astra 2026, Etapa 2. Sistema multiagente que analiza tres fenómenos sobre el corpus de
la Etapa 1 y presenta los hallazgos en un tablero interactivo y un asistente conversacional, con
cada afirmación trazable a su fragmento de origen.

- **F1** — inteligencia artificial y capacidades estratégicas en entornos militares
- **F2** — seguridad del entorno espacial y órbita baja
- **F3** — dinámicas territoriales en América Latina y el Caribe

El diseño del sistema y el porqué de cada decisión están en
**[`docs/arquitectura.md`](docs/arquitectura.md)**.

```
backend/     FastAPI: API de agregación, orquestador y agentes especializados
  app/       endpoints, agentes, herramientas y recuperación
  precompute/ procesos que derivan entidades, lugares y fechas del índice
frontend/    Next.js + MapLibre + Recharts: tablero de componentes y chat
docs/        documento de arquitectura y la especificación del reto
```

---

## Cómo se usa

### El tablero (`dashboard.`)

El mapa es el lienzo y todo lo demás se apoya en sus bordes.

- **Filtrar por fenómeno**: los tres botones de la barra izquierda. El filtro se propaga a todas
  las vistas y queda en la URL, así que el enlace se puede compartir con el filtro puesto.
- **Pedirle algo al agente**: se escribe en el analista, a la derecha. Lo que el agente active
  reemplaza los componentes del panel de análisis — el tablero no muestra todo a la vez.
- **Filtrar por entidad** (*brushing*): un clic en el nombre de una fila de la matriz, en un nodo de
  la red o en un punto del cuadrante reduce el resto de vistas a los documentos que la nombran. El
  filtro activo aparece arriba y se quita con un clic o con `Esc`.
- **Verificar cualquier dato**: un clic en una celda, una arista o un territorio abre el documento
  original en el fragmento exacto que lo sustenta. En el cuadrante, doble clic.
- **Cambiar lo que mide el mapa**: *Documentos*, *Alertas* o *Grupos armados*, en la barra
  izquierda bajo el filtro de fenómeno. Cada vista tiene su filtro propio —clase de riesgo, grupo
  armado— y su ficha con la fuente y sus límites. En *Documentos*, además, se alterna entre países
  y departamentos.

  Las alertas y la presencia armada solo existen en el fenómeno 3, así que elegirlas fija ese
  filtro, y cambiar a otro fenómeno devuelve el mapa a *Documentos*: el tablero nunca enseña cifras
  de un fenómeno bajo la etiqueta de otro.

### El chat de pruebas (`frontagent.`)

La misma imagen del frontend con `NEXT_PUBLIC_SURFACE=chat`: solo el asistente, para interactuar
con el agente a mano durante la evaluación.

### El endpoint del agente (`agent.`)

```bash
curl -X POST https://agent.<equipo>.codefest2026.augusta.avaldigitallabs.com/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "¿Qué riesgos describe el corpus para la órbita baja terrestre?"}'
```

Responde el JSON de la sección 2.4 de la especificación: `respuesta`, `evaluacion` y `metadata`.
La ficha del sistema multiagente (§2.3) es [`agent_card.json`](agent_card.json), generada desde la
declaración de agentes para que no pueda quedar desfasada de lo que el sistema hace.

---

## Puesta en marcha local

Requisitos: Docker, [uv](https://docs.astral.sh/uv/), Node 22 y pnpm.

```bash
cp .env.example .env          # rellenar contraseña, endpoint de modelos y clave
docker compose up -d db
```

**Backend** (la primera vez descarga el encoder BGE-M3, unos 2 GB):

```bash
cd backend
uv sync
uv run --env-file ../.env uvicorn app.main:app --port 8000
```

**Frontend**:

```bash
cd frontend && pnpm install && pnpm dev
```

El tablero queda en `http://localhost:3000` y la API en `http://127.0.0.1:8000`.
Todo en contenedores: `docker compose up --build`.

Sin `DATABASE_URL` el servicio arranca igual, pero `/health` responde 503: el contenedor tiene que
poder desplegarse antes de que exista la base, y a la vez un proceso que no puede leer el corpus
no puede darse por sano.

### Cargar los datos

El índice de la Etapa 1 va a la tabla `fragments`. Con esa tabla cargada, los precómputos derivan lo
que consume el tablero, **en este orden**:

```bash
cd backend
uv run --env-file ../.env python -m precompute.entities         # entidades y sus menciones
uv run --env-file ../.env python -m precompute.places           # países y departamentos
uv run --env-file ../.env python -m precompute.document_dates   # fechas desde la metadata de la fuente
uv run --env-file ../.env python -m precompute.armed_presence   # presencia armada por municipio
uv run --env-file ../.env python -m precompute.early_warnings   # alertas de la Defensoría
uv run --env-file ../.env python -m precompute.amazon_regions   # geometría de nivel 1 de la cuenca

# Municipios: necesita los ADM2 de geoBoundaries (gbOpen) de los seis países amazónicos,
# descargados como adm2_<ISO3>.json en una carpeta cualquiera.
uv run --env-file ../.env python -m precompute.municipalities --data <carpeta>
```

Cada uno es idempotente y dice por consola qué produjo. `document_dates` informa además de cuántos
documentos quedaron fechados y con qué regla, que es lo que declara la línea de tiempo.

### Tras cambiar una respuesta del backend

Los tipos del frontend se generan del OpenAPI, así que nada se escribe a mano dos veces:

```bash
cd frontend && pnpm api:types    # con el backend corriendo en :8000
```

---

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

Pasos, iguales para los tres (Anexo A de la especificación):

1. **Llave SSH**: Root Team → Keys & Tokens → Private Keys → New Private Key → *Generate ED25519*.
   La pública se registra en GitHub, en Settings → SSH and GPG keys.
2. **Recurso**: Applications → *Private Git Repository (with Deploy Key)*, con la URL del
   repositorio privado, la rama `main` y Build pack **Dockerfile**.
3. **Dominio**: + Add Domain con el subdominio del equipo. En su engranaje, *Port* tiene que
   coincidir con el puerto interno del contenedor y `www redirect` queda en **No redirect**.
4. **Variables**: las de la tabla en *Environment Variables*.

Las credenciales van en *Environment Variables* de cada recurso, **nunca** en el repositorio ni como
build args: un build arg queda dentro de la imagen. El endpoint declarado en la ficha del agente
(`AGENT_ENDPOINT`) tiene que coincidir con el subdominio `agent.` configurado.

Ambos Dockerfiles construyen imágenes autosuficientes, corren sin root y traen `HEALTHCHECK`.

### Variables de entorno

| Variable | Quién la usa | Para qué |
|---|---|---|
| `DATABASE_URL` | backend | Postgres con el índice y los precómputos |
| `LITELLM_BASE_URL` | backend | Endpoint de modelos, compatible con OpenAI |
| `LITELLM_API_KEY` | backend | Clave del endpoint de modelos |
| `FAST_MODEL` / `DEEP_MODEL` | backend | Modelo del agente de visualizaciones y del de corpus |
| `PROVIDER` | backend | Proveedor declarado en la ficha |
| `AGENT_ENDPOINT` | backend | URL pública que declara la ficha |
| `CORS_ORIGINS` | backend | Orígenes permitidos, separados por coma |
| `LOAD_INDEX` | backend | `false` levanta el servicio sin cargar el encoder |
| `NEXT_PUBLIC_API_URL` | frontend (build) | Dónde está la API |
| `NEXT_PUBLIC_SURFACE` | frontend (build) | `dashboard` o `chat` |

---

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
permitido y atribución obligatoria. Las geometrías son de Natural Earth (dominio público).
