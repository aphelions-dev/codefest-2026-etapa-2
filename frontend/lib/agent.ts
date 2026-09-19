import type { Cost } from "@/components/agent-trace";
import type { Activation, ToolName } from "@/components/registry";
import { TOOLS } from "@/components/registry";
import { API_URL } from "@/lib/env";

/**
 * Respuesta del agente, en el formato que exige la especificación. El tablero no necesita nada
 * fuera de ahí: el componente se deduce del nombre de la herramienta, que ya viaja en
 * `tools_called`, así que activar una visualización no cuesta ningún token adicional.
 */
type AgentResponse = {
  readonly respuesta: string;
  readonly evaluacion?: {
    readonly tools_called?: readonly {
      readonly name: string;
      readonly input_parameters?: Record<string, unknown>;
      readonly output?: unknown;
    }[];
  };
  readonly metadata?: {
    readonly num_interacciones?: number;
    readonly agentes_invocados?: readonly string[];
    readonly tokens?: { readonly total?: number };
    readonly latencia_ms?: number;
    readonly estado?: string;
  };
};

/** Un fragmento recuperado, tal como lo declara la salida de la herramienta de búsqueda. */
export type Retrieved = {
  readonly doc_id: string;
  readonly chunk_id: string;
  readonly observatory: string | null;
  readonly phenomenon: number;
  readonly similarity: number;
};

/** Un paso del razonamiento, tal como la respuesta lo declara. */
export type Step = {
  readonly agent: string;
  readonly tool?: ToolName;
  readonly detail?: string;
  /** Lo que la herramienta devolvió, cuando son fragmentos del corpus. */
  readonly results?: readonly Retrieved[];
};

export type Answer = {
  readonly answer: string;
  readonly activations: readonly Activation[];
  readonly steps: readonly Step[];
  readonly cost: Cost;
  readonly status: string;
  /** `doc_id` → `chunk_id`: a qué fragmento lleva cada cita del texto. */
  readonly anchors: Record<string, string>;
};

export class AgentUnavailable extends Error {}

// [F1-CSET-005]: el identificador del documento que sustenta una afirmación, en la respuesta.
const CITATION = /\[(F\d-[A-Z0-9]+-\d+)\]/;

function isTool(name: string): name is ToolName {
  return name in TOOLS;
}

/**
 * Los fragmentos que devolvió una búsqueda, leídos de la salida que la herramienta ya declara en
 * `tools_called`. No hace falta ningún campo fuera del contrato: la especificación pide ahí «la
 * salida obtenida», y la salida son exactamente estos identificadores.
 */
function retrieved(output: unknown): readonly Retrieved[] {
  if (typeof output !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(output);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Retrieved =>
        typeof item === "object" && item !== null && "doc_id" in item && "chunk_id" in item,
    );
  } catch {
    return [];
  }
}

/** Los parámetros con los que se llamó una herramienta, en una línea legible. */
function describe(parameters: Record<string, unknown> | undefined): string | undefined {
  const entries = Object.entries(parameters ?? {}).filter(([, value]) => value !== undefined && value !== null);
  if (entries.length === 0) return undefined;
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}

/** Pregunta al agente y traduce su respuesta a componentes, pasos y coste. */
export async function ask(question: string): Promise<Answer> {
  let response: Response;
  try {
    response = await fetch(new URL("/chat", API_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: question }),
    });
  } catch {
    throw new AgentUnavailable("No se pudo contactar con el agente.");
  }
  if (response.status === 404 || response.status === 405) {
    throw new AgentUnavailable(
      "El agente todavía no está desplegado en este endpoint. El radar y los componentes siguen sobre datos reales del corpus, y el filtro por fenómeno funciona.",
    );
  }
  if (!response.ok) throw new AgentUnavailable(`El agente respondió ${response.status}.`);

  const body = (await response.json()) as AgentResponse;
  const activations: Activation[] = [];
  const steps: Step[] = [];
  const agents = body.metadata?.agentes_invocados ?? [];

  // El fragmento más relevante de cada documento recuperado: a donde lleva su cita en el texto.
  const anchors: Record<string, string> = {};

  for (const call of body.evaluacion?.tools_called ?? []) {
    if (!isTool(call.name)) continue;
    const results = retrieved(call.output);
    // Se recorre al revés para que gane el primero de la lista, que es el mejor colocado.
    for (const result of [...results].reverse()) anchors[result.doc_id] = result.chunk_id;
    steps.push({
      agent: agents.at(-1) ?? "agente",
      tool: call.name,
      detail: describe(call.input_parameters),
      results,
    });
    if (activations.some((existing) => existing.tool === call.name)) continue;
    activations.push({
      tool: call.name,
      filters: (call.input_parameters ?? {}) as Record<string, string | number | undefined>,
    });
  }

  // El panel de evidencia se llena con el primer documento que la respuesta cita: los parámetros de
  // la búsqueda no lo dicen, y leerlo de la propia cita no cuesta ningún token adicional.
  const cited = CITATION.exec(body.respuesta)?.[1];
  const withEvidence = activations.map((activation) =>
    activation.tool === "search_corpus" && cited
      ? { ...activation, filters: { ...activation.filters, doc_id: cited } }
      : activation,
  );

  return {
    answer: body.respuesta,
    activations: withEvidence,
    steps,
    cost: {
      interactions: body.metadata?.num_interacciones ?? 0,
      tokens: body.metadata?.tokens?.total ?? 0,
      latency: body.metadata?.latencia_ms,
      agents,
    },
    status: body.metadata?.estado ?? "ok",
    anchors,
  };
}

// [F1-CSET-005] o agrupadas: [F2-CSIS-083, F2-CSIS-150].
const CITATION_GROUP = /\[((?:\s*F\d-[A-Z0-9]+-\d+\s*[,;]?)+)\]/g;
const DOC_ID = /F\d-[A-Z0-9]+-\d+/g;

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
 * Convierte cada cita del texto en un enlace al fragmento que la sostiene, cuando la respuesta dijo
 * cuál es. La ruta es relativa a propósito: el saneado de Streamdown descarta cualquier enlace que
 * no empiece por `/`, y quien lo pinta reconstruye la URL con la del lector.
 */
export function linkCitations(text: string, anchors: Record<string, string>): string {
  return text.replace(CITATION_GROUP, (group) =>
    (group.match(DOC_ID) ?? [])
      .map((id) => `[\`${id}\`](/?doc=${id}${anchors[id] ? `&fragmento=${anchors[id]}` : ""})`)
      .join(" "),
  );
}
