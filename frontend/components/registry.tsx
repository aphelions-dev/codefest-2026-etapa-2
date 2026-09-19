"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { Bars } from "@/components/charts/bars";
import { Evidence } from "@/components/charts/evidence";
import { Graph } from "@/components/charts/graph";
import { Heatmap } from "@/components/charts/heatmap";
import { Timeline } from "@/components/charts/timeline";

// MapLibre necesita `window`, asi que el mapa se carga solo en el cliente: si entra en el
// prerenderizado, el build falla sin decir donde.
const Map = dynamic(() => import("@/components/charts/map").then((module) => module.Map), {
  ssr: false,
});

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
  | "get_entity_matrix"
  | "get_cooccurrence"
  | "get_places"
  | "get_timeline"
  | "get_document"
  | "search_corpus";

/** Lo que el agente envía al activar un componente. */
export type Activation = {
  readonly tool: ToolName;
  readonly filters?: Record<string, string | number | undefined>;
};

type Context = { readonly phenomenon: number | null };

/** Qué tarea analítica resuelve cada herramienta, para el pie del panel y la documentación. */
export const TOOLS: Record<ToolName, { readonly label: string; readonly task: string }> = {
  get_metadata_breakdown: { label: "Barras", task: "comparación y composición" },
  get_entity_matrix: { label: "Matriz de calor", task: "comparación cruzada de dos categorías" },
  get_cooccurrence: { label: "Red de entidades", task: "relaciones" },
  get_places: { label: "Mapa", task: "distribución espacial" },
  get_timeline: { label: "Línea de tiempo", task: "tendencia" },
  get_document: { label: "Evidencia", task: "verificación de la fuente" },
  search_corpus: { label: "Evidencia", task: "verificación de la fuente" },
};

export function render(activation: Activation, context: Context): ReactNode {
  const { tool, filters = {} } = activation;
  const phenomenon = (filters.phenomenon as number | undefined) ?? context.phenomenon;

  switch (tool) {
    case "get_metadata_breakdown":
      return <Bars by={String(filters.by ?? "observatory")} phenomenon={phenomenon} />;
    case "get_entity_matrix":
      return <Heatmap cols={String(filters.cols ?? "observatory")} phenomenon={phenomenon} />;
    case "get_cooccurrence":
      return <Graph phenomenon={phenomenon} />;
    case "get_places":
      return <Map level={String(filters.level ?? (phenomenon === 3 ? "department" : "country"))} phenomenon={phenomenon} />;
    case "get_timeline":
      return <Timeline entity={filters.entity as string | undefined} phenomenon={phenomenon} />;
    case "get_document":
    case "search_corpus":
      return <Evidence docId={(filters.doc_id as string | undefined) ?? null} />;
  }
}
