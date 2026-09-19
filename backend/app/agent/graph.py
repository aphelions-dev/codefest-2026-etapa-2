"""El grafo: seis agentes, el enrutado del orquestador y el ciclo de reintento.

                                  ,--> visualize --.
    input_guardrail -> orchestrator                 >-> write -> verify -> output_guardrail -> fin
           |                |     `--> retrieve ---'     |         |
           v                v             |              v         v
          fin              fin           fin            fin     rewrite --> retrieve

El orquestador decide a que subagente va la consulta, y lo decide en la misma llamada con la que
descompone la pregunta: enrutar no cuesta ninguna llamada de mas.

- `text`: solo `retrieve`. Es la ruta de siempre y gasta exactamente lo mismo que antes.
- `visualization`: solo `visualize`, y el redactor describe los componentes. Sin corpus no hay
  citas que verificar, asi que se salta el verificador.
- `both`: las dos ramas en paralelo, y reconvergen en el redactor. Decidir los componentes no suma
  latencia de reloj.

Una ruta visual que no produce ningun componente cae a `retrieve` y responde con el corpus,
diciendolo.

Los cuatro caminos que acaban en `fin` sin pasar por el guardian de salida entregan un texto que
escribimos nosotros —entrada bloqueada, saludo, sin evidencia, fallo del servicio—, y no hay nada
que inspeccionar en un texto propio.

`retrieve` y `write` son dos nodos del mismo agente, el analista RAG. Estan separados porque el
redactor va sin herramientas: separado redacta mejor, y un fragmento envenenado no tiene nada que
invocar aunque convenza al modelo.

El ciclo de reintento tiene tope duro. Cada vuelta son dos llamadas mas a modelo, y la eficiencia
se califica normalizada contra los demas equipos: al agotarlo se entrega lo que haya con el estado
que corresponda, nunca se falla.
"""

import logging
import re
from dataclasses import dataclass

from langgraph.graph import END, START, StateGraph

from app.agent import guardrails, prompts, verifier
from app.agent.llm import Client, ModelError, parse_json
from app.agent.retrieval import Retriever
from app.agent.state import State, ToolRecord
from app.agent.visualizer import Visualizer
from app.config import Settings

log = logging.getLogger("agent.graph")

# Saludos y preguntas sobre el propio asistente: lo unico que no se busca en el corpus. Tiene que
# ser un mensaje corto y empezar asi, para que "hola, que dice el corpus sobre..." vaya a buscar.
SMALL_TALK = re.compile(
    r"^(hola|buenas|buenos d[ií]as|buenas tardes|hey|qu[eé] tal|c[oó]mo est[aá]s|gracias|"
    r"qui[eé]n eres|qu[eé] eres|qu[eé] puedes hacer|qu[eé] haces|ayuda|help)(?![a-záéíóúñ])[\s\S]{0,40}$",
    re.IGNORECASE,
)

# A donde enruta el orquestador. La decision viaja en el mismo JSON que las formulaciones de
# busqueda, asi que enrutar no cuesta ninguna llamada de mas: la ruta de texto gasta hoy lo mismo
# que antes de que existiera el visualizador.
TEXT = "text"
VISUALIZATION = "visualization"
BOTH = "both"
ROUTES = (TEXT, VISUALIZATION, BOTH)

DECOMPOSE_SCHEMA = {
    "type": "object",
    "properties": {
        "queries": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3},
        "phenomenon": {"type": ["integer", "null"], "enum": [1, 2, 3, None]},
        "route": {"type": "string", "enum": list(ROUTES)},
    },
    "required": ["queries", "phenomenon", "route"],
    "additionalProperties": False,
}

# Estados de `metadata.estado`. "ok" es el unico que significa que la respuesta es utilizable.
OK = "ok"
BLOCKED_INPUT = "error_entrada_bloqueada"
BLOCKED_OUTPUT = "error_salida_bloqueada"
NO_EVIDENCE = "sin_evidencia"
UNVERIFIED = "no_verificada"
# Un fallo del servicio, no del corpus. Va separado de `sin_evidencia` a proposito: decir «no hay
# evidencia» cuando lo que se cayo fue el proxy o la base afirma algo falso sobre el corpus, y
# ademas oculta en la nota de calidad lo que la especificacion pide declarar en `estado`.
INTERNAL_ERROR = "error_interno"


@dataclass
class Runtime:
    """Lo que los nodos necesitan del proceso. Se construye una vez al arrancar."""

    client: Client
    retriever: Retriever
    visualizer: Visualizer
    settings: Settings


def build(runtime: Runtime):
    """Compila el grafo. Una instancia por proceso: compilarlo por peticion no aporta nada."""
    fast = runtime.settings.fast_model
    deep = runtime.settings.deep_model

    async def input_guardrail(state: State) -> State:
        allowed, reason, usage, tools = await guardrails.check_input(
            runtime.client, fast, state["question"]
        )
        if not allowed:
            return {
                "answer": prompts.BLOCKED,
                "status": BLOCKED_INPUT,
                "rejection": reason,
                "usage": usage,
                "tools": tools,
                "agents": ["input_guardrail"],
            }
        return {
            "sanitized": state["question"],
            "usage": usage,
            "tools": tools,
            "agents": ["input_guardrail"],
        }

    async def orchestrator(state: State) -> State:
        """Enruta la consulta y, si hay que buscar, prepara las formulaciones.

        Lo primero que decide es una regla, no el modelo: si es un saludo, no hay nada que buscar.
        Enumerar *temas* con el modelo si era un error medido sobre las 50 consultas del reto —
        costaba una llamada en cada consulta y mandaba dos fuera de alcance—, y ademas era
        redundante: el filtro de fuera-de-alcance que funciona es el umbral de evidencia, no este.

        Lo que si decide el modelo es a que subagente va la consulta, y lo decide **en la misma
        llamada** que descompone la pregunta: enrutar no cuesta ni un token adicional.
        """
        question = state["sanitized"]
        saludo = bool(SMALL_TALK.match(question.strip()))
        tools = [
            ToolRecord(
                name="route_intent",
                input_parameters={"query": question},
                # La ruta real la rellena `_decompose`; un saludo no llega a preguntarla.
                output="small_talk" if saludo else TEXT,
            )
        ]
        if saludo:
            return _canned(prompts.SMALL_TALK, [], tools)
        return await _decompose(question, state.get("rejection", ""), [], tools)

    async def _decompose(question, rejection, usage, tools) -> State:
        try:
            text, decompose_usage = await runtime.client.complete(
                agent="orchestrator",
                model=deep,
                system=prompts.DECOMPOSE,
                user=question if not rejection else f"{question}\n\nIntento anterior rechazado: {rejection}",
                json_schema=DECOMPOSE_SCHEMA,
            )
        except ModelError:
            log.exception("la descomposicion fallo; se busca con la pregunta tal cual")
            return _to_corpus(question, usage, tools)

        plan = parse_json(text, {"queries": [question], "phenomenon": None, "route": TEXT})
        queries = [q for q in plan.get("queries") or [] if isinstance(q, str) and q.strip()]
        # Una ruta que no reconocemos es texto: el defecto nunca gasta el visualizador por error.
        route = plan.get("route") if plan.get("route") in ROUTES else TEXT
        tools.append(
            ToolRecord(
                name="decompose_query",
                input_parameters={"query": question, "rejection": rejection},
                output=" | ".join(queries) or question,
            )
        )
        # `route_intent` declara la ruta que de verdad se tomo, que es lo que el enrutador decide.
        if tools and tools[0].name == "route_intent":
            tools[0].output = route
        return {
            "queries": queries or [question],
            "phenomenon": plan.get("phenomenon"),
            "route": route,
            "usage": [*usage, decompose_usage],
            "tools": tools,
            "agents": ["orchestrator"],
        }

    def _to_corpus(question, usage, tools) -> State:
        """Sin el modelo no hay enrutado: se busca en el corpus, que es lo que ya hacia."""
        return {
            "queries": [question],
            "phenomenon": None,
            "route": TEXT,
            "usage": usage,
            "tools": tools,
            "agents": ["orchestrator"],
        }

    def _canned(answer, usage, tools) -> State:
        """Respuesta fija: ni se busca ni se verifica ni se inspecciona un texto que escribimos."""
        return {
            "answer": answer,
            "status": OK,
            "usage": usage,
            "tools": tools,
            "agents": ["orchestrator"],
        }

    async def retrieve(state: State) -> State:
        """Las dos herramientas del analista. Ninguna llamada a modelo: el encoder es local."""
        queries = state["queries"]
        phenomenon = state.get("phenomenon")
        try:
            found = await runtime.retriever.search(queries, phenomenon)
        except Exception:
            # La base o el encoder fallaron. Se declara como fallo del servicio y no como falta de
            # evidencia, y se corta aqui: sin fragmentos no hay nada que redactar ni que verificar.
            log.exception("la recuperacion fallo")
            return {
                "answer": prompts.FAILED,
                "status": INTERNAL_ERROR,
                "tools": [
                    ToolRecord(
                        name="search_corpus",
                        input_parameters={"query": " | ".join(queries), "phenomenon": phenomenon},
                        output="la recuperacion fallo",
                    )
                ],
                "agents": ["rag_analyst"],
            }
        threshold = runtime.settings.evidence_threshold
        kept = [fragment for fragment in found if fragment.similarity >= threshold]

        tools = [
            ToolRecord(
                name="search_corpus",
                input_parameters={
                    "query": " | ".join(queries),
                    "phenomenon": phenomenon,
                    "top_k": runtime.settings.top_k,
                },
                output=f"{len(found)} fragmentos de {len({f.doc_id for f in found})} documentos",
            ),
            ToolRecord(
                name="extract_fragments",
                input_parameters={"threshold": threshold},
                output=f"{len(kept)} fragmentos sobre el umbral de evidencia",
            ),
        ]
        log.info(
            "recuperacion",
            extra={"consultas": len(queries), "recuperados": len(found), "sobre_umbral": len(kept)},
        )
        return {"fragments": kept, "tools": tools, "agents": ["rag_analyst"]}

    async def visualize(state: State) -> State:
        """El agente de visualizaciones. Elige que componentes del tablero abre la pregunta.

        Lo que devuelve son herramientas llamadas, asi que viaja en `tools_called` sin ningun campo
        adicional: el tablero deduce de ahi que componente activar y con que filtros.
        """
        try:
            records, usage = await runtime.visualizer.plan(state["sanitized"])
        except Exception:
            # Degradar, no tumbar: una visualizacion que no sale no puede llevarse por delante la
            # respuesta. Sin componentes se responde con el corpus, y el redactor lo dira.
            log.exception("el visualizador fallo; se responde sin componentes")
            return {"components": [], "agents": ["visualizer"]}
        log.info("visualizacion", extra={"componentes": [record.name for record in records]})
        return {
            "components": records,
            "usage": usage,
            "tools": records,
            "agents": ["visualizer"],
        }

    async def write(state: State) -> State:
        """El redactor. Sin herramientas y con lo que se le da delimitado como datos.

        Es el mismo nodo para las dos rutas, y de ahi salen las dos unicas diferencias: con
        evidencia del corpus redacta citando, y sin ella describe los componentes que el
        visualizador acaba de elegir. Exigirle una cita cuando no se consulto el corpus solo
        conseguiria que se inventara un identificador.
        """
        if state.get("status") == INTERNAL_ERROR:
            # La recuperacion se cayo: ya hay respuesta y no hay nada que redactar.
            return {}

        fragments = state.get("fragments") or []
        components = state.get("components") or []
        # Se pidio una visualizacion y no salio ninguna: se responde igual, y se dice.
        note = prompts.NO_VISUALIZATION if state.get("route", TEXT) != TEXT and not components else ""

        if not fragments and not components:
            return {"answer": prompts.NO_EVIDENCE + note, "status": NO_EVIDENCE}

        if fragments:
            system = prompts.WRITER
            evidence = prompts.evidence_block(fragments)
        else:
            system = prompts.VISUAL_WRITER
            evidence = prompts.components_block(components)

        try:
            text, usage = await runtime.client.complete(
                agent="rag_analyst",
                model=deep,
                system=system,
                user=f"{evidence}\n\n<pregunta>\n{state['sanitized']}\n</pregunta>",
            )
        except ModelError:
            # El corpus si tenia evidencia: lo que falto fue el modelo. Confundirlo con
            # `sin_evidencia` dejaria una respuesta que niega los fragmentos que van en
            # `retrieval_context`.
            log.exception("el redactor no respondio")
            return {"answer": prompts.FAILED, "status": INTERNAL_ERROR}

        return {"answer": text + note, "status": OK, "usage": [usage], "agents": ["rag_analyst"]}

    async def verify(state: State) -> State:
        ok, reason, usage, tools = await verifier.verify(
            runtime.client, fast, state["answer"], state.get("fragments") or []
        )
        exhausted = not ok and state.get("retries", 0) >= runtime.settings.max_retries
        return {
            "rejection": "" if ok else reason,
            # Al agotar los reintentos se entrega, pero declarado: la respuesta no paso la auditoria.
            "status": UNVERIFIED if exhausted else state.get("status", OK),
            "usage": usage,
            "tools": tools,
            "agents": ["verifier"],
        }

    async def rewrite(state: State) -> State:
        """Una vuelta mas del orquestador, con el motivo del rechazo delante."""
        retries = state.get("retries", 0) + 1
        log.info("reintento", extra={"intento": retries, "motivo": state.get("rejection", "")})
        plan = await _decompose(state["sanitized"], state.get("rejection", ""), [], [])
        return {**plan, "retries": retries}

    async def output_guardrail(state: State) -> State:
        safe, reason, usage, tools = await guardrails.check_output(
            runtime.client, fast, state["answer"]
        )
        if not safe:
            return {
                "answer": prompts.BLOCKED,
                "status": BLOCKED_OUTPUT,
                "rejection": reason,
                "usage": usage,
                "tools": tools,
                "agents": ["output_guardrail"],
            }
        return {"usage": usage, "tools": tools, "agents": ["output_guardrail"]}

    # --- Aristas ---------------------------------------------------------------------------------

    def after_input(state: State) -> str:
        return END if state.get("status") == BLOCKED_INPUT else "orchestrator"

    def after_orchestrator(state: State) -> str | list[str]:
        """El enrutado: a que subagente o subagentes va la consulta."""
        # Saludo: ya hay respuesta y no hay nada que buscar ni que dibujar.
        if state.get("answer"):
            return END
        route = state.get("route", TEXT)
        if route == VISUALIZATION:
            return ["visualize"]
        # Las dos ramas a la vez: el visualizador decide mientras el analista busca y redacta, asi
        # que elegir los componentes no suma latencia de reloj.
        if route == BOTH:
            return ["visualize", "retrieve"]
        return ["retrieve"]

    def after_visualize(state: State) -> str:
        # En la ruta de las dos cosas, `retrieve` corre en paralelo y las dos reconvergen en el
        # redactor. En la ruta visual a secas, sin componentes no hay nada que describir: se cae a
        # buscar en el corpus, y el redactor lo dira.
        if state.get("components") or state.get("route") == BOTH:
            return "write"
        log.info("la ruta visual no produjo componentes; se responde con el corpus")
        return "retrieve"

    def after_retrieve(state: State) -> str:
        # Si la recuperacion se cayo no hay evidencia con la que redactar: se entrega el fallo.
        return END if state.get("status") == INTERNAL_ERROR else "write"

    def after_write(state: State) -> str:
        # Sin evidencia, o con el redactor caido, no hay nada contra lo que verificar ni nada
        # escrito por un modelo que pueda ser toxico: las dos respuestas las escribimos nosotros.
        if state.get("status") in (NO_EVIDENCE, INTERNAL_ERROR):
            return END
        # El verificador compara la respuesta contra los fragmentos recuperados. En la ruta visual
        # no hay ninguno, asi que su comprobacion de citas queda inerte y su llamada se gastaria en
        # nada; el guardian de salida si corre, porque el texto lo escribio un modelo.
        if not state.get("fragments"):
            return "output_guardrail"
        return "verify"

    def after_verify(state: State) -> str:
        if not state.get("rejection"):
            return "output_guardrail"
        if state.get("retries", 0) >= runtime.settings.max_retries:
            # Tope alcanzado: se entrega lo que hay, declarado como no verificado.
            log.warning("tope de reintentos alcanzado", extra={"motivo": state.get("rejection")})
            return "output_guardrail"
        return "rewrite"

    graph = StateGraph(State)
    graph.add_node("input_guardrail", input_guardrail)
    graph.add_node("orchestrator", orchestrator)
    graph.add_node("visualize", visualize)
    graph.add_node("retrieve", retrieve)
    graph.add_node("write", write)
    graph.add_node("verify", verify)
    graph.add_node("rewrite", rewrite)
    graph.add_node("output_guardrail", output_guardrail)

    graph.add_edge(START, "input_guardrail")
    graph.add_conditional_edges("input_guardrail", after_input, ["orchestrator", END])
    graph.add_conditional_edges("orchestrator", after_orchestrator, ["visualize", "retrieve", END])
    graph.add_conditional_edges("visualize", after_visualize, ["write", "retrieve"])
    graph.add_conditional_edges("retrieve", after_retrieve, ["write", END])
    graph.add_conditional_edges("write", after_write, ["verify", "output_guardrail", END])
    graph.add_conditional_edges("verify", after_verify, ["rewrite", "output_guardrail"])
    graph.add_edge("rewrite", "retrieve")
    graph.add_edge("output_guardrail", END)

    return graph.compile()
