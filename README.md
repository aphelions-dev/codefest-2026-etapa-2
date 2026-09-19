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
docs/        documento de arquitectura y propuesta de visualización por fenómeno
```

---

## Para evaluar

Equipo **Aphelion**.

> **Endpoint del equipo:** `POST https://agent.aphelion.codefest2026.augusta.avaldigitallabs.com/chat`

Los tres servicios están desplegados en Coolify y son públicos:

| Qué | URL | Reto |
|---|---|---|
| Endpoint del agente | `POST https://agent.aphelion.codefest2026.augusta.avaldigitallabs.com/chat` | Reto 1 |
| Chat para probarlo a mano | <https://frontagent.aphelion.codefest2026.augusta.avaldigitallabs.com> | Reto 1 |
| Tablero | <https://dashboard.aphelion.codefest2026.augusta.avaldigitallabs.com> | Reto 2 |

**El endpoint** recibe la pregunta en `input` y responde el JSON de la §2.4 (`respuesta`,
`evaluacion`, `metadata`):

```bash
curl -X POST https://agent.aphelion.codefest2026.augusta.avaldigitallabs.com/chat \
  -H "Content-Type: application/json" \
  -d '{"input": "¿Qué grupos armados operan en el Putumayo?"}'
```

- **Ficha del sistema multiagente** (§2.3): [`agent_card.json`](agent_card.json). Su `endpoint` es
  el de la tabla.
- **Salud**: `GET https://agent.aphelion.codefest2026.augusta.avaldigitallabs.com/health` responde
  `{"status": "ok", "database": "ok", "agent": "ok"}`.
- **API de agregación** que consumen el tablero y sus componentes, documentada en
  `https://agent.aphelion.codefest2026.augusta.avaldigitallabs.com/docs` (OpenAPI).

**Documentos:** diseño del sistema y propuesta de visualización por fenómeno en
[`docs/arquitectura.md`](docs/arquitectura.md); fuentes de datos y licencias en
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

---

## Cómo se usa

### El tablero (`dashboard.`)

El mapa es el lienzo; la barra izquierda, la franja inferior y el analista se apoyan en sus bordes.

- **Filtrar por fenómeno**: los mosaicos *Todos · IA · Espacio · Territorio* de la barra
  izquierda. El filtro se propaga a todas las vistas y queda en la URL (`?fenomeno=`).
- **Filtrar por periodo**: en la franja de la línea de tiempo, con los atajos *12 m · 24 m ·
  5 años*, con el deslizador por meses o con un clic en la barra de un año. Queda en la URL
  (`?desde=AAAA-MM&hasta=AAAA-MM`) y recorta el mapa, el detalle y los componentes. Un documento
  entra cuando toda su fecha conocida cae en el periodo: los fechados solo por año entran si el
  periodo cubre su año entero. El ⓘ de la franja lo explica.
- **Cambiar lo que mide el mapa**: *Documentos*, *Alertas* o *Grupos*, con el alcance de cada capa
  debajo. En *Documentos* se alterna entre países y departamentos, y el nivel **también sigue al
  zoom**: acercarse a Colombia muestra sus departamentos. En *Alertas* se elige la clase de
  riesgo; en *Grupos*, un grupo armado de la lista con barras. Alertas y grupos solo existen en el
  fenómeno 3, así que elegirlas fija ese filtro.
- **Explorar un territorio**: pasar el cursor enseña su ficha (cifra, puesto con empates,
  desglose); el clic lo fija, lo encuadra y abre en la barra la evidencia con cada mención
  **resaltada** tal como se contó.
- **Componentes de análisis**: la píldora *Análisis* sobre el mapa lista los activos (matriz de
  calor, cuadrante, red, histograma); cada uno se abre en un diálogo grande que deja el analista a
  la vista. Lo que el agente active reemplaza esa lista: el tablero no muestra todo a la vez.
- **Filtrar por entidad** (*brushing*): un clic en una fila de la matriz, en un nodo de la red o en
  un punto del cuadrante reduce las demás vistas a los documentos que la nombran. El filtro se
  quita desde el chip del diálogo.
- **Verificar cualquier dato**: toda cifra lleva a su `doc_id` y `chunk_id`. Una celda, una arista,
  una barra o un territorio abren el documento en el fragmento exacto; los nodos de la red y los
  puntos del cuadrante, con doble clic.
- **Preguntar**: en el analista, a la derecha. Cada respuesta enseña sus citas enlazadas, las
  fuentes que leyó (las citadas aparte) y el **razonamiento**: los agentes que participaron, en
  orden, con su
  modelo, sus tokens y cada herramienta con lo que devolvió.
- **Ir al chat a solas**: el botón *Chat* de la cabecera abre `frontagent.`.

### El chat de pruebas (`frontagent.`)

La misma imagen del frontend con `NEXT_PUBLIC_SURFACE=chat`: solo el asistente, para interactuar
con el agente a mano durante la evaluación. Tiene lo mismo que el analista del tablero —citas que
abren el documento, fuentes y razonamiento— y un botón *Tablero* para volver al radar.

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

En producción, la imagen del backend lleva `precompute/` dentro, así que cualquiera de ellos se
puede volver a correr desde la terminal del contenedor en Coolify, contra la misma base:

```bash
python -m precompute.places    # p. ej., tras corregir el diccionario de lugares
```

El esquema se aplica al arrancar la API (es idempotente), así que una columna nueva existe aunque
el precompute todavía no haya corrido.

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

La pregunta se puede mandar como el Anexo A.4 la describe, «en texto plano o JSON», y dentro del
JSON con cualquiera de los nombres habituales del campo; los campos que sobren se ignoran:

```bash
curl -X POST http://127.0.0.1:8000/chat -H 'Content-Type: text/plain' \
  --data '¿Qué desafíos plantea la IA en las operaciones espaciales?'
curl -X POST http://127.0.0.1:8000/chat -H 'Content-Type: application/json' \
  -d '{"question": "…", "session_id": "lo-que-sea"}'
```

El diseño del grafo, el reparto de modelos y las defensas frente a inyección están en la
sección 2 de [`docs/arquitectura.md`](docs/arquitectura.md).

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
build args: un build arg queda dentro de la imagen. El endpoint que declara
[`agent_card.json`](agent_card.json) tiene que coincidir con el subdominio `agent.` configurado.

Ambos Dockerfiles construyen imágenes autosuficientes, corren sin root y traen `HEALTHCHECK`.

`agent.` y `dashboard.` se redespliegan solos con cada push a `main` que toque su carpeta (webhook
de GitHub); `frontagent.` se despliega a mano, para que un cambio del tablero no pueda tumbar el
chat durante la ventana del Reto 1. En esa ventana, un push que toque `backend/` redespliega el
agente evaluado: no se hace entre las 8:00 y las 12:30 sin haberlo decidido.

### Variables de entorno

| Variable | Obligatoria | Qué es |
|---|---|---|
| `DATABASE_URL` | sí | Postgres con pgvector y la tabla `fragments` de la Etapa 1 |
| `LITELLM_BASE_URL` | sí | El proxy, incluyendo `/v1` |
| `LITELLM_API_KEY` | sí | La clave de la organización. Nunca como build arg |
| `FAST_MODEL` | sí | Identificador del modelo barato, de `GET /v1/models` |
| `DEEP_MODEL` | sí | Identificador del modelo grande, de `GET /v1/models` |
| `CORS_ORIGINS` | sí | Los dominios de `frontagent.` y `dashboard.`, separados por coma |
| `HNSW_EF_SEARCH`, `EVIDENCE_THRESHOLD`, `TOP_K`, `MAX_FRAGMENTS_PER_DOC`, `MAX_RETRIES` | no | Valores medidos en la Etapa 1; solo se tocan con una medición delante |
| `NEXT_PUBLIC_API_URL` | sí, en el build del frontend | Dónde está la API |
| `NEXT_PUBLIC_SURFACE` | sí, en el build del frontend | `dashboard` o `chat` |

La imagen del backend lleva dentro BGE-M3 (~2,2 GB), el encoder con el que se generó el índice.
La primera construcción tarda; las siguientes reutilizan la capa. El contenedor no descarga pesos
en tiempo de ejecución a propósito: si faltaran, es mejor que falle al arrancar y no en la demo.

## Licencia

Apache 2.0. Los datos y el código de terceros, con su licencia y su atribución, están en
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md): teselas de OpenFreeMap (© OpenMapTiles,
© OpenStreetMap), fronteras de Natural Earth (dominio público), municipios de geoBoundaries y
presencia armada de Amazon Underworld (ambos CC BY 4.0).
