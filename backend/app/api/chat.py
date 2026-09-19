"""El endpoint que evalua ADL, y la ficha del sistema multiagente.

El contrato de la respuesta es el de la seccion 2.4 de la especificacion y no admite variantes: los
nombres de los campos son los que consumen DeepEval y el calculo de costo, asi que van en espanol
aunque el resto del codigo use identificadores en ingles.
"""

from fastapi import APIRouter, Request

from app.agents import Orchestrator, Run
from app.config import settings
from app.schema import AgentCard, ChatRequest, ChatResponse, Evaluation, Metadata, Tokens, AgentTokens
from app.tools import Toolbox

router = APIRouter(tags=["agent"])

VERSION = "1.0.0"


@router.post("/chat", summary="Responde una consulta del usuario")
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    """Una consulta, una respuesta completa: texto, insumo de calidad e insumo de eficiencia.

    El orquestador nunca propaga una excepcion: un 500 no trae `metadata`, y sin `metadata` la
    pregunta cuenta como fallo entero en el bloque de eficiencia. Un error llega hasta aqui como
    una traza con `estado` distinto de `ok`.
    """
    orchestrator: Orchestrator | None = getattr(request.app.state, "orchestrator", None)
    if orchestrator is None:
        run = Run(question=body.input)
        run.status = "unavailable"
        run.answer = "El agente no esta disponible: falta la configuracion de modelos o de base de datos."
        return _respond(run)

    return _respond(await orchestrator.run(body.input))


@router.get("/agent-card", summary="Ficha del sistema multiagente")
async def agent_card(request: Request) -> AgentCard:
    """La arquitectura declarada: el agente, su orquestador y los subagentes con sus herramientas.

    Se sirve desde el mismo despliegue que responde para que no pueda quedar desfasada de lo que el
    sistema hace de verdad: las herramientas salen del propio registro.
    """
    toolbox: Toolbox | None = getattr(request.app.state, "toolbox", None)
    cards = {name: tool.card() for name, tool in (toolbox.tools if toolbox else {}).items()}

    return AgentCard.model_validate(
        {
            "agente": {
                "nombre": "Radar Estrategico de Tendencias Aeroespaciales",
                "descripcion": (
                    "Responde preguntas sobre el corpus de los tres fenomenos del reto con "
                    "evidencia citada, y genera las visualizaciones del tablero a partir de "
                    "instrucciones en lenguaje natural."
                ),
                "version": VERSION,
                "endpoint": settings.agent_endpoint,
                "input_modes": ["text/plain", "application/json"],
                "output_modes": ["application/json"],
            },
            "orquestador": {
                "nombre": "Orquestador principal",
                "descripcion": (
                    "Recibe la consulta del usuario y decide, de forma determinista y sin consumir "
                    "modelo, si la resuelve el agente de corpus, el agente de visualizaciones o una "
                    "respuesta fija. No lee el corpus, asi que ningun contenido recuperado puede "
                    "alterar el enrutamiento."
                ),
                "modelo": "ninguno (enrutamiento deterministico)",
                "proveedor": "ninguno",
                "tools": [],
            },
            "subagentes": [
                {
                    "id": "agente_corpus",
                    "nombre": "Agente de corpus",
                    "descripcion": (
                        "Recupera fragmentos del indice de la Etapa 1 y redacta la respuesta "
                        "citando el documento de cada afirmacion. Las citas se verifican contra la "
                        "evidencia recuperada antes de devolverlas."
                    ),
                    "modelo": settings.deep_model,
                    "proveedor": settings.provider,
                    "activado_por": "orquestador",
                    "ejemplos_de_activacion": [
                        "Que dice el corpus sobre el uso de IA en sistemas de mando y control?",
                        "Que riesgos se describen para la orbita baja terrestre?",
                    ],
                    "tools": [cards[name] for name in ["search_corpus"] if name in cards],
                },
                {
                    "id": "agente_visualizaciones",
                    "nombre": "Agente de visualizaciones",
                    "descripcion": (
                        "Decide que componente del tablero activar y con que filtros poblarlo, "
                        "llamando a la herramienta de agregacion que corresponde a la tarea "
                        "analitica de la pregunta."
                    ),
                    "modelo": settings.fast_model,
                    "proveedor": settings.provider,
                    "activado_por": "orquestador",
                    "ejemplos_de_activacion": [
                        "Muestrame los departamentos que concentran las dinamicas territoriales",
                        "Compara cuantos documentos aporta cada observatorio",
                    ],
                    "tools": [
                        cards[name]
                        for name in [
                            "get_metadata_breakdown",
                            "get_entity_matrix",
                            "get_cooccurrence",
                            "get_quadrant",
                            "get_places",
                            "get_timeline",
                        ]
                        if name in cards
                    ],
                },
            ],
        }
    )


def _respond(run: Run) -> ChatResponse:
    """La traza de la ejecucion, vertida al contrato de la seccion 2.4."""
    return ChatResponse(
        respuesta=run.answer,
        evaluacion=Evaluation(
            input=run.question,
            actual_output=run.answer,
            retrieval_context=run.retrieval_context,
            tools_called=run.tools_called,
        ),
        metadata=Metadata(
            num_interacciones=run.interactions,
            agentes_invocados=run.agents,
            tokens=Tokens(**run.tokens()),
            tokens_por_agente=[
                AgentTokens(
                    agente=item.agent,
                    modelo=item.model,
                    input=item.input,
                    output=item.output,
                    total=item.total,
                )
                for item in run.usage
            ],
            latencia_ms=run.latency_ms(),
            estado=run.status,
        ),
    )
