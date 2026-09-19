"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon, RadarIcon } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";

import { ChatPanel, type Turn } from "@/components/chat/panel";
import { IconButton } from "@/components/icon-button";
import { MapBackdrop } from "@/components/map/backdrop";
import { GLASS } from "@/components/map/panel";
import { type Activation, render } from "@/components/registry";
import { AgentUnavailable, ask } from "@/lib/agent";
import { PHENOMENA, PHENOMENON_STYLE, usePhenomenon } from "@/lib/filters";
import { cn } from "@/lib/utils";

// Ancho del analista: el mapa lo usa para no encuadrar ni poner sus controles debajo del panel.
const CHAT_RAIL = 44;
const CHAT_WIDTH = 384;
// Por debajo de este ancho el analista arranca plegado y el radar se ve entero.
const NARROW = 1280;

/**
 * Lo que el radar muestra mientras el analista no ha pedido nada: una vista por cada capacidad que
 * el anexo enumera. El mapa no está en la lista porque es el lienzo, siempre presente.
 */
const DEFAULT_VIEW: readonly Activation[] = [
  { tool: "get_entity_matrix", filters: { cols: "observatory" } },
  { tool: "get_cooccurrence" },
  { tool: "get_metadata_breakdown", filters: { by: "observatory" } },
  { tool: "get_timeline" },
];

export function Dashboard() {
  const [phenomenon, setPhenomenon] = usePhenomenon();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [activations, setActivations] = useState<readonly Activation[]>(DEFAULT_VIEW);
  const [panelsOpen, setPanelsOpen] = useState(true);
  const [chatChoice, setChatChoice] = useState<boolean | null>(null);
  const [viewport, setViewport] = useState(1440);

  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const chatOpen = chatChoice ?? viewport >= NARROW;
  const chatWidth = chatOpen ? CHAT_WIDTH : CHAT_RAIL;

  const onAsk = async (question: string) => {
    setPending(true);
    try {
      const { answer, activations: chosen, steps, cost, status } = await ask(question);
      setTurns((previous) => [...previous, { question, answer, activations: chosen, steps, cost, status }]);
      // Lo que el agente activó reemplaza la vista: el tablero no muestra todo a la vez.
      if (chosen.length > 0) setActivations(chosen.filter((activation) => activation.tool !== "get_places"));
    } catch (error) {
      const message = error instanceof AgentUnavailable ? error.message : "El agente falló.";
      setTurns((previous) => [...previous, { question, answer: null, activations: [], error: message }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <main
      className="relative h-dvh w-full overflow-hidden"
      style={{ "--map-right": `${chatWidth + 12}px` } as CSSProperties}
    >
      <MapBackdrop phenomenon={phenomenon} rightInset={chatWidth} />

      {/* Barra del radar: el filtro global por fenómeno, que se propaga a todas las vistas. */}
      <header
        className={cn(
          GLASS,
          "border-border/60 absolute top-3 left-3 z-20 flex items-center gap-2 rounded-xl border px-3 py-2",
        )}
      >
        <RadarIcon className="text-primary size-4" />
        <span className="mr-1 text-[13px] font-medium">Radar Estratégico</span>
        <div aria-label="Filtrar por fenómeno" className="flex gap-1" role="group">
          <button
            aria-pressed={phenomenon === null}
            className="border-border/60 aria-pressed:border-primary aria-pressed:text-primary rounded-md border px-2 py-1 text-[11px]"
            onClick={() => setPhenomenon(null)}
            type="button"
          >
            Los tres
          </button>
          {PHENOMENA.map((item) => (
            <button
              aria-pressed={phenomenon === item.id}
              className={cn(
                "border-border/60 rounded-md border px-2 py-1 text-[11px]",
                phenomenon === item.id && PHENOMENON_STYLE[item.id],
              )}
              key={item.id}
              onClick={() => setPhenomenon(item.id)}
              title={item.label}
              type="button"
            >
              {item.short}
            </button>
          ))}
        </div>
        <IconButton
          label={panelsOpen ? "Ocultar los componentes" : "Mostrar los componentes"}
          onClick={() => setPanelsOpen((open) => !open)}
        >
          {panelsOpen ? <PanelLeftCloseIcon className="size-4" /> : <PanelLeftOpenIcon className="size-4" />}
        </IconButton>
      </header>

      {/* Los componentes que el agente activó, flotando sobre el radar. */}
      {panelsOpen ? (
        <div
          className="absolute top-16 bottom-3 left-3 z-10 flex w-[26rem] flex-col gap-3 overflow-y-auto pr-1"
          style={{ maxWidth: `calc(100vw - ${chatWidth + 24}px)` }}
        >
          {activations.map((activation) => (
            <div className="max-h-80 shrink-0 [&>section]:max-h-80" key={activation.tool}>
              {render(activation, { phenomenon })}
            </div>
          ))}
        </div>
      ) : null}

      {/* El analista, anclado al borde derecho. */}
      <div className="absolute inset-y-0 right-0 z-20" style={{ width: chatWidth }}>
        <ChatPanel
          collapsed={!chatOpen}
          onAsk={onAsk}
          onToggle={() => setChatChoice(!chatOpen)}
          pending={pending}
          turns={turns}
        />
      </div>
    </main>
  );
}
