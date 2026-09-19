import type { Activation, ToolName } from "@/components/registry";
import { TOOLS } from "@/components/registry";
import { API_URL } from "@/lib/env";

/**
 * Respuesta del agente, en el formato que exige la especificación. De aquí el tablero solo necesita
 * `respuesta` y `evaluacion.tools_called`: el componente se deduce del nombre de la herramienta, así
 * que activar una visualización no cuesta ningún token adicional.
 */
type AgentResponse = {
  readonly respuesta: string;
  readonly evaluacion?: {
    readonly tools_called?: readonly { readonly name: string; readonly input_parameters?: Record<string, unknown> }[];
  };
  readonly metadata?: { readonly estado?: string };
};

export type Answer = { readonly answer: string; readonly activations: readonly Activation[] };

export class AgentUnavailable extends Error {}

function isTool(name: string): name is ToolName {
  return name in TOOLS;
}

/** Pregunta al agente y traduce sus herramientas a componentes del tablero. */
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
      "El agente todavía no está desplegado en este endpoint. Los componentes de abajo siguen sobre datos reales del corpus y el filtro por fenómeno funciona.",
    );
  }
  if (!response.ok) throw new AgentUnavailable(`El agente respondió ${response.status}.`);

  const body = (await response.json()) as AgentResponse;
  const activations: Activation[] = [];
  for (const call of body.evaluacion?.tools_called ?? []) {
    if (!isTool(call.name)) continue;
    if (activations.some((existing) => existing.tool === call.name)) continue;
    activations.push({
      tool: call.name,
      filters: (call.input_parameters ?? {}) as Record<string, string | number | undefined>,
    });
  }
  return { answer: body.respuesta, activations };
}
