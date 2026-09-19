"use client";

import { useState } from "react";

import { Panel, PanelState } from "@/components/charts/panel";
import { ChoroplethLayer, choroplethPaint, MapResizer, quantileBreaks, type Shapes } from "@/components/map/layers";
import { Map as BaseMap, MapControls } from "@/components/ui/map";
import type { Places } from "@/lib/api";
import { useApi } from "@/lib/use-api";

// Encuadres por nivel: el corpus habla de todo el mundo en F1 y F2, y de Colombia en F3.
const CAMERA = {
  country: { center: [10, 22] as [number, number], zoom: 1.1 },
  department: { center: [-73.5, 4.2] as [number, number], zoom: 4.2 },
};

// Rampa secuencial de cuatro pasos, la misma en todas las vistas del tablero.
const RAMP = ["#1f6f8b", "#2b9ab0", "#5ec8d8", "#a9e8f0"];

type Properties = { place_id: string; name: string; documents: number; mentions: number };

/**
 * Mapa coroplético: colorea cada territorio por el número de documentos que lo nombran. Es el
 * gráfico apropiado porque la tarea es comparar intensidades entre territorios, no ubicar eventos
 * sueltos.
 */
export function Map({ level, phenomenon }: { readonly level: string; readonly phenomenon: number | null }) {
  const { data, error, loading } = useApi<Places>("/places", {
    level,
    phenomenon: phenomenon ?? undefined,
    limit: level === "department" ? 40 : 90,
  });
  const [hovered, setHovered] = useState<Properties | null>(null);

  const shapes = data
    ? ({ type: "FeatureCollection", features: data.features } as unknown as Shapes<Properties>)
    : null;
  const breaks = data ? quantileBreaks(data.features.map((feature) => feature.properties.documents)) : [];
  const camera = level === "department" ? CAMERA.department : CAMERA.country;
  const top = data?.features
    .slice(0, 3)
    .map((feature) => feature.properties.name)
    .join(", ");

  return (
    <Panel
      source={
        data
          ? `${data.features.length} territorios nombrados. Más citados: ${top}. Teselas de OpenFreeMap, datos de OpenStreetMap.`
          : "Teselas de OpenFreeMap, datos de OpenStreetMap."
      }
      title={level === "department" ? "Departamentos nombrados" : "Países nombrados"}
      unit="Color: documentos del corpus que nombran el territorio. Sin color, la mitad menos citada."
      wide
    >
      <div className="relative h-80 overflow-hidden rounded-lg">
        <BaseMap center={camera.center} className="h-full w-full" key={level} theme="dark" zoom={camera.zoom}>
          <MapResizer />
          <MapControls position="top-right" />
          {shapes && breaks.length > 0 ? (
            <ChoroplethLayer<Properties>
              data={shapes}
              fillHoverPaint={{ "fill-opacity": 0.95 }}
              fillPaint={choroplethPaint("documents", breaks, RAMP)}
              interactive
              linePaint={{ "line-color": "#0b0b0b", "line-width": 0.5, "line-opacity": 0.7 }}
              onHover={(event) => setHovered(event ? event.feature.properties : null)}
              promoteId="place_id"
            />
          ) : null}
        </BaseMap>

        {hovered ? (
          <p className="bg-surface/95 border-border pointer-events-none absolute bottom-2 left-2 z-10 rounded-md border px-2 py-1 text-[11px]">
            <strong>{hovered.name}</strong> · {hovered.documents} documentos · {hovered.mentions} menciones
          </p>
        ) : null}

        {!data ? (
          <div className="bg-surface/85 absolute inset-0 z-10">
            <PanelState empty="Sin territorios para este filtro" error={error} loading={loading} />
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
