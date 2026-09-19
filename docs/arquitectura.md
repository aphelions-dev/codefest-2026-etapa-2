# Arquitectura del Radar Estratégico de Tendencias Aeroespaciales

Codefest Ad Astra 2026, Etapa 2. Este documento explica **qué se construyó y por qué**: el diseño
del sistema multiagente (Reto 1) y la propuesta de visualización por fenómeno (Reto 2), con el
razonamiento detrás de cada decisión y lo que deliberadamente se dejó fuera.

El principio que ordena todo lo demás: **ninguna cifra sin fuente**. Cada número del tablero y cada
afirmación del asistente llevan al `doc_id` y al `chunk_id` del corpus de donde salieron, y el
sistema no calcula ningún índice, puntaje o nivel de riesgo propio. Conteos, frecuencias y
agregaciones sí; autoridad analítica inventada, no.

---

## 1. Visión general

```
  pregunta en          ┌──────────────────────────────────────────┐
  lenguaje natural ──▶ │   GRAFO DE AGENTES (LangGraph)           │
                       │   guardián ▸ orquestador ▸ analista RAG   │
                       │   ▸ verificador ▸ guardián               │
                       └───────┬──────────────────────────────────┘
                               │
                               ▼
              ┌───────────────────────────────────────────────────┐
              │   API DE AGREGACIÓN (FastAPI)                     │
              │   pgvector: 64.484 fragmentos + precómputos       │
              └───────────────────────────────────────────────────┘
                          │                          │
                  POST /chat (§2.4)          GET /metadata, /entities,
                                             /places, /timeline, /documents,
                                             /presence, /alerts, /quadrant
                          │                          │
              ┌───────────▼──────┐        ┌──────────▼──────────────────┐
              │ frontagent.      │        │ dashboard.                  │
              │ chat de pruebas  │        │ tablero interactivo         │
              └──────────────────┘        └─────────────────────────────┘
```

Tres despliegues sobre **la misma imagen de frontend** (cambia una variable de entorno) y **un solo
backend**: el endpoint que evalúa ADL y la API que alimenta el tablero son el mismo proceso, porque
las herramientas del agente y los componentes del tablero consultan exactamente los mismos datos.
Separarlos habría significado mantener dos veces la misma agregación y arriesgar que divergieran.

| Capa | Tecnología | Por qué |
|---|---|---|
| Backend | FastAPI + asyncpg | Un solo puerto HTTP, como exige el Anexo A.4. Async porque casi todo es espera de base de datos o de modelo |
| Datos | PostgreSQL 18 + pgvector 0.8.6 | El índice de la Etapa 1 y los precómputos en el mismo motor: una consulta cruza vectores y metadata sin salir de la base |
| Recuperación | BGE-M3 sobre HNSW | El mismo encoder con que se construyó el índice en la Etapa 1. Cambiarlo invalidaría los vectores ya calculados |
| Frontend | Next.js 16 + MapLibre + Recharts | Renderizado estático: el tablero no necesita servidor propio y el contenedor solo sirve archivos |
| Modelos | Endpoint compatible con OpenAI | El gateway del reto y el proveedor de desarrollo hablan el mismo dialecto: cambiar de uno a otro son cuatro variables de entorno, no código |

---

## 2. Reto 1 — el sistema multiagente

Cinco agentes en un grafo de LangGraph. Tres son el mínimo que pide la especificación; los dos de
más son de seguridad, y la seguridad vale el 20% de la nota del Reto 1, de la cual el 75% se mide
atacando el endpoint desplegado.

```
        ┌──────────────────┐
        │ input_guardrail  │ ── ataque ──▶ fin (estado de error)
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │   orchestrator   │ ── saludo / fuera de alcance ──▶ fin
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │     retrieve     │  search_corpus + extract_fragments
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │      write       │ ── sin evidencia ──▶ fin
        └────────┬─────────┘
                 ▼
        ┌──────────────────┐
        │      verify      │ ── rechazo ──▶ rewrite ──▶ retrieve
        └────────┬─────────┘                (tope: 2 vueltas)
                 ▼
        ┌──────────────────┐
        │ output_guardrail │
        └────────┬─────────┘
                 ▼
             respuesta
```

| Agente | Modelo | Qué hace | Por qué separado |
|---|---|---|---|
| `input_guardrail` | barato | Clasifica el mensaje antes de que entre al grafo | Corta el ataque directo antes de gastar el modelo grande |
| `orchestrator` | grande | Enruta y descompone la pregunta en formulaciones de búsqueda | Decidir la ruta mal cuesta toda la consulta |
| `rag_analyst` | grande | Recupera y redacta con la evidencia | Es el razonamiento real del sistema |
| `verifier` | barato | Fidelidad, trazabilidad e inyección indirecta | Auditar es más fácil que redactar |
| `output_guardrail` | barato | Toxicidad y rastros de inyección | Última barrera sobre el texto ya escrito |

### 2.1 El redactor no tiene herramientas

`retrieve` y `write` son dos nodos del mismo agente. Separarlos tiene dos motivos: redactando sin
más tarea se redacta mejor, y **un fragmento envenenado no tiene nada que invocar** aunque consiga
convencer al modelo. El redactor recibe texto y devuelve texto.

Por el mismo razonamiento, la búsqueda no la decide el modelo: toda pregunta sobre el contenido
necesita evidencia, así que preguntarle al modelo si quiere buscar es pagar una llamada por una
respuesta que ya se conoce.

### 2.2 El ciclo de reintento, y por qué tiene tope

Cuando el verificador rechaza una respuesta, el orquestador reformula con el motivo delante y se
vuelve a recuperar y a redactar. El tope es de **dos vueltas**: cada una son dos llamadas al modelo
grande y una al barato, y el Bloque B mide tokens, interacciones y latencia normalizados contra los
demás equipos. Al agotarlo se entrega lo que haya con `estado: no_verificada` — declarado, nunca
fallando.

### 2.3 Reparto de modelos y el presupuesto de $100 USD

El presupuesto es en dinero, no en tokens: cuando se agota, la clave deja de responder y no hay
demo. La regla es que **todo lo que no sea razonar va al modelo barato**.

- **`gpt-oss-120b`** en tres llamadas: enrutar, descomponer y redactar.
- **`gpt-oss-20b`** en tres: los dos guardianes y el verificador, que son clasificación binaria con
  una respuesta de una línea en JSON.

Los identificadores se confirman contra `GET /v1/models` del proxy y **no se suponen**: el valor que
parecía obvio, `openai/gpt-oss-20b`, no es el que el proxy expone y habría fallado en la primera
consulta del día de la evaluación.

Tres decisiones más que bajan el gasto sin tocar la calidad:

1. **`reasoning_effort: "low"`** en todas las llamadas. Los `gpt-oss` razonan antes de responder y
   el razonamiento cuenta como tokens de salida. Medido: para un simple «di hola», 23 de los 33
   tokens de salida fueron razonamiento.
2. **`max_tokens` no se ajusta nunca.** Con el margen justo, esos modelos gastan el presupuesto
   razonando y no emiten nada. Se paga y no se recibe.
3. **Las respuestas fijas no pasan por el grafo completo.** Un saludo o una pregunta ajena al corpus
   se responden con un texto propio: no se recupera, no se verifica y no se inspecciona. Verificar
   un texto que escribimos nosotros es pagar dos llamadas por nada.

Medido de punta a punta contra el proxy del reto: el camino completo son **6 llamadas a modelo,
~33.000 tokens y 17 s**; un ataque muere en la primera capa con **1 llamada, 344 tokens y 1,2 s**.

### 2.4 Trazabilidad: la comprobación dura no usa modelo

Saber si un identificador citado está entre los documentos recuperados es **comparar dos
conjuntos**: es exacto, es gratis y no falla. Al modelo solo se le pregunta lo que exige leer y
entender. La cadena es:

1. `search_corpus` devuelve cada fragmento con su `doc_id` y su `chunk_id`.
2. El redactor los ve en la evidencia y cita `[F2-CSIS-100]`.
3. El verificador comprueba en código que cada identificador citado se recuperó, y rechaza si no.
4. `evaluacion.retrieval_context` entrega cada fragmento prefijado con `[doc_id · chunk_id]`.
5. `GET /documents/{doc_id}` devuelve el documento completo.

**Una lección medida:** el patrón de extracción tiene que leer lo que el modelo escribe de verdad,
no lo que debería escribir. `gpt-oss-120b` usa `U+2011`, el guion no separable, y mete espacios
dentro de los corchetes. Con el patrón ingenuo no se extraía ninguna cita, el conjunto salía vacío y
la respuesta pasaba la verificación **sin que nadie hubiera mirado sus fuentes** — peor que no tener
la comprobación, porque parecía tenerla. Se normalizan guiones y espacios tipográficos antes de
extraer, y vale tanto el `doc_id` como el `chunk_id`, porque el redactor cita indistintamente.

### 2.5 Seguridad

De los ataques medidos, los directos los frena la alineación del modelo. El que de verdad pasa es el
indirecto: el que viaja dentro de un fragmento recuperado, porque el corpus contiene documentos que
nadie escribió pensando en un asistente.

| Defensa | Dónde | Qué para |
|---|---|---|
| Clasificador de entrada | `guardrails.py` | Anulación de instrucciones, extracción del prompt, suplantación, jailbreak |
| Contexto entre delimitadores, declarado como datos | `prompts.evidence_block` | Inyección indirecta: es la única defensa que la para |
| Redactor sin herramientas | nodo `write` | Un fragmento envenenado no tiene ninguna acción que invocar |
| Verificación de citas en código | `verifier.py` | Referencias inventadas, que el prompt no evita |
| Clasificador de salida | `guardrails.py` | Toxicidad y fuga del prompt del sistema |
| Tope duro de iteraciones | `graph.py` | Agotamiento del presupuesto |
| Credenciales solo por variable de entorno | `config.py` | Ningún secreto en el repositorio ni en la imagen |

Dos decisiones que sostienen lo anterior:

- **Los guardianes fallan hacia el lado útil.** Si el proxy no responde o devuelve algo ilegible,
  dejan pasar. Un guardián que convierte una caída del proxy en un bloqueo generalizado tumba la
  demo entera, y las otras dos capas siguen en pie.
- **Cuando la entrada se bloquea no viaja el motivo, ni las herramientas que lo detectaron.**
  Decirle al atacante qué regla saltó es enseñarle cuál es el siguiente intento. El motivo queda en
  el log estructurado, que es donde se audita.

### 2.6 El contrato de la respuesta

Los modelos del §2.4 de la especificación viven en `app/responses.py` **con los nombres en
español**, al contrario que el resto del código. No son nombres nuestros: son los que consumen las
métricas de ADL. Todos con `extra="forbid"`, y la respuesta se arma en un solo sitio a partir del
estado final del grafo, venga por donde venga: es imposible que un camino entregue un JSON con un
campo de más o de menos.

- **`tokens_por_agente` se acumula por agente, no por modelo.** Dos agentes comparten modelo; si se
  agrupara por modelo, el desglose atribuiría al orquestador lo que gastó un subagente.
- **`metadata.tokens` suma el `usage` de todas las llamadas.** Cada llamada devuelve texto y gasto
  juntos, así que perderlo por el camino no es posible.
- **`metadata.num_interacciones` cuenta llamadas a modelo**, que es la definición de la
  especificación.
- **`metadata.latencia_ms`** se mide con `time.perf_counter()` alrededor del manejador completo.

### 2.7 Estados

| `metadata.estado` | Cuándo |
|---|---|
| `ok` | Respuesta generada y verificada |
| `sin_evidencia` | Ningún fragmento superó el umbral; no se inventa una respuesta |
| `no_verificada` | Se agotaron los reintentos; se entrega lo que hay, declarado |
| `error_entrada_bloqueada` | El guardián de entrada cortó la consulta |
| `error_salida_bloqueada` | El guardián de salida retuvo la respuesta |

### 2.8 Observabilidad

Logging estructurado en JSON, una línea por evento. Cada llamada a modelo registra agente, modelo,
tokens de entrada y salida, y latencia. Cada bloqueo registra qué capa lo decidió y por qué. Es lo
que permite auditar una respuesta después, sin que nada de eso llegue al usuario.

---
## 3. Reto 2 — propuesta de visualización por fenómeno

### 3.1 El método: de la tarea analítica al componente

El Anexo B.2.1 es explícito en que el diseño parte de **la tarea analítica**, no del tipo de gráfico,
y B.2.2 prohíbe forzar una visualización llamativa cuando la tarea es una comparación simple. El
registro de componentes se construyó al revés de lo habitual: primero las preguntas que cada
fenómeno hace razonable responder, después el componente que las contesta.

| Tarea analítica | Componente | Herramienta |
|---|---|---|
| Comparación, distribución, composición | Barras | `get_metadata_breakdown` |
| Comparación cruzada de dos categorías | Matriz de calor | `get_entity_matrix` |
| Relaciones entre entidades | Red de co-ocurrencia | `get_cooccurrence` |
| Priorización por dos criterios a la vez | Cuadrante | `get_quadrant` |
| Distribución espacial | Mapa coroplético | `get_places` |
| Tendencia temporal | Línea de tiempo | `get_timeline` |
| Verificación de la fuente | Panel de evidencia | `search_corpus`, `get_document` |

### 3.2 Qué pregunta cada fenómeno, y con qué se responde

**F1 — IA y capacidades estratégicas en entornos militares.** Es un fenómeno de *actores y
programas*, no de territorio: quién desarrolla qué, y qué observatorio se ocupa de cada cosa. Las
preguntas que tienen sentido son de comparación cruzada («¿qué tecnología domina cada fuente?») y de
relación («¿qué empresas aparecen junto a qué programas militares?»). De ahí que los componentes
principales sean la **matriz de calor** y la **red de co-ocurrencia**. Un mapa aportaría poco: los
países que aparecen lo hacen como sujetos de análisis, no como escenario.

**F2 — Seguridad del entorno espacial y órbita baja.** Es un fenómeno *temporal y de agenda*: qué
preocupaciones aparecen, cuáles crecen y cuáles se consolidan. La pregunta característica no es
«cuánto se habla de X» sino «a qué hay que mirar ahora», que ningún eje contesta por separado. El
componente principal es el **cuadrante de intensidad contra tendencia**, acompañado de la **línea de
tiempo**. El mapa tampoco es el protagonista aquí: la órbita baja no es un territorio.

**F3 — Dinámicas territoriales en América Latina.** Es el único fenómeno con componente territorial
explícita, y por eso el **mapa coroplético por departamentos** es su vista principal, con el nivel
de agregación cambiando entre países y departamentos según el zoom (B.4.2). Las preguntas son de
concentración («¿qué departamentos concentran las menciones?») y de actores («¿qué grupos aparecen
juntos?»), así que el mapa se acompaña de la red y del panel de evidencia.

**Los tres comparten** el panel de evidencia y la trazabilidad, porque en los tres el valor del
análisis depende de poder verificar la afirmación en el texto original.

### 3.2.1 Las tres vistas del mapa

El mapa no superpone capas: cada vista es **una pregunta distinta sobre un territorio distinto**, y
mezclarlas produciría un color que no significa nada.

| Vista | Qué cuenta | Nivel que pinta | Fuente | Qué no dice |
|---|---|---|---|---|
| Documentos | Documentos del corpus que nombran el territorio | País o departamento | Corpus de la Etapa 1 | Nombrar no es actuar |
| Alertas | Alertas de la Defensoría que nombran el departamento | Departamento | 363 alertas, 2017–2026 | Una alerta nacional cuenta en cada departamento que nombra |
| Grupos armados | Grupos presentes en cada municipio | **Municipio** | Amazon Underworld, 1.407 municipios de seis países | Es presencia declarada, no intensidad ni riesgo |

La presencia armada se pinta **municipio a municipio** y no agregada al departamento, porque es el
nivel en el que la fuente mide: dentro de un mismo departamento hay municipios con cuatro grupos y
municipios sin ninguno, y agregarlos borraría justo eso. La geometría municipal no sobrevivió a la
indexación de la Etapa 1, así que se toma de geoBoundaries (CC BY 4.0) y se cruza por nombre;
cuando un nombre se repite en el país, desempata el polígono que contiene el centro del municipio.
1.385 de los 1.407 municipios (98 %) encuentran su forma.

**Coherencia entre filtros.** Las alertas y la presencia armada son, las dos, documentos del
fenómeno 3 y de ningún otro. Verlas con el filtro global puesto en F1 mostraría cifras de F3 bajo
una etiqueta que dice F1, así que la vista fija su fenómeno al activarse y el filtro global la
devuelve a *Documentos* si se cambia. Por la misma razón la franja temporal sigue a la vista: con
el mapa en alertas, abajo van alertas emitidas por año, no documentos publicados.

El filtro por entidad sí recorta las alertas —una alerta es un documento del corpus— pero no la
presencia armada, que viene de otra fuente. El distintivo del filtro lo declara en vez de ignorarlo
en silencio.

Las tres se reconstruyeron **desde el propio índice**, sin volver al corpus crudo: los documentos de
Amazon Underworld y de Alertas Tempranas guardan sus campos estructurados dentro del texto indexado
(`b_ADM2_PCODE`, `au_eln`, `codigo`, `tipo`, `fecha_emision`), así que el dato estaba en la base en
forma de frase. El precómputo lo vuelve a leer de ahí.

En las dos vistas nuevas las cifras **nunca se suman entre sí**: riesgo inminente y estructural son
cosas distintas, y un municipio *sin información* no es un municipio *sin presencia*. Cada par va
por separado en la ficha y en la leyenda.

### 3.3 El cuadrante: cómo se mide «tendencia» sin inventar nada

El Anexo B.2.4 dibuja un cuadrante de *intensidad × tendencia*. La dificultad es que «tendencia» se
presta a fabricar un índice, y B.2.5 lo prohíbe expresamente.

Aquí las dos coordenadas son conteos verificables:

- **Intensidad**: cuántos documentos fechados nombran la entidad.
- **Tendencia**: qué proporción de esos documentos está en la mitad reciente del corpus. El año de
  corte es la **mediana del corpus fechado**, calculada, no fijada, para que el corte siga a los
  datos en vez de envejecer con una constante.

Las líneas divisorias son las medianas de cada eje, así que el cuadrante **compara entidades entre
sí** y no contra un umbral inventado. El lector ve las dos cifras por separado en el tooltip, y un
doble clic lleva al fragmento que sustenta la entidad.

### 3.4 De dónde salen las fechas

`document_dates` se extrae de la **metadata de la fuente** —el nombre del archivo y su carpeta en el
corpus original—, nunca del cuerpo del texto. Un año mencionado dentro de un informe es el año del
que habla, no el año en que se publicó, y presentarlo como fecha del documento sería exactamente la
variable inventada que el anexo prohíbe.

Cinco reglas, de más precisa a menos, y **cada fila registra cuál la produjo**, así que cualquier
punto de la línea de tiempo se puede auditar hasta el archivo:

| Regla | Ejemplo | Documentos |
|---|---|---:|
| `ano_de_la_alerta` | `ALERTAS_029-20-91742` → alerta 29 de 2020 | 363 |
| `ano_en_el_nombre` | `SWF_global-counterspace-capabilities-2026-hr.pdf` | 258 |
| `iso_en_nombre` | `..._2024-03-15_...` | 185 |
| `carpeta_del_ano` | `UNOOSA\pdfs\2021\...` | 132 |
| `aammdd_en_nombre` | `CSIS_220202-harrison-...` → 2022-02-02 | 27 |

**965 de 1.813 documentos quedan fechados.** Los 848 restantes no aparecen en la serie, y el
componente lo declara en su propia cabecera en vez de repartirlos y falsear la tendencia.

### 3.5 Trazabilidad, de extremo a extremo

Todo dato del tablero lleva a su fragmento:

| Vista | Gesto | Lleva a |
|---|---|---|
| Matriz de calor | clic en una celda | el fragmento más denso de esa entidad en esa fuente |
| Red de entidades | clic en una arista | el fragmento donde coinciden las dos entidades |
| Cuadrante | doble clic en un punto | el fragmento más denso de esa entidad |
| Mapa | clic en un territorio | el fragmento que nombra ese territorio |
| Panel de evidencia | clic en el identificador | el documento, abierto en ese fragmento |
| Respuesta del chat | la cita `[F2-SWF-099]` | el documento citado |

La vista del documento **sirve ventanas de 80 fragmentos centradas en la cita**, no el documento
entero: el mayor tiene 1.960 fragmentos, y servirlo completo son megabytes de JSON y otros tantos
nodos en el DOM. El fragmento citado aparece marcado y el lector puede recorrer el documento en
ambas direcciones.

### 3.6 Ejecución dinámica y coordinación entre vistas

El tablero **no muestra todos los componentes a la vez**. Arranca con una vista por capacidad y, en
cuanto el agente responde, lo que activó **reemplaza** la vista.

Dos filtros globales se propagan a todas las vistas y viven en la URL, de modo que un evaluador
puede compartir exactamente lo que está mirando y el botón de atrás funciona:

- **Fenómeno** (`?fenomeno=`), que limita todos los componentes.
- **Entidad** (`?entidad=`), que es el *brushing and linking* de B.6.3: seleccionar una entidad en
  la matriz, la red o el cuadrante reduce el mapa y la línea de tiempo a los documentos que la
  nombran, y atenúa lo no seleccionado en las demás vistas. El filtro activo se muestra siempre y se
  quita con un clic o con Esc.

### 3.7 Disposición: el mapa como lienzo

El tablero usa un **maestro-detalle** (B.6.1): el mapa ocupa la pantalla y los paneles se anclan a
sus bordes en lugar de flotar encima. La barra lateral lleva el filtro global y el ranking
territorial; el panel de análisis, los componentes anchos; la franja inferior, la línea de tiempo,
que necesita anchura y no cabe en una columna; y la derecha, el asistente.

El panel de análisis se limita a **dos columnas**: una matriz de calor o un cuadrante en un tercio de
pantalla amontonan sus etiquetas y dejan de resolver la tarea que justifica su existencia.

### 3.8 Codificación visual

- **Paleta consistente** entre vistas: el mismo fenómeno es siempre el mismo color (`--f1`, `--f2`,
  `--f3`), y la rampa secuencial de cuatro pasos del mapa se reutiliza en la leyenda y el ranking.
- **Cortes por cuantiles** (p50, p75, p90, p97) en el coroplético, no escala continua: con escala
  continua Estados Unidos aplana al resto y casi todo sale coloreado. Con cuantiles, la mitad menos
  citada queda sin color y resalta lo que concentra.
- **Nunca solo color**: cada territorio lleva su cifra en el ranking, cada celda de la matriz su
  `title` con los conteos, y cada punto del cuadrante su tooltip con las dos cifras por separado.
- **Título, unidad y fuente obligatorios** en todo componente: el anexo pide que nadie tenga que
  inferir qué representa un eje o un color.

---

## 4. Qué se dejó fuera, y por qué

| No está | Motivo |
|---|---|
| Polígonos municipales | La Etapa 1 indexó las teselas de Amazon Underworld como texto, y en esa conversión se perdió la geometría. Los atributos sí sobrevivieron, así que el dato está: lo que falta es la forma con que dibujarlo. El mapa agrega al departamento y la lista conserva el municipio |
| Grafo formal de tripletas | La Etapa 1 no construyó el grafo opcional. B.3.1 declara la red de co-ocurrencia alternativa legítima, y es la que no inventa relaciones semánticas que nadie extrajo |
| Extracción de entidades con LLM | 1.813 documentos por inferencia se comen el presupuesto. Se extraen por diccionario y coincidencia de texto, que para nombres propios no necesita razonamiento |
| Reranker sobre la recuperación | Medido contra el ground truth de la Etapa 1, empeoraba el resultado |
| Reintentos automáticos ante error de red o del proxy | Cada reintento contaría como interacción en el bloque de eficiencia. El único ciclo que repite es el del verificador (§2.2), que es una decisión de calidad y tiene tope |
| Agente generador de visualizaciones | El equipo decidió centrar esta entrega en el Reto 1. El tablero funciona con sus filtros y sus datos, pero **el agente no activa componentes**: el registro y los nombres de herramienta quedan preparados para que añadirlo sea un nodo más |

---

## 5. Puesta en marcha

Las instrucciones de despliegue y de uso están en el [`README.md`](../README.md) de la raíz.
