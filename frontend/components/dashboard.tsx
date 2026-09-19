"use client";

import { useState } from "react";

import { ChatPanel, type Turn } from "@/components/chat/panel";
import { type Activation, render } from "@/components/registry";
import { AgentUnavailable, ask } from "@/lib/agent";
import { PHENOMENA, usePhenomenon } from "@/lib/filters";

/**
 * Lo que se ve mientras el analista no ha pedido nada. Una vista por cada capacidad que el anexo
 * enumera: comparación sobre la metadata, relaciones, geoespacial, temporal y acceso al texto.
 */
const DEFAULT_VIEW: readonly Activation[] = [
  { tool: "get_places" },
  { tool: "get_entity_matrix", filters: { cols: "observatory" } },
  { tool: "get_cooccurrence" },
  { tool: "get_metadata_breakdown", filters: { by: "observatory" } },
  { tool: "get_timeline" },
  { tool: "get_document" },
];

export function Dashboard() {
  const [phenomenon, setPhenomenon] = usePhenomenon();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [pending, setPending] = useState(false);
  // Lo que el agente activó vive en memoria con el hilo; el filtro global vive en la URL.
  const [activations, setActivations] = useState<readonly Activation[]>(DEFAULT_VIEW);

  const onAsk = async (question: string) => {
    setPending(true);
    try {
      const { answer, activations: chosen } = await ask(question);
      setTurns((previous) => [...previous, { question, answer, activations: chosen }]);
      if (chosen.length > 0) setActivations(chosen);
    } catch (error) {
      const message = error instanceof AgentUnavailable ? error.message : "El agente falló.";
      setTurns((previous) => [...previous, { question, answer: null, activations: [], error: message }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex h-dvh flex-col lg:flex-row">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <h1 className="mr-2 text-sm font-semibold">Radar Estratégico</h1>
          <div className="flex gap-1" role="group" aria-label="Filtrar por fenómeno">
            <button
              aria-pressed={phenomenon === null}
              className="border-border aria-pressed:border-accent rounded-md border px-2 py-1 text-xs"
              onClick={() => setPhenomenon(null)}
              type="button"
            >
              Los tres
            </button>
            {PHENOMENA.map((item) => (
              <button
                aria-pressed={phenomenon === item.id}
                className="border-border aria-pressed:border-accent rounded-md border px-2 py-1 text-xs"
                key={item.id}
                onClick={() => setPhenomenon(item.id)}
                style={phenomenon === item.id ? { borderColor: item.color, color: item.color } : undefined}
                title={item.label}
                type="button"
              >
                {item.short}
              </button>
            ))}
          </div>
          <p className="text-muted ml-auto text-xs">
            {activations.length} componente{activations.length === 1 ? "" : "s"} activo
            {activations.length === 1 ? "" : "s"}
          </p>
        </header>

        <div className="grid min-h-0 flex-1 auto-rows-min gap-3 overflow-auto p-3 lg:grid-cols-2">
          {activations.map((activation) => (
            <div className="contents" key={activation.tool}>
              {render(activation, { phenomenon })}
            </div>
          ))}
        </div>
      </div>

      <div className="h-[46vh] shrink-0 lg:h-auto lg:w-[26rem]">
        <ChatPanel onAsk={onAsk} pending={pending} turns={turns} />
      </div>
    </main>
  );
}
