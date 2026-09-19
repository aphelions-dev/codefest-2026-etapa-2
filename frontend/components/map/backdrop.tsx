"use client";

import { useState } from "react";

import { ChoroplethLayer, choroplethPaint, MapResizer, quantileBreaks, type Shapes } from "@/components/map/layers";
import { GLASS, GradientLegend } from "@/components/map/panel";
import { Map, MapControls } from "@/components/ui/map";
import type { Places } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useMapLevel } from "@/lib/filters";
import { cn } from "@/lib/utils";

// El corpus habla de todo el mundo en F1 y F2, y de Colombia en F3.
const CAMERA = {
  country: { center: [10, 22] as [number, number], zoom: 1.2 },
  department: { center: [-73.5, 4.2] as [number, number], zoom: 4.4 },
};

// Rampa secuencial de cuatro pasos, la misma en todas las vistas del tablero.
const RAMP = ["#0e5f74", "#1f8fa8", "#3fc0d4", "#8ee9f5"];

type Properties = { place_id: string; name: string; documents: number; mentions: number };

/**
 * El mapa es el lienzo del radar: ocupa la pantalla y el resto de los componentes flotan encima.
 * Es un coroplético porque la tarea que resuelve es comparar intensidades entre territorios.
 */
export function MapBackdrop({
  phenomenon,
  rightInset,
  timelineSpace,
}: {
  readonly phenomenon: number | null;
  readonly rightInset: number;
  /** Alto que ocupa la franja temporal: la leyenda se apoya justo encima. */
  readonly timelineSpace: number;
}) {
  const [level, setLevel] = useMapLevel(phenomenon);
  const { data } = useApi<Places>("/places", {
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

  return (
    <div className="absolute inset-0" onMouseLeave={() => setHovered(null)}>
      <Map center={camera.center} className="h-full w-full" key={level} theme="dark" zoom={camera.zoom}>
        <MapResizer />
        <MapControls className="!right-(--map-right)" position="top-right" />
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
      </Map>

      {/* Conmutador de nivel y leyenda: el zoom cambia la agregación territorial, como pide el anexo. */}
      <div
        className={cn(GLASS, "border-border/60 absolute z-10 space-y-2 rounded-xl border p-3")}
        style={{ maxWidth: 236, right: rightInset + 12, bottom: timelineSpace }}
      >
        <div className="flex gap-1" role="group" aria-label="Nivel territorial">
          {(["country", "department"] as const).map((option) => (
            <button
              aria-pressed={level === option}
              className="border-border/60 aria-pressed:border-primary aria-pressed:text-primary rounded-md border px-2 py-1 text-[11px]"
              key={option}
              onClick={() => setLevel(option)}
              type="button"
            >
              {option === "country" ? "Países" : "Departamentos"}
            </button>
          ))}
        </div>
        {breaks.length > 0 ? <GradientLegend breaks={breaks} ramp={RAMP} /> : null}
        <p className="text-muted-foreground text-[10px] leading-snug">
          {hovered ? (
            <>
              <strong className="text-foreground">{hovered.name}</strong> · {hovered.documents} documentos ·{" "}
              {hovered.mentions} menciones
            </>
          ) : (
            "Documentos del corpus que nombran el territorio. Sin color, la mitad menos citada."
          )}
        </p>
      </div>

      <p
        className="text-muted-foreground absolute left-1/2 z-10 -translate-x-1/2 text-[9px]"
        style={{ bottom: timelineSpace - 16 }}
      >
        Teselas de OpenFreeMap · datos de OpenStreetMap
      </p>
    </div>
  );
}
