"""El grafo: cinco agentes y el ciclo de reintento.

    input_guardrail -> orchestrator -> retrieve -> write -> verify -> output_guardrail -> fin
           |                |             |          |         |
           v                v             v          v         v
          fin              fin           fin        fin     rewrite --> retrieve

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
from app.config import Settings

log = logging.getLogger("agent.graph")

# Saludos y preguntas sobre el propio asistente: lo unico que no se busca en el corpus. Tiene que
# ser un mensaje corto y empezar asi, para que "hola, que dice el corpus sobre..." vaya a buscar.
SMALL_TALK = re.compile(
    r"^(hola|buenas|buenos d[ií]as|buenas tardes|hey|qu[eé] tal|c[oó]mo est[aá]s|gracias|"
    r"qui[eé]n eres|qu[eé] eres|qu[eé] puedes hacer|qu[eé] haces|ayuda|help)(?![a-záéíóúñ])[\s\S]{0,40}$",
    re.IGNORECASE,
)

DECOMPOSE_SCHEMA = {
    "type": "object",
    "properties": {
        "queries": {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": 3},
        "phenomenon": {"type": ["integer", "null"], "enum": [1, 2, 3, None]},
    },
    "required": ["queries", "phenomenon"],
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
        """Enruta y, si hay que buscar, prepara las formulaciones.

        El enrutado se decide con una regla, no con el modelo, y el defecto es buscar. Medido
        sobre las 50 consultas del reto: preguntarselo al modelo grande costaba una llamada en
        cada consulta y mandaba dos fuera de alcance —amenazas ciberneticas sobre sistemas de IA,
        y crimen organizado frente a las instituciones—, que son relevancia cero garantizada.
        Enumerar temas siempre deja fuera el siguiente.

        Y ademas era redundante: el filtro de fuera-de-alcance que funciona no es este, es el
        umbral de evidencia. Una consulta ajena al corpus se queda en 0,404 de similitud y no
        pasa de 0,52, asi que acaba en `sin_evidencia` sin que nadie tenga que adivinar el tema.
        """
        question = state["sanitized"]
        saludo = bool(SMALL_TALK.match(question.strip()))
        tools = [
            ToolRecord(
                name="route_intent",
                input_parameters={"query": question},
                output="small_talk" if saludo else "corpus",
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

        plan = parse_json(text, {"queries": [question], "phenomenon": None})
        queries = [q for q in plan.get("queries") or [] if isinstance(q, str) and q.strip()]
        tools.append(
            ToolRecord(
                name="decompose_query",
                input_parameters={"query": question, "rejection": rejection},
                output=" | ".join(queries) or question,
            )
        )
        return {
            "queries": queries or [question],
            "phenomenon": plan.get("phenomenon"),
            "usage": [*usage, decompose_usage],
            "tools": tools,
            "agents": ["orchestrator"],
        }

    def _to_corpus(question, usage, tools) -> State:
        return {
            "queries": [question],
            "phenomenon": None,
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

    async def write(state: State) -> State:
        """El redactor. Sin herramientas y con la evidencia delimitada como datos."""
        fragments = state.get("fragments") or []
        if not fragments:
            return {"answer": prompts.NO_EVIDENCE, "status": NO_EVIDENCE}

        try:
            text, usage = await runtime.client.complete(
                agent="rag_analyst",
                model=deep,
                system=prompts.WRITER,
                user=f"{prompts.evidence_block(fragments)}\n\n<pregunta>\n{state['sanitized']}\n</pregunta>",
            )
        except ModelError:
            # El corpus si tenia evidencia: lo que falto fue el modelo. Confundirlo con
            # `sin_evidencia` dejaria una respuesta que niega los fragmentos que van en
            # `retrieval_context`.
            log.exception("el redactor no respondio")
            return {"answer": prompts.FAILED, "status": INTERNAL_ERROR}

        return {"answer": text, "status": OK, "usage": [usage], "agents": ["rag_analyst"]}

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

    def after_orchestrator(state: State) -> str:
        # Saludo o pregunta ajena: ya hay respuesta y no hay nada que verificar.
        return END if state.get("answer") else "retrieve"

    def after_retrieve(state: State) -> str:
        # Si la recuperacion se cayo no hay evidencia con la que redactar: se entrega el fallo.
        return END if state.get("status") == INTERNAL_ERROR else "write"

    def after_write(state: State) -> str:
        # Sin evidencia, o con el redactor caido, no hay nada contra lo que verificar ni nada
        # escrito por un modelo que pueda ser toxico: las dos respuestas las escribimos nosotros.
        return END if state.get("status") in (NO_EVIDENCE, INTERNAL_ERROR) else "verify"

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
    graph.add_node("retrieve", retrieve)
    graph.add_node("write", write)
    graph.add_node("verify", verify)
    graph.add_node("rewrite", rewrite)
    graph.add_node("output_guardrail", output_guardrail)

    graph.add_edge(START, "input_guardrail")
    graph.add_conditional_edges("input_guardrail", after_input, ["orchestrator", END])
    graph.add_conditional_edges("orchestrator", after_orchestrator, ["retrieve", END])
    graph.add_conditional_edges("retrieve", after_retrieve, ["write", END])
    graph.add_conditional_edges("write", after_write, ["verify", END])
    graph.add_conditional_edges("verify", after_verify, ["rewrite", "output_guardrail"])
    graph.add_edge("rewrite", "retrieve")
    graph.add_edge("output_guardrail", END)

    return graph.compile()
