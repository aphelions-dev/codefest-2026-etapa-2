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
import { HoverCard, PlaceCard } from "@/components/map/place-card";
import { Map, MapControls } from "@/components/ui/map";
import { type MapLevel, phenomenonRamp } from "@/lib/filters";
import { type MapDatum, type MapGuide, type MapView, VIEW_LABEL } from "@/lib/map-layers";
import { cn } from "@/lib/utils";

// El corpus habla de todo el mundo en F1 y F2, y de Colombia en F3. El centro va desplazado al
// oeste porque la barra lateral tapa el borde izquierdo: así el territorio cae en el hueco visible.
const CAMERA = {
  country: { center: [4, 22] as [number, number], zoom: 1.2 },
  department: { center: [-77.5, 4.2] as [number, number], zoom: 4.6 },
};

// Hasta qué zoom encuadrar el territorio elegido: un departamento pide más acercamiento que un país.
const FIT_ZOOM = { country: 4, department: 6.5 };

export type Selection = { readonly place: MapDatum; readonly geometry: GeoJSON.Geometry };

type Hovered = { readonly place: MapDatum; readonly x: number; readonly y: number };

/**
 * El mapa es el lienzo del radar: ocupa la pantalla y los paneles se apoyan en sus bordes en vez de
 * taparlo. Es un coroplético porque la tarea que resuelve es comparar intensidades entre territorios.
 *
 * No sabe qué está pintando. Recibe territorios ya normalizados —un polígono, una cifra y una
 * traza—, así que añadir una vista es añadir una consulta y no un caso más aquí dentro.
 *
 * Tres gestos, de menos a más compromiso: el cursor enseña la cifra, el clic fija el territorio —lo
 * encuadra, lo contornea y abre su ficha— y el enlace del fragmento lleva al texto que lo sustenta.
 */
export function MapBackdrop({
  data,
  guide,
  breaks,
  phenomenon,
  view,
  onView,
  level,
  onLevel,
  filter,
  onFilter,
  options,
  selected,
  onSelect,
  rankOf,
  leftInset,
  rightInset,
  bottomInset,
}: {
  readonly data: readonly MapDatum[];
  readonly guide: MapGuide;
  readonly breaks: readonly number[];
  /** El fenómeno filtrado decide la rampa: el mismo color aquí, en las barras y en la leyenda. */
  readonly phenomenon: number | null;
  readonly view: MapView;
  readonly onView: (view: MapView) => void;
  readonly level: MapLevel;
  readonly onLevel: (level: MapLevel) => void;
  /** Filtro propio de la vista: la clase de alerta o el grupo armado. */
  readonly filter: string | null;
  readonly onFilter: (value: string | null) => void;
  readonly options: readonly { readonly value: string; readonly label: string; readonly count: number }[];
  readonly selected: Selection | null;
  readonly onSelect: (selection: Selection | null) => void;
  readonly rankOf: (place: MapDatum | null) => number | null;
  /** Lo que ocupan la barra lateral, el analista y la franja temporal: el hueco visible del mapa. */
  readonly leftInset: number;
  readonly rightInset: number;
  readonly bottomInset: number;
}) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const ramp = phenomenonRamp(phenomenon);

  // MapLibre necesita las propiedades dentro del Feature; el resto del tablero, el dato plano.
  const shapes =
    data.length > 0
      ? ({
          type: "FeatureCollection",
          features: data.map((datum) => ({
            type: "Feature",
            id: datum.id,
            geometry: datum.geometry,
            properties: datum,
          })),
        } as unknown as Shapes<MapDatum>)
      : null;
  // Los países solo tienen sentido en la vista de documentos: las otras dos son de Colombia.
  const world = view === "documentos" && level === "country";
  const camera = world ? CAMERA.country : CAMERA.department;
  const zoom = world ? FIT_ZOOM.country : FIT_ZOOM.department;

  return (
    <div className="absolute inset-0" onMouseLeave={() => setHovered(null)}>
      <Map
        center={camera.center}
        className="h-full w-full"
        key={`${view}-${level}`}
        theme="dark"
        zoom={camera.zoom}
      >
        <MapResizer />
        <MapControls className="!right-(--map-right)" position="top-right" />
        {shapes && breaks.length > 0 ? (
          <ChoroplethLayer<MapDatum>
            data={shapes}
            fillHoverPaint={{ "fill-opacity": 0.95 }}
            fillPaint={choroplethPaint("value", [...breaks], [...ramp])}
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
            promoteId="id"
          />
        ) : null}
        {selected ? (
          <>
            <SelectionOutline color={ramp[3]} geometry={selected.geometry} />
            <FitToGeometry
              geometry={selected.geometry}
              maxZoom={zoom}
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
            total={data.length}
            x={hovered.x - leftInset}
            y={hovered.y}
          />
        ) : null}

        <div className="absolute top-3 left-3 w-80 space-y-2">
          {/* Qué mide el mapa. Cada vista consulta su propia fuente y mide otra cosa, así que es
              una elección de pregunta y no una capa que se superpone a la anterior. */}
          <div aria-label="Vista del mapa" className="flex flex-wrap gap-1" role="group">
            {(Object.keys(VIEW_LABEL) as MapView[]).map((option) => (
              <button
                aria-pressed={view === option}
                className={cn(
                  GLASS,
                  "border-border/60 aria-pressed:border-primary aria-pressed:text-primary rounded-md border px-2 py-1 text-[11px]",
                )}
                key={option}
                onClick={() => {
                  onView(option);
                  onFilter(null);
                  onSelect(null);
                }}
                type="button"
              >
                {VIEW_LABEL[option]}
              </button>
            ))}
          </div>

          {/* El nivel solo aplica a los documentos: alertas y grupos son de Colombia. */}
          {view === "documentos" ? (
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
          ) : null}

          {/* Filtro propio de la vista: clase de riesgo o grupo armado. */}
          {options.length > 0 ? (
            <div aria-label="Filtrar la capa" className="flex flex-wrap gap-1" role="group">
              <button
                aria-pressed={filter === null}
                className={cn(
                  GLASS,
                  "border-border/60 aria-pressed:border-primary aria-pressed:text-primary rounded-md border px-2 py-0.5 text-[10px]",
                )}
                onClick={() => onFilter(null)}
                type="button"
              >
                Todos
              </button>
              {options.slice(0, 6).map((option) => (
                <button
                  aria-pressed={filter === option.value}
                  className={cn(
                    GLASS,
                    "border-border/60 aria-pressed:border-primary aria-pressed:text-primary rounded-md border px-2 py-0.5 text-[10px]",
                  )}
                  key={option.value}
                  onClick={() => onFilter(filter === option.value ? null : option.value)}
                  title={`${option.label}: ${option.count}`}
                  type="button"
                >
                  {option.label}
                  <span className="opacity-60"> {option.count}</span>
                </button>
              ))}
            </div>
          ) : null}

          <PlaceCard
            collapsed={collapsed}
            color={ramp[2]}
            guide={guide}
            legend={breaks.length > 0 ? <GradientLegend breaks={[...breaks]} ramp={[...ramp]} /> : null}
            onClose={() => onSelect(null)}
            onToggle={() => setCollapsed((open) => !open)}
            place={selected?.place ?? null}
            rank={rankOf(selected?.place ?? null)}
            total={data.length}
          />
        </div>

        <p className="text-muted-foreground absolute right-3 bottom-1 text-[9px]">
          Teselas de OpenFreeMap · datos de OpenStreetMap
        </p>
      </div>
    </div>
  );
}
