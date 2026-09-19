"use client";

import {
  CalendarRangeIcon,
  ChartBarIcon,
  ChartColumnIcon,
  ChartScatterIcon,
  FileSearchIcon,
  Grid3x3Icon,
  type LucideIcon,
  MapIcon,
  NetworkIcon,
  SearchIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Bars } from "@/components/charts/bars";
import { Evidence } from "@/components/charts/evidence";
import { Graph } from "@/components/charts/graph";
import { Heatmap } from "@/components/charts/heatmap";
import { Histogram } from "@/components/charts/histogram";
import { Quadrant } from "@/components/charts/quadrant";

/**
 * Registro de componentes. El componente se deduce del **nombre de la herramienta** que el agente
 * invocó, que ya viaja obligatoriamente en `tools_called` dentro de su respuesta: así activar una
 * visualización no cuesta un solo token adicional, y añadir una es añadir una herramienta y su
 * entrada aquí.
 *
 * Los parámetros de la herramienta son los filtros. Los datos los resuelve el endpoint de
 * agregación, no el modelo: el agente decide qué mirar, no qué dice el dato.
 */
export type ToolName =
  | "get_metadata_breakdown"
  | "get_distribution"
  | "get_entity_matrix"
  | "get_cooccurrence"
  | "get_quadrant"
  | "get_places"
  | "get_timeline"
  | "get_document"
  | "search_corpus";

/** Lo que el agente envía al activar un componente. */
export type Activation = {
  readonly tool: ToolName;
  readonly filters?: Record<string, string | number | undefined>;
};

type Context = {
  readonly phenomenon: number | null;
  /** Entidad seleccionada en otra vista: resalta lo suyo y atenúa el resto. */
  readonly entity: string | null;
  readonly onEntity: (entityId: string | null) => void;
};

/**
 * Qué tarea analítica resuelve cada herramienta y con qué icono se reconoce, para el panel, la traza
 * del agente y la documentación: el icono dice la forma del gráfico, no la herramienta.
 */
export const TOOLS: Record<ToolName, { readonly label: string; readonly task: string; readonly icon: LucideIcon }> = {
  get_metadata_breakdown: { label: "Barras", task: "comparación y composición", icon: ChartBarIcon },
  get_distribution: { label: "Histograma", task: "distribución", icon: ChartColumnIcon },
  get_entity_matrix: { label: "Matriz de calor", task: "comparación cruzada de dos categorías", icon: Grid3x3Icon },
  get_cooccurrence: { label: "Red de entidades", task: "relaciones", icon: NetworkIcon },
  get_quadrant: { label: "Cuadrante", task: "priorización por dos criterios", icon: ChartScatterIcon },
  get_places: { label: "Mapa", task: "distribución espacial", icon: MapIcon },
  get_timeline: { label: "Línea de tiempo", task: "tendencia", icon: CalendarRangeIcon },
  get_document: { label: "Evidencia", task: "verificación de la fuente", icon: FileSearchIcon },
  search_corpus: { label: "Evidencia", task: "verificación de la fuente", icon: SearchIcon },
};

export function render(activation: Activation, context: Context): ReactNode {
  const { tool, filters = {} } = activation;
  const phenomenon = (filters.phenomenon as number | undefined) ?? context.phenomenon;
  const { entity, onEntity } = context;

  switch (tool) {
    case "get_metadata_breakdown":
      return <Bars by={String(filters.by ?? "observatory")} phenomenon={phenomenon} />;
    case "get_distribution":
      return <Histogram measure={filters.measure as string | undefined} phenomenon={phenomenon} />;
    case "get_entity_matrix":
      return (
        <Heatmap
          cols={String(filters.cols ?? "observatory")}
          entity={entity}
          onEntity={onEntity}
          phenomenon={phenomenon}
        />
      );
    case "get_cooccurrence":
      return <Graph entity={entity} onEntity={onEntity} phenomenon={phenomenon} />;
    case "get_quadrant":
      return <Quadrant entity={entity} onEntity={onEntity} phenomenon={phenomenon} />;
    case "get_places":
      // El mapa es el lienzo, no un panel: activarlo mueve el radar de fondo, no abre una tarjeta.
      return null;
    case "get_timeline":
      // La serie temporal es la franja inferior, no una tarjeta: necesita anchura para leerse.
      return null;
    case "get_document":
    case "search_corpus":
      return (
        <Evidence
          chunkId={(filters.chunk_id as string | undefined) ?? null}
          docId={(filters.doc_id as string | undefined) ?? null}
        />
      );
  }
}
