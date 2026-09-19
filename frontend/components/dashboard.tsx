"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { AnalysisPanel } from "@/components/analysis-panel";
import { ChatPanel, type Turn } from "@/components/chat/panel";
import { DocumentView } from "@/components/document-view";
import { MapBackdrop, type Selection } from "@/components/map/backdrop";
import { quantileBreaks } from "@/components/map/layers";
import type { Activation } from "@/components/registry";
import { SIDEBAR_OPEN, SIDEBAR_RAIL, Sidebar } from "@/components/sidebar";
import { TimelineStrip } from "@/components/timeline-strip";
import { AgentUnavailable, ask } from "@/lib/agent";
import { rankOf } from "@/lib/format";
import { useEntity, useMapLevel, usePhenomenon } from "@/lib/filters";
import { isActive, periodLabel, usePeriod } from "@/lib/period";
import {
  type MapDatum,
  type MapView,
  useLayerFilter,
  useMapLayer,
  useMapView,
  VIEW_PHENOMENON,
} from "@/lib/map-layers";

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
  { tool: "get_distribution" },
];

// Estos dos no son tarjetas de la barra: el mapa es el lienzo y la serie temporal, la franja.
const OUT_OF_COLUMN = new Set<Activation["tool"]>(["get_places", "get_timeline"]);

export function Dashboard() {
  const [phenomenon, setPhenomenon] = usePhenomenon();
  const [level, setLevel] = useMapLevel(phenomenon);
  const [entity, setEntity] = useEntity();
  const [view, setView] = useMapView();
  const [filter, setFilter] = useLayerFilter();
  const [period] = usePeriod();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [activations, setActivations] = useState<readonly Activation[]>(DEFAULT_VIEW);
  // Lo elegido va atado al conjunto de territorios en que se eligió: cambiar de nivel, fenómeno,
  // entidad, capa o filtro cambia ese conjunto, y lo elegido deja de existir.
  const [picked, setPicked] = useState<{ readonly context: string; readonly selection: Selection } | null>(null);
  // El análisis arranca cerrado: al entrar se ve el radar entero, y la píldora dice qué hay.
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [chatChoice, setChatChoice] = useState<boolean | null>(null);
  const [sidebarChoice, setSidebarChoice] = useState<boolean | null>(null);
  const [viewport, setViewport] = useState(1440);
  // El alto de la franja temporal depende de si tiene serie que dibujar, así que se mide en vez de
  // calcularse: la barra y el mapa le dejan justo el hueco que ocupa.
  const strip = useRef<HTMLDivElement>(null);
  const [timelineSpace, setTimelineSpace] = useState(52);

  // La vista decide qué mide el mapa; la entidad seleccionada en cualquier componente lo reduce a
  // los documentos que la nombran.
  const context = [level, phenomenon, entity, view, filter].join("|");
  const chosen = picked?.context === context ? picked.selection : null;
  const setSelected = (selection: Selection | null) => setPicked(selection ? { context, selection } : null);

  const layer = useMapLayer(view, { phenomenon, level, entity, filter, period });

  // Lo elegido se muestra con sus cifras de ahora, no con las del momento del clic: al mover el
  // periodo, la ficha, el puesto y el popup cambian con el mapa. Si el territorio ya no registra
  // nada con el filtro, sigue elegido y lo dice, en vez de enseñar una cifra que ya no vale.
  const current = chosen ? layer.data.find((datum) => datum.id === chosen.place.id) : undefined;
  const selected: Selection | null = chosen
    ? {
        ...chosen,
        place: current ?? {
          ...chosen.place,
          value: 0,
          headline: "Sin registros con este filtro",
          facts: [],
          split: undefined,
          tags: undefined,
        },
      }
    : null;
  // Lo que la ficha del mapa dice del periodo: cuál recorta la vista, o que esta no tiene fecha.
  const periodNote = !isActive(period)
    ? null
    : layer.periodApplies
      ? periodLabel(period)
      : `${periodLabel(period)} · no aplica, la fuente no fecha la presencia`;
  const breaks = quantileBreaks(layer.data.map((datum) => datum.value));

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


  const chatOpen = chatChoice ?? viewport >= NARROW;
  const sidebarOpen = sidebarChoice ?? viewport >= NARROW;
  const chatWidth = chatOpen ? CHAT_WIDTH : CHAT_RAIL;
  const sidebarWidth = sidebarOpen ? SIDEBAR_OPEN : SIDEBAR_RAIL;
  const columnPanels = activations.filter((activation) => !OUT_OF_COLUMN.has(activation.tool));
  const timelineEntity = activations.find((activation) => activation.tool === "get_timeline")?.filters?.entity;

  // La API devuelve los lugares ordenados por documentos, así que el índice ya es el puesto.
  /**
   * Cambiar de vista cambia el fenómeno cuando la vista solo existe en uno: las alertas y la
   * presencia armada son documentos del fenómeno 3, y verlas con el filtro en F1 mostraría cifras
   * de F3 bajo una etiqueta que dice otra cosa.
   */
  const onView = (next: MapView) => {
    setView(next);
    setFilter(null);
    setSelected(null);
    const required = VIEW_PHENOMENON[next];
    if (required && phenomenon !== required) setPhenomenon(required);
  };

  /** Y al revés: cambiar a un fenómeno que la vista no cubre la devuelve a los documentos. */
  const onPhenomenon = (next: number | null) => {
    setPhenomenon(next);
    const required = VIEW_PHENOMENON[view];
    if (required && next !== null && next !== required) {
      setView(null);
      setFilter(null);
      setSelected(null);
    }
  };

  const values = layer.data.map((datum) => datum.value);
  const rankOfPlace = (place: MapDatum | null) =>
    place && layer.data.some((datum) => datum.id === place.id) ? rankOf(place.value, values) : null;

  const onAsk = async (question: string) => {
    setPending(true);
    try {
      const result = await ask(question);
      const chosen = result.activations;
      setTurns((previous) => [...previous, { question, ...result }]);
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
        data={layer.data}
        guide={layer.guide}
        leftInset={sidebarWidth}
        level={level}
        loading={layer.loading}
        onLevel={setLevel}
        onSelect={setSelected}
        periodNote={periodNote}
        phenomenon={phenomenon}
        rankOf={rankOfPlace}
        rightInset={chatWidth}
        selected={selected}
        view={view}
      />

      <AnalysisPanel
        activations={columnPanels}
        bottomInset={timelineSpace}
        entity={entity}
        entityNote={layer.entityApplies ? undefined : "no alcanza al mapa"}
        leftInset={sidebarWidth}
        onEntity={setEntity}
        onOpenChange={setAnalysisOpen}
        open={analysisOpen}
        phenomenon={phenomenon}
        rightInset={chatWidth}
      />

      <Sidebar
        coverage={layer.coverage}
        detail={view === "grupos" ? null : (selected?.place.id ?? null)}
        filter={filter}
        level={level}
        onFilter={setFilter}
        onLevel={setLevel}
        onPhenomenon={onPhenomenon}
        onView={onView}
        options={layer.options}
        places={layer.data}
        view={view}
        onSelectPlace={(datum) =>
          setSelected(datum ? { place: datum, geometry: datum.geometry as GeoJSON.Geometry } : null)
        }
        onToggle={() => setSidebarChoice(!sidebarOpen)}
        open={sidebarOpen}
        phenomenon={phenomenon}
      />

      {/* La serie temporal, anclada abajo entre la barra y el analista: necesita anchura para leerse. */}
      <div
        className="absolute bottom-0 z-10 transition-[left,right] duration-200"
        ref={strip}
        style={{ left: sidebarWidth, right: chatWidth }}
      >
        <TimelineStrip
          entity={entity ?? (timelineEntity as string | undefined)}
          filter={filter}
          onToggle={() => setTimelineOpen((open) => !open)}
          open={timelineOpen}
          phenomenon={phenomenon}
          view={view}
        />
      </div>

      {/* El analista, anclado al borde derecho. */}
      <div
        className="absolute inset-y-0 right-0 z-20 transition-[width] duration-200"
        style={{ width: chatWidth }}
      >
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
