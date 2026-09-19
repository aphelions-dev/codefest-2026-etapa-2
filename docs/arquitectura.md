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
                      ┌──────────────────────────────────────────┐
  pregunta en         │            ORQUESTADOR (código)          │
  lenguaje natural ──▶│   enruta sin consumir modelo; no lee     │
                      │   nunca el corpus                        │
                      └───────┬──────────────────────┬───────────┘
                              │                      │
              ┌───────────────▼──────┐   ┌───────────▼─────────────────┐
              │  AGENTE DE CORPUS    │   │ AGENTE DE VISUALIZACIONES   │
              │  search_corpus       │   │ elige componente y filtros  │
              │  redacta con citas   │   │ entre seis herramientas     │
              └───────────┬──────────┘   └───────────┬─────────────────┘
                          │                          │
                          ▼                          ▼
              ┌───────────────────────────────────────────────────┐
              │   API DE AGREGACIÓN (FastAPI)                     │
              │   pgvector: 64.484 fragmentos + precómputos       │
              └───────────────────────────────────────────────────┘
                          │                          │
                  POST /chat (§2.4)          GET /metadata, /entities,
                                             /places, /timeline, /documents
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

### 2.1 Por qué el orquestador no usa modelo

La especificación pide un agente principal que «recibe las consultas del usuario y redirecciona la
tarea a agentes especializados». No pide que esa decisión la tome un modelo, y aquí no la toma.

El orquestador enruta con reglas sobre el texto de la pregunta, y eso compra tres cosas:

1. **Una interacción menos por pregunta.** El Bloque B mide tokens, número de interacciones y
   latencia, normalizados contra los demás equipos. Una llamada de enrutamiento cuesta entre 500 y
   900 tokens de entrada y entre 1 y 3 segundos, en cada pregunta, para elegir entre tres caminos.
2. **Determinismo.** El mismo texto se enruta siempre igual, así que el comportamiento del sistema
   se puede probar sin gastar presupuesto y sin varianza entre ejecuciones.
3. **Contención estructural de la inyección.** El enrutador **no lee nunca el corpus**. Un fragmento
   envenenado no tiene ninguna ruta por la que hacerse enrutar, porque lo que decide el camino es la
   pregunta del usuario, no el contenido recuperado.

El coste es que un enrutador de reglas se equivoca en preguntas ambiguas. Se acepta porque el
dominio es cerrado —tres fenómenos, seis herramientas— y porque el fallo es recuperable: si una
pregunta de mapa cae en el agente de corpus, el usuario recibe una respuesta correcta con citas,
solo que sin el componente activado.

### 2.2 Los agentes especializados

**Agente de corpus.** Recupera y redacta. La búsqueda **no la decide el modelo**: toda pregunta
sobre el contenido necesita evidencia, así que preguntarle al modelo si quiere buscar es pagar una
llamada por una respuesta que ya se conoce. El modelo recibe la evidencia ya recuperada y solo
redacta, sin herramientas — lo que además lo deja sin ninguna acción que un fragmento malicioso
pueda inducir.

Sus citas se **verifican mecánicamente** contra la evidencia antes de devolverlas. Los modelos de
este tamaño citan bien la mayoría de las veces y de cuando en cuando inventan una referencia
plausible; el prompt no lo evita, la comprobación sí.

**Agente de visualizaciones.** Es el único que usa *tool calling*. Elige entre seis herramientas y,
con los datos que devuelven, redacta un resumen corto. Usa el **modelo barato**: elegir entre seis
opciones y describir conteos no exige razonamiento profundo, y el presupuesto es dinero.

### 2.3 Cómo el agente activa un componente sin gastar un token

El tablero deduce el componente **del nombre de la herramienta que el agente invocó**, que ya viaja
obligatoriamente en `evaluacion.tools_called` dentro de la respuesta. No hay un campo extra, ni una
especificación de gráfico que el modelo tenga que escribir.

La alternativa habitual —dejar que el modelo emita una especificación tipo Vega-Lite— se descartó
por cuatro razones: cuesta cientos de tokens por respuesta, no garantiza la paleta consistente que
exige B.2.5, impide validar que el gráfico corresponda a la tarea analítica (B.2.2), y abre una
superficie de inyección, porque un fragmento del corpus podría influir en lo que se dibuja.

Con un registro cerrado, el modelo decide **qué mirar**; el backend decide **qué dice el dato**.

### 2.4 Seguridad

| Defensa | Dónde | Qué para |
|---|---|---|
| Enrutador sin LLM que no lee el corpus | `agents.py` | El contenido recuperado no puede cambiar el camino de ejecución |
| Redactor sin herramientas | agente de corpus | Un fragmento envenenado no tiene ninguna acción que invocar (*action gating*) |
| Contexto entre delimitadores, declarado como datos | prompt del redactor | Inyección indirecta: es la única defensa que la para, porque el escaneo de entrada y salida no la detecta |
| Negativa explícita a revelar prompt, ficha o configuración | prompts | Extracción de prompt |
| Tope duro de iteraciones y sin reintentos automáticos | `MAX_STEPS` | Agotamiento del presupuesto; además, un reintento contaría como interacción |
| Errores sin trazado en el cuerpo de la respuesta | `chat.py` | Fuga de configuración a través de mensajes de error |
| Credenciales solo por variable de entorno | `config.py` | No hay ningún secreto en el repositorio ni en la imagen |

### 2.5 El contrato de la respuesta

`app/schema.py` contiene los modelos del §2.4 **con los nombres en español**, al contrario que el
resto del código, que usa identificadores en inglés en todas sus capas. No son nombres nuestros: son
los que consumen las métricas de ADL. Viven aislados en un único módulo, no se reutilizan en ninguna
otra capa, y ese aislamiento es deliberado — así queda claro dónde termina nuestro dominio y empieza
el contrato ajeno.

Dos decisiones sobre la contabilidad:

- **`tokens_por_agente` se acumula por agente, no por modelo.** Dos agentes pueden compartir modelo;
  si se agrupara por modelo, el desglose atribuiría al orquestador lo que gastó un subagente y el
  costo estimado por pregunta saldría mal.
- **El endpoint nunca devuelve 500.** Un error sin `metadata` cuenta como fallo entero en el bloque
  de eficiencia. Un fallo se devuelve como respuesta con `estado` distinto de `ok`, conservando la
  evidencia que ya se había recuperado.

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

| Vista | Qué cuenta | Fuente | Qué no dice |
|---|---|---|---|
| Documentos | Documentos del corpus que nombran el territorio | Corpus de la Etapa 1 | Nombrar no es actuar |
| Alertas | Alertas de la Defensoría que nombran el departamento | 363 alertas, 2017–2026 | Una alerta nacional cuenta en cada departamento que nombra |
| Grupos armados | Municipios con presencia declarada de al menos un grupo | Amazon Underworld, 1.407 municipios | Es presencia declarada, no intensidad ni riesgo |

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
| Reintentos automáticos ante error del modelo | Cada reintento contaría como interacción en el bloque de eficiencia |

---

## 5. Puesta en marcha

Las instrucciones de despliegue y de uso están en el [`README.md`](../README.md) de la raíz.
