"use client";

import { PanelLeftCloseIcon, PanelLeftOpenIcon, RadarIcon } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";

import { ChatPanel, type Turn } from "@/components/chat/panel";
import { DocumentView } from "@/components/document-view";
import { IconButton } from "@/components/icon-button";
import { MapBackdrop } from "@/components/map/backdrop";
import { GLASS } from "@/components/map/panel";
import { type Activation, render } from "@/components/registry";
import { TimelineStrip } from "@/components/timeline-strip";
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
];

// Estos dos no son tarjetas de la columna: el mapa es el fondo y la serie temporal, la franja.
const OUT_OF_COLUMN = new Set<Activation["tool"]>(["get_places", "get_timeline"]);

export function Dashboard() {
  const [phenomenon, setPhenomenon] = usePhenomenon();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [activations, setActivations] = useState<readonly Activation[]>(DEFAULT_VIEW);
  const [panelsOpen, setPanelsOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [chatChoice, setChatChoice] = useState<boolean | null>(null);
  const [viewport, setViewport] = useState(1440);
  // El alto de la franja temporal depende de si tiene serie que dibujar, asi que se mide en vez
  // de calcularse: la columna y la leyenda le dejan justo el hueco que ocupa.
  const strip = useRef<HTMLDivElement>(null);
  const [timelineSpace, setTimelineSpace] = useState(52);

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setTimelineSpace(entry.contentRect.height + 12));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const chatOpen = chatChoice ?? viewport >= NARROW;
  const chatWidth = chatOpen ? CHAT_WIDTH : CHAT_RAIL;
  const columnPanels = activations.filter((activation) => !OUT_OF_COLUMN.has(activation.tool));
  const timelineEntity = activations.find((activation) => activation.tool === "get_timeline")?.filters?.entity;

  const onAsk = async (question: string) => {
    setPending(true);
    try {
      const { answer, activations: chosen, steps, cost, status } = await ask(question);
      setTurns((previous) => [...previous, { question, answer, activations: chosen, steps, cost, status }]);
      // Lo que el agente activó reemplaza la vista: el tablero no muestra todo a la vez.
      if (chosen.length > 0) setActivations(chosen);
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
      <MapBackdrop phenomenon={phenomenon} rightInset={chatWidth} timelineSpace={timelineSpace} />

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

      {/* Los componentes que el agente activó, en la columna izquierda sobre el radar. */}
      {panelsOpen && columnPanels.length > 0 ? (
        <div
          className="absolute top-16 left-3 z-10 flex w-[23rem] flex-col gap-3 overflow-y-auto pr-1"
          style={{ bottom: timelineSpace, maxWidth: `calc(100vw - ${chatWidth + 24}px)` }}
        >
          {columnPanels.map((activation) => (
            <div className="shrink-0 [&>section]:max-h-[19rem]" key={activation.tool}>
              {render(activation, { phenomenon })}
            </div>
          ))}
        </div>
      ) : null}

      <div className="absolute bottom-0 left-0 z-10" ref={strip} style={{ right: chatWidth }}>
        <TimelineStrip
          entity={timelineEntity as string | undefined}
          onToggle={() => setTimelineOpen((open) => !open)}
          open={timelineOpen}
          phenomenon={phenomenon}
        />
      </div>

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

      {/* El documento que sustenta un dato, sobre el radar y con su estado en la URL. */}
      <DocumentView />
    </main>
  );
}
