"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { AnalysisPanel } from "@/components/analysis-panel";
import { ChatPanel, type Turn } from "@/components/chat/panel";
import { DocumentView } from "@/components/document-view";
import { MapBackdrop, type Selection } from "@/components/map/backdrop";
import { quantileBreaks } from "@/components/map/layers";
import type { Place, PlaceFeature } from "@/components/map/place-card";
import type { Activation } from "@/components/registry";
import { SIDEBAR_OPEN, SIDEBAR_RAIL, Sidebar } from "@/components/sidebar";
import { TimelineStrip } from "@/components/timeline-strip";
import { AgentUnavailable, ask } from "@/lib/agent";
import type { Places } from "@/lib/api";
import { useEntity, useMapLevel, usePhenomenon } from "@/lib/filters";
import { useApi } from "@/lib/use-api";

// Ancho del analista: el mapa lo usa para no encuadrar ni poner sus controles debajo del panel.
const CHAT_RAIL = 44;
const CHAT_WIDTH = 384;
// Por debajo de este ancho arrancan plegados el analista y la barra, y el radar se ve entero.
const NARROW = 1280;

/**
 * Lo que el radar muestra mientras el analista no ha pedido nada.
 *
 * No están todos los componentes: la especificación pide expresamente que el tablero no los muestre
 * a la vez. El mapa y la línea de tiempo ya cubren lo espacial y lo temporal por estar siempre
 * presentes; estos dos abren la comparación cruzada y la priorización, y el resto los activa el
 * agente cuando la pregunta los pide.
 */
const DEFAULT_VIEW: readonly Activation[] = [
  { tool: "get_entity_matrix", filters: { cols: "observatory" } },
  { tool: "get_quadrant" },
  { tool: "get_cooccurrence" },
];

// Estos dos no son tarjetas de la barra: el mapa es el lienzo y la serie temporal, la franja.
const OUT_OF_COLUMN = new Set<Activation["tool"]>(["get_places", "get_timeline"]);

export function Dashboard() {
  const [phenomenon, setPhenomenon] = usePhenomenon();
  const [level, setLevel] = useMapLevel(phenomenon);
  const [entity, setEntity] = useEntity();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [activations, setActivations] = useState<readonly Activation[]>(DEFAULT_VIEW);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [chatChoice, setChatChoice] = useState<boolean | null>(null);
  const [sidebarChoice, setSidebarChoice] = useState<boolean | null>(null);
  const [viewport, setViewport] = useState(1440);
  // El alto de la franja temporal depende de si tiene serie que dibujar, así que se mide en vez de
  // calcularse: la barra y el mapa le dejan justo el hueco que ocupa.
  const strip = useRef<HTMLDivElement>(null);
  const [timelineSpace, setTimelineSpace] = useState(52);

  const { data } = useApi<Places>("/places", {
    level,
    phenomenon: phenomenon ?? undefined,
    // La entidad seleccionada en cualquier vista reduce el mapa a los documentos que la nombran.
    entity: entity ?? undefined,
    limit: level === "department" ? 40 : 90,
  });
  const features = (data?.features ?? []) as unknown as readonly PlaceFeature[];
  const breaks = quantileBreaks(features.map((feature) => feature.properties.documents));

  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setTimelineSpace(entry.contentRect.height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setViewport(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Cambiar de nivel o de fenómeno cambia el conjunto de territorios: lo elegido deja de existir.
  useEffect(() => setSelected(null), [level, phenomenon, entity]);

  const chatOpen = chatChoice ?? viewport >= NARROW;
  const sidebarOpen = sidebarChoice ?? viewport >= NARROW;
  const chatWidth = chatOpen ? CHAT_WIDTH : CHAT_RAIL;
  const sidebarWidth = sidebarOpen ? SIDEBAR_OPEN : SIDEBAR_RAIL;
  const columnPanels = activations.filter((activation) => !OUT_OF_COLUMN.has(activation.tool));
  const timelineEntity = activations.find((activation) => activation.tool === "get_timeline")?.filters?.entity;

  // La API devuelve los lugares ordenados por documentos, así que el índice ya es el puesto.
  const rankOf = (place: Place | null) => {
    if (!place) return null;
    const index = features.findIndex((feature) => feature.properties.place_id === place.place_id);
    return index < 0 ? null : index;
  };

  const onAsk = async (question: string) => {
    setPending(true);
    try {
      const { answer, activations: chosen, steps, cost, status } = await ask(question);
      setTurns((previous) => [...previous, { question, answer, activations: chosen, steps, cost, status }]);
      // Lo que el agente activó reemplaza la vista: el tablero no muestra todo a la vez.
      if (chosen.length > 0) {
        setActivations(chosen);
        setAnalysisOpen(true);
      }
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
      <MapBackdrop
        bottomInset={timelineSpace}
        breaks={breaks}
        features={features}
        leftInset={sidebarWidth}
        level={level}
        onLevel={setLevel}
        onSelect={setSelected}
        rankOf={rankOf}
        rightInset={chatWidth}
        selected={selected}
      />

      <AnalysisPanel
        activations={analysisOpen ? columnPanels : []}
        bottomInset={timelineSpace}
        entity={entity}
        onEntity={setEntity}
        leftInset={sidebarWidth}
        onClose={() => setAnalysisOpen(false)}
        phenomenon={phenomenon}
        rightInset={chatWidth}
      />

      <Sidebar
        analysisOpen={analysisOpen}
        components={columnPanels.length}
        features={features}
        level={level}
        onPhenomenon={setPhenomenon}
        onSelectPlace={(feature) =>
          setSelected({
            place: feature.properties,
            geometry: feature.geometry as unknown as GeoJSON.Geometry,
          })
        }
        onToggle={() => setSidebarChoice(!sidebarOpen)}
        onToggleAnalysis={() => setAnalysisOpen((open) => !open)}
        open={sidebarOpen}
        phenomenon={phenomenon}
      />

      {/* La serie temporal, anclada abajo entre la barra y el analista: necesita anchura para leerse. */}
      <div
        className="absolute bottom-0 z-10"
        ref={strip}
        style={{ left: sidebarWidth, right: chatWidth }}
      >
        <TimelineStrip
          entity={entity ?? (timelineEntity as string | undefined)}
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
