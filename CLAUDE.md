# Radar Estratégico de Tendencias Aeroespaciales

Sistema multiagente que analiza tres fenómenos —inteligencia artificial en entornos militares,
seguridad del entorno espacial, dinámicas territoriales en América Latina— y presenta los hallazgos
en un tablero interactivo y un asistente conversacional. Codefest Ad Astra 2026, Etapa 2.

**La especificación técnica de la organización manda sobre todo lo que diga este archivo.**

## Lo que descalifica o puntúa

- **El repositorio es privado, siempre.** El acceso de la organización y de los evaluadores se da
  invitándolos como colaboradores, nunca haciéndolo público.
- **Sin datos de la organización en el repo**: ni textos del corpus, ni documentos, ni volcados de
  la base. Solo código, identificadores (`doc_id`, `chunk_id`) y datos de dominio público con su
  atribución en `THIRD_PARTY_NOTICES.md`.
- **Sin credenciales en el código**: todo por variable de entorno, y el análisis estático del
  código entregado lo revisa. En Coolify, los secretos del backend no van como build args.
- **Ningún puntaje inventado en una visualización.** Conteos, frecuencias y agregaciones son
  medibles y están permitidos; un "índice de riesgo" calculado ad-hoc, no. Toda afirmación visual
  se respalda con evidencia textual trazable a su `doc_id` y `chunk_id`.
- **Presupuesto en dinero, no en tokens.** Si se agota, la clave deja de responder y no hay demo.
  Todo lo que no sea redactar va al modelo barato, y lo que no exija razonar se precomputa.

## Cómo se evalúa

Tres notas separadas.

**Reto 1, el asistente:** `0,40·calidad + 0,20·eficiencia + 0,20·seguridad + 0,20·diseño`.
- Calidad: Answer Relevancy 30%, Faithfulness 30%, Toxicity 15%, **Tono 25%**.
- Eficiencia: tokens 40%, número de interacciones 30%, latencia 30%, **normalizado contra los
  demás equipos**, no contra un umbral. Menos es mejor.
- Seguridad: **75% resistencia a prompt injection** contra el endpoint desplegado, 25% análisis
  estático.
- Diseño: la ficha del agente y el documento de arquitectura.

**Reto 2, el tablero:** 40% pertinencia de los componentes por fenómeno, **55% ejecución dinámica**
(que el agente active el componente correcto con los datos correctos ante cada pregunta), 5% código.

**Pitch:** 5 minutos más 3 de preguntas.

## Arquitectura

```
backend/     FastAPI + LangGraph
  app/api/       endpoints de agregación: el tablero y las tools del agente consumen los mismos
  app/agent/     orquestador -> agente de corpus / agente de visualizaciones
  precompute/    entidades, co-ocurrencia y lugares, calculados una vez
frontend/    Next 16 + Recharts + MapLibre
  una sola imagen sirve las dos superficies según NEXT_PUBLIC_SURFACE
```

**Tres recursos en Coolify**, todos con build pack Dockerfile y `www redirect` en *No redirect*:

| Subdominio | Qué sirve | Puerto |
|---|---|---|
| `agent.` | `backend/`, con `POST /chat` | 8000 |
| `frontagent.` | `frontend/` con `NEXT_PUBLIC_SURFACE=chat` | 3000 |
| `dashboard.` | `frontend/` con `NEXT_PUBLIC_SURFACE=dashboard` | 3000 |

Son dos recursos independientes desde la misma imagen del frontend a propósito: el Reto 1 se
evalúa en una ventana cerrada y redesplegar el tablero no puede tumbar `frontagent.`.

## El registro de componentes

El componente se deduce del **nombre de la tool**, que ya viaja obligatoriamente en `tools_called`
dentro de la respuesta del agente. No hay campo adicional: cuesta cero tokens.

| Tool | Componente |
|---|---|
| `search_corpus` | evidencia citada |
| `get_metadata_breakdown` | barras |
| `get_entity_matrix` | matriz de calor |
| `get_cooccurrence` | grafo de co-ocurrencia |
| `get_places` | mapa |
| `get_timeline` | línea de tiempo |
| `get_document` | documento |

Añadir un componente es añadir una tool y su entrada en el registro. `input_parameters` son los
filtros; los datos los resuelve el endpoint de agregación, no el modelo.

## Reglas de implementación

- **El redactor es un nodo sin herramientas.** Separado redacta mejor, y un fragmento envenenado no
  tiene nada que invocar.
- **Tope duro de iteraciones**: al alcanzarlo se redacta con lo que haya, sin fallar.
- **Sin reintentos automáticos**: cuentan como interacciones y la eficiencia se normaliza.
- **El contexto recuperado va delimitado y declarado como datos, no instrucciones.** De los ataques
  de inyección medidos, los directos los frena la alineación del modelo; el único que pasa es el
  indirecto, el que viaja dentro del fragmento.
- **`max_tokens` nunca ajustado.** Los modelos `gpt-oss` razonan antes de responder y el
  razonamiento cuenta como salida: con el margen justo se gasta el presupuesto y no emiten nada.
  `reasoning_effort: "low"` recorta en torno al 35% la salida del modelo pequeño.
- **Una sola fuente del contrato**: las respuestas del backend son modelos Pydantic y los tipos del
  frontend se generan de su OpenAPI (`pnpm api:types`). Nada escrito a mano dos veces.
- **Sin `useMemo` ni `useCallback` en código propio**: memoiza el React Compiler. Un aviso de
  `react-hooks` en un componente significa que el compilador lo salta.
- **Elemento nativo antes que ARIA**: botones reales, `aria-pressed` en los conmutadores, y el foco
  al título del detalle al abrirlo.

## Reglas del tablero

- **Los filtros globales viven en la URL** (fenómeno y rango de fechas): un experto puede compartir
  un enlace con el filtro puesto. Los componentes que el agente activó viven en memoria con el hilo.
- **Una misma categoría, siempre el mismo color**, en todas las vistas. Los tokens están en
  `app/globals.css` y ningún componente define colores propios.
- **Leyendas, títulos y unidades explícitos** en cada visualización.
- **El tipo de gráfico corresponde a la tarea analítica.** No se fuerza un mapa ni un grafo cuando
  la pregunta es una comparación.
- **Todo dato mostrado se puede rastrear** hasta su `doc_id` y `chunk_id`, incluidas las aristas del
  grafo al seleccionarlas.

## Cómo se trabaja

- **Commits a medida que avanza el trabajo**, Conventional Commits, con su fecha real.
- **Backend** (agente y datos) y **frontend e infraestructura** (tablero, despliegue, documentación)
  son dos mitades; el contrato entre ellas es el OpenAPI del backend. Quien cambia una respuesta
  regenera los tipos en el mismo commit.
- `git pull --rebase` antes de cada tarea, commits pequeños.
- **Mide antes de afirmar.** Una mejora que no se mide es una opinión.

## Idioma

Documentación y mensajes al equipo en español. **Identificadores en inglés en todas las capas**:
código, columnas de la base, campos de la API y parámetros. El español queda en lo que lee una
persona: interfaz, prompts, errores, comentarios y rutas públicas del radar.
