import type { Activation, ToolName } from "@/components/registry";
import { TOOLS } from "@/components/registry";
import { API_URL } from "@/lib/env";

/**
 * Respuesta del agente, en el formato que exige la especificación. Todo lo que el chat enseña sale
 * de aquí: quién participó, con qué modelo, qué herramientas llamó y qué leyó. Mostrarlo no cuesta
 * un token adicional.
 */
type AgentResponse = {
  readonly respuesta: string;
  readonly evaluacion?: {
    readonly retrieval_context?: readonly string[];
    readonly tools_called?: readonly {
      readonly name: string;
      readonly input_parameters?: Record<string, unknown>;
      readonly output?: unknown;
    }[];
  };
  readonly metadata?: {
    readonly num_interacciones?: number;
    readonly agentes_invocados?: readonly string[];
    readonly tokens?: { readonly input?: number; readonly output?: number; readonly total?: number };
    readonly tokens_por_agente?: readonly {
      readonly agente: string;
      readonly modelo?: string;
      readonly input?: number;
      readonly output?: number;
      readonly total?: number;
    }[];
    readonly latencia_ms?: number;
    readonly estado?: string;
  };
};

/** Una herramienta tal como se llamó: su nombre, con qué y qué devolvió. */
export type ToolRun = {
  readonly name: string;
  readonly input: Record<string, unknown>;
  readonly output: string;
};

/** Un agente del grafo en esta respuesta: su modelo, lo que gastó y lo que hizo. */
export type AgentRun = {
  readonly id: string;
  readonly model?: string;
  readonly tokens?: { readonly input: number; readonly output: number; readonly total: number };
  readonly tools: readonly ToolRun[];
};

/** Un fragmento que el agente leyó, con su procedencia y el principio de su texto. */
export type Source = {
  readonly docId: string;
  readonly chunkId: string;
  readonly excerpt: string;
  /** Si la respuesta lo cita: lo leído no es lo mismo que lo usado. */
  readonly cited: boolean;
};

export type Answer = {
  readonly answer: string;
  readonly activations: readonly Activation[];
  readonly agents: readonly AgentRun[];
  readonly sources: readonly Source[];
  readonly cost: Cost;
  readonly status: string;
  /** `doc_id` → `chunk_id`: a qué fragmento lleva cada cita del texto. */
  readonly anchors: Record<string, string>;
};

/** Lo que la respuesta declara sobre su propio coste. */
export type Cost = {
  readonly interactions: number;
  readonly tokens: number;
  readonly latency?: number;
};

export class AgentUnavailable extends Error {}

/**
 * A qué agente pertenece cada herramienta, según la ficha (`backend/app/agent/tools.py`). La
 * respuesta dice qué herramientas se llamaron y qué agentes participaron, pero no las empareja.
 */
const TOOL_AGENT: Record<string, string> = {
  analyze_prompt_injection: "input_guardrail",
  filter_input: "input_guardrail",
  route_intent: "orchestrator",
  decompose_query: "orchestrator",
  search_corpus: "rag_analyst",
  extract_fragments: "rag_analyst",
  validate_traceability: "verifier",
  validate_faithfulness: "verifier",
  detect_injection: "verifier",
  analyze_response_toxicity: "output_guardrail",
  detect_indirect_injection: "output_guardrail",
};

// Un identificador de documento, con su fragmento si lo trae.
const DOC_ID = /F\d-[A-Z0-9]+-\d+/g;
// `[F3-X-022 · F3-X-022-chunk-0005] texto`: así llega cada fragmento en `retrieval_context`.
const CONTEXT = /^\[(F\d-[A-Z0-9]+-\d+)\s*·\s*(F\d-[A-Z0-9]+-\d+-chunk-\d+)\]\s*/;

function isTool(name: string): name is ToolName {
  return name in TOOLS;
}

/** Pregunta al agente y traduce su respuesta a agentes, fuentes, componentes y coste. */
export async function ask(question: string): Promise<Answer> {
  let response: Response;
  try {
    response = await fetch(new URL("/chat", API_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: question }),
    });
  } catch {
    throw new AgentUnavailable("No se pudo contactar con el agente. Revisa la conexión e inténtalo de nuevo.");
  }
  if (response.status === 404 || response.status === 405) {
    throw new AgentUnavailable(
      "El agente todavía no está desplegado en este endpoint. El radar y los componentes siguen sobre datos reales del corpus.",
    );
  }
  if (!response.ok) throw new AgentUnavailable(`El agente respondió con un error (${response.status}).`);

  const body = (await response.json()) as AgentResponse;
  const calls = body.evaluacion?.tools_called ?? [];
  const cited = new Set(body.respuesta.match(DOC_ID) ?? []);

  // Los fragmentos leídos, en el orden de la recuperación; el primero de cada documento es a donde
  // lleva su cita.
  const sources: Source[] = [];
  const anchors: Record<string, string> = {};
  for (const entry of body.evaluacion?.retrieval_context ?? []) {
    const match = CONTEXT.exec(entry);
    if (!match) continue;
    const [prefix, docId, chunkId] = match;
    anchors[docId] ??= chunkId;
    sources.push({ docId, chunkId, excerpt: entry.slice(prefix.length).trim(), cited: cited.has(docId) });
  }

  // Un agente por cada uno que la respuesta declara, en su orden, con sus herramientas y su gasto.
  const usage = new Map((body.metadata?.tokens_por_agente ?? []).map((entry) => [entry.agente, entry]));
  const agents: AgentRun[] = (body.metadata?.agentes_invocados ?? []).map((id) => {
    const spent = usage.get(id);
    return {
      id,
      model: spent?.modelo,
      tokens: spent
        ? { input: spent.input ?? 0, output: spent.output ?? 0, total: spent.total ?? 0 }
        : undefined,
      tools: calls
        .filter((call) => TOOL_AGENT[call.name] === id)
        .map((call) => ({
          name: call.name,
          input: call.input_parameters ?? {},
          output: typeof call.output === "string" ? call.output : JSON.stringify(call.output ?? ""),
        })),
    };
  });

  // Los componentes del tablero, deducidos del nombre de la herramienta.
  const activations: Activation[] = [];
  for (const call of calls) {
    if (!isTool(call.name) || activations.some((existing) => existing.tool === call.name)) continue;
    const filters = { ...(call.input_parameters ?? {}) } as Record<string, string | number | undefined>;
    // El panel de evidencia se abre en el primer documento que la respuesta cita.
    if (call.name === "search_corpus") {
      const first = sources.find((source) => source.cited);
      if (first) Object.assign(filters, { doc_id: first.docId, chunk_id: first.chunkId });
    }
    activations.push({ tool: call.name, filters });
  }

  return {
    answer: body.respuesta,
    activations,
    agents,
    sources,
    cost: {
      interactions: body.metadata?.num_interacciones ?? 0,
      tokens: body.metadata?.tokens?.total ?? 0,
      latency: body.metadata?.latencia_ms,
    },
    status: body.metadata?.estado ?? "ok",
    anchors,
  };
}

/**
 * Una cita, en cualquiera de las formas en que el redactor la escribe: `[F1-X-005]`, `【F1-X-005】`,
 * `(F1-X-005)`, `**F1-X-005**`, agrupadas con comas o con el fragmento pegado. El backend ya las
 * reconoce todas; aquí se convierten en enlaces.
 */
const CITATION_GROUP =
  /(?:\*\*)?[[【(]\s*((?:F\d-[A-Z0-9]+-\d+(?:-chunk-\d+)?\s*[,;·]?\s*)+)[\]】)](?:\*\*)?/g;

/** La ruta de relleno de un enlace de cita: lo que importa va en la consulta. */
const CITATION_BASE = "http://citation.invalid";

/** El documento y el fragmento de un enlace de cita, o `null` si el enlace no lo es. */
export function parseCitation(href: string | undefined) {
  if (!href) return null;
  try {
    const { searchParams } = new URL(href, CITATION_BASE);
    const docId = searchParams.get("doc");
    return docId ? { docId, chunkId: searchParams.get("fragmento") } : null;
  } catch {
    return null;
  }
}

/**
 * Convierte cada cita del texto en un enlace al fragmento que la sostiene. La ruta es relativa a
 * propósito: el saneado de Streamdown descarta cualquier enlace que no empiece por `/`, y quien lo
 * pinta reconstruye la URL con la del lector.
 */
export function linkCitations(text: string, anchors: Record<string, string>): string {
  return text.replace(CITATION_GROUP, (group) =>
    [...new Set(group.match(DOC_ID) ?? [])]
      .map((id) => `[\`${id}\`](/?doc=${id}${anchors[id] ? `&fragmento=${anchors[id]}` : ""})`)
      .join(" "),
  );
}
