"use client";

import { useState } from "react";

import {
  ChoroplethLayer,
  choroplethPaint,
  FitToGeometry,
  MapResizer,
  SelectionOutline,
  type Shapes,
} from "@/components/map/layers";
import { GLASS, GradientLegend } from "@/components/map/panel";
import { GUIDE, HoverCard, type Place, PlaceCard, type PlaceFeature } from "@/components/map/place-card";
import { Map, MapControls } from "@/components/ui/map";
import type { MapLevel } from "@/lib/filters";
import { cn } from "@/lib/utils";

// El corpus habla de todo el mundo en F1 y F2, y de Colombia en F3. El centro va desplazado al
// oeste porque la barra lateral tapa el borde izquierdo: así el territorio cae en el hueco visible.
const CAMERA = {
  country: { center: [4, 22] as [number, number], zoom: 1.2 },
  department: { center: [-77.5, 4.2] as [number, number], zoom: 4.6 },
};

/** Rampa secuencial de cuatro pasos, la misma en todas las vistas del tablero. */
export const RAMP = ["#0e5f74", "#1f8fa8", "#3fc0d4", "#8ee9f5"];

// Hasta qué zoom encuadrar el territorio elegido: un departamento pide más acercamiento que un país.
const FIT_ZOOM = { country: 4, department: 6.5 };

export type Selection = { readonly place: Place; readonly geometry: GeoJSON.Geometry };

type Hovered = { readonly place: Place; readonly x: number; readonly y: number };

/**
 * El mapa es el lienzo del radar: ocupa la pantalla y los paneles se apoyan en sus bordes en vez de
 * taparlo. Es un coroplético porque la tarea que resuelve es comparar intensidades entre territorios.
 *
 * Tres gestos, de menos a más compromiso: el cursor enseña la cifra, el clic fija el territorio —lo
 * encuadra, lo contornea y abre su ficha— y el enlace del fragmento lleva al texto que lo sustenta.
 */
export function MapBackdrop({
  features,
  breaks,
  level,
  onLevel,
  selected,
  onSelect,
  rankOf,
  leftInset,
  rightInset,
  bottomInset,
}: {
  readonly features: readonly PlaceFeature[];
  readonly breaks: readonly number[];
  readonly level: MapLevel;
  readonly onLevel: (level: MapLevel) => void;
  readonly selected: Selection | null;
  readonly onSelect: (selection: Selection | null) => void;
  readonly rankOf: (place: Place | null) => number | null;
  /** Lo que ocupan la barra lateral, el analista y la franja temporal: el hueco visible del mapa. */
  readonly leftInset: number;
  readonly rightInset: number;
  readonly bottomInset: number;
}) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const shapes =
    features.length > 0 ? ({ type: "FeatureCollection", features } as unknown as Shapes<Place>) : null;
  const camera = level === "department" ? CAMERA.department : CAMERA.country;

  return (
    <div className="absolute inset-0" onMouseLeave={() => setHovered(null)}>
      <Map center={camera.center} className="h-full w-full" key={level} theme="dark" zoom={camera.zoom}>
        <MapResizer />
        <MapControls className="!right-(--map-right)" position="top-right" />
        {shapes && breaks.length > 0 ? (
          <ChoroplethLayer<Place>
            data={shapes}
            fillHoverPaint={{ "fill-opacity": 0.95 }}
            fillPaint={choroplethPaint("documents", [...breaks], RAMP)}
            interactive
            linePaint={{ "line-color": "#0b0b0b", "line-width": 0.5, "line-opacity": 0.7 }}
            onClick={(event) => {
              onSelect({
                place: event.feature.properties,
                geometry: event.feature.geometry as unknown as GeoJSON.Geometry,
              });
              setCollapsed(false);
            }}
            onHover={(event) =>
              setHovered(
                event
                  ? {
                      place: event.feature.properties,
                      x: event.originalEvent.point.x,
                      y: event.originalEvent.point.y,
                    }
                  : null,
              )
            }
            promoteId="place_id"
          />
        ) : null}
        {selected ? (
          <>
            <SelectionOutline color={RAMP[3]} geometry={selected.geometry} />
            <FitToGeometry
              geometry={selected.geometry}
              maxZoom={FIT_ZOOM[level]}
              // Los paneles tapan los bordes: el territorio se encuadra en el hueco que queda libre.
              padding={{ top: 48, right: rightInset + 48, bottom: bottomInset + 48, left: leftInset + 48 }}
            />
          </>
        ) : null}
      </Map>

      {/* El hueco visible entre paneles: aquí, y solo aquí, flota algo sobre el mapa. */}
      <div
        className="pointer-events-none absolute top-0 z-10 *:pointer-events-auto"
        style={{ left: leftInset, right: rightInset, bottom: bottomInset }}
      >
        {hovered ? (
          <HoverCard
            place={hovered.place}
            rank={rankOf(hovered.place)}
            total={features.length}
            x={hovered.x - leftInset}
            y={hovered.y}
          />
        ) : null}

        {/* Arriba a la izquierda del hueco: la ficha explica lo que se ve sin tapar el mapa. */}
        <div className="absolute top-3 left-3 w-80 space-y-2">
          <div aria-label="Nivel territorial" className="flex gap-1" role="group">
            {(["country", "department"] as const).map((option) => (
              <button
                aria-pressed={level === option}
                className={cn(
                  GLASS,
                  "border-border/60 aria-pressed:border-primary aria-pressed:text-primary rounded-md border px-2 py-1 text-[11px]",
                )}
                key={option}
                onClick={() => onLevel(option)}
                type="button"
              >
                {option === "country" ? "Países" : "Departamentos"}
              </button>
            ))}
          </div>
          <PlaceCard
            collapsed={collapsed}
            color={RAMP[2]}
            guide={GUIDE[level]}
            legend={breaks.length > 0 ? <GradientLegend breaks={[...breaks]} ramp={RAMP} /> : null}
            onClose={() => onSelect(null)}
            onToggle={() => setCollapsed((open) => !open)}
            place={selected?.place ?? null}
            rank={rankOf(selected?.place ?? null)}
            total={features.length}
          />
        </div>

        <p className="text-muted-foreground absolute right-3 bottom-1 text-[9px]">
          Teselas de OpenFreeMap · datos de OpenStreetMap
        </p>
      </div>
    </div>
  );
}
