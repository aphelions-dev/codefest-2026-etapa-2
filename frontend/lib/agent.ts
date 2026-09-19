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

/** Un paso del razonamiento, tal como la respuesta lo declara. */
export type Step = {
  readonly agent: string;
  readonly tool?: ToolName;
  readonly detail?: string;
};

export type Answer = {
  readonly answer: string;
  readonly activations: readonly Activation[];
  readonly steps: readonly Step[];
  readonly cost: Cost;
  readonly status: string;
};

export class AgentUnavailable extends Error {}

function isTool(name: string): name is ToolName {
  return name in TOOLS;
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

  for (const call of body.evaluacion?.tools_called ?? []) {
    if (!isTool(call.name)) continue;
    steps.push({
      agent: agents.at(-1) ?? "agente",
      tool: call.name,
      detail: describe(call.input_parameters),
    });
    if (activations.some((existing) => existing.tool === call.name)) continue;
    activations.push({
      tool: call.name,
      filters: (call.input_parameters ?? {}) as Record<string, string | number | undefined>,
    });
  }

  return {
    answer: body.respuesta,
    activations,
    steps,
    cost: {
      interactions: body.metadata?.num_interacciones ?? 0,
      tokens: body.metadata?.tokens?.total ?? 0,
      latency: body.metadata?.latencia_ms,
      agents,
    },
    status: body.metadata?.estado ?? "ok",
  };
}
