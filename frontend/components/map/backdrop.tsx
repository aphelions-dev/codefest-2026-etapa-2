"use client";

import { useEffect, useRef, useState } from "react";

import {
  ChoroplethLayer,
  choroplethPaint,
  FitToGeometry,
  FitToPanels,
  MapResizer,
  SelectionOutline,
  type Shapes,
} from "@/components/map/layers";
import { GradientLegend } from "@/components/map/panel";
import { HoverCard, PlaceCard } from "@/components/map/place-card";
import { Map, MapControls, type MapViewport } from "@/components/ui/map";
import { type MapLevel, phenomenonRamp } from "@/lib/filters";
import type { MapDatum, MapGuide, MapView } from "@/lib/map-layers";

// El corpus habla de todo el mundo en F1 y F2, y de Colombia en F3. El centro va desplazado al
// oeste porque la barra lateral tapa el borde izquierdo: así el territorio cae en el hueco visible.
const CAMERA = {
  country: { center: [4, 22] as [number, number], zoom: 1.2 },
  department: { center: [-77.5, 4.2] as [number, number], zoom: 4.6 },
  // La presencia armada cubre la cuenca entera, de Colombia a Bolivia: encuadrar solo Colombia
  // dejaba fuera la mayor parte del dato.
  amazon: { center: [-66, -6] as [number, number], zoom: 3.3 },
};

// El nivel de agregación sigue al zoom (B.4.2): acercándose a Colombia pasa a departamentos y
// alejándose vuelve a países. Los dos umbrales no coinciden a propósito: con uno solo, un zoom justo
// en el borde alternaría entre niveles en cada movimiento.
const TO_DEPARTMENTS = 4.8;
const TO_COUNTRIES = 3.6;
const COLOMBIA = { west: -80, east: -66, south: -5, north: 13.5 };

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
  level,
  selected,
  onSelect,
  rankOf,
  leftInset,
  rightInset,
  bottomInset,
  periodNote,
  loading,
  onLevel,
}: {
  readonly data: readonly MapDatum[];
  readonly guide: MapGuide;
  readonly breaks: readonly number[];
  /** El fenómeno filtrado decide la rampa: el mismo color aquí, en las barras y en la leyenda. */
  readonly phenomenon: number | null;
  readonly view: MapView;
  readonly level: MapLevel;
  readonly selected: Selection | null;
  readonly onSelect: (selection: Selection | null) => void;
  readonly rankOf: (place: MapDatum | null) => number | null;
  /** Lo que ocupan la barra lateral, el analista y la franja temporal: el hueco visible del mapa. */
  readonly leftInset: number;
  readonly rightInset: number;
  readonly bottomInset: number;
  readonly periodNote: string | null;
  /** Si la vista está pidiendo sus datos: sin datos aún, barrido; con datos, una barra fina. */
  readonly loading: boolean;
  /** Cambia el nivel cuando el zoom cruza su umbral; solo en la capa de documentos. */
  readonly onLevel: (level: MapLevel) => void;
}) {
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // La cámara con que se cruzó el umbral: el mapa del nuevo nivel arranca donde estaba el anterior,
  // en vez de saltar al encuadre por defecto.
  const [carry, setCarry] = useState<{ readonly level: MapLevel; readonly camera: MapViewport } | null>(null);
  const switching = useRef(false);
  // El mapa del nuevo nivel ya está montado: se vuelve a escuchar el zoom.
  useEffect(() => {
    switching.current = false;
  }, [level, view]);
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
  const camera = world ? CAMERA.country : view === "grupos" ? CAMERA.amazon : CAMERA.department;
  // La presencia va de 1 a unos pocos grupos: los cortes son los propios valores, no cuantiles de
  // una distribución larga como la de los documentos.
  const steps = view === "grupos" ? [1, 2, 3, 4] : [...breaks];
  const zoom = world ? FIT_ZOOM.country : FIT_ZOOM.department;
  const start = carry?.level === level ? carry.camera : null;

  const onViewport = (viewport: MapViewport) => {
    if (view !== "documentos" || switching.current) return;
    const [lon, lat] = viewport.center;
    const overColombia = lon > COLOMBIA.west && lon < COLOMBIA.east && lat > COLOMBIA.south && lat < COLOMBIA.north;
    const next =
      level === "country" && viewport.zoom >= TO_DEPARTMENTS && overColombia
        ? "department"
        : level === "department" && viewport.zoom < TO_COUNTRIES
          ? "country"
          : null;
    if (!next) return;
    switching.current = true;
    setCarry({ level: next, camera: viewport });
    onLevel(next);
  };

  return (
    <div className="absolute inset-0" onMouseLeave={() => setHovered(null)}>
      <Map
        center={start?.center ?? camera.center}
        className="h-full w-full"
        key={`${view}-${level}`}
        loading={loading && data.length === 0}
        onViewportChange={onViewport}
        theme="dark"
        zoom={start?.zoom ?? camera.zoom}
      >
        <MapResizer />
        {/* La cámara vive en el hueco entre paneles, no en el centro del lienzo. */}
        <FitToPanels bottom={bottomInset} left={leftInset} right={rightInset} top={12} />
        <MapControls className="!right-(--map-right)" position="top-right" />
        {shapes && steps.length > 0 ? (
          <ChoroplethLayer<MapDatum>
            data={shapes}
            fillHoverPaint={{ "fill-opacity": 0.95 }}
            fillPaint={choroplethPaint("value", steps, [...ramp])}
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
              // Un respiro alrededor del territorio; el hueco entre paneles ya lo pone `FitToPanels`
              // como padding de la cámara, así que aquí no hay que volver a descontarlo.
              padding={48}
            />
          </>
        ) : null}
      </Map>

      {/* El hueco visible entre paneles: aquí, y solo aquí, flota algo sobre el mapa. */}
      <div
        className="pointer-events-none absolute top-0 z-10 *:pointer-events-auto"
        style={{ left: leftInset, right: rightInset, bottom: bottomInset }}
      >
        {/* Recalculando con datos ya pintados: una barra que avisa sin tapar el mapa. */}
        {loading && data.length > 0 ? (
          <div className="bg-primary/15 absolute inset-x-0 top-0 h-0.5 overflow-hidden" role="status">
            <div className="bg-primary animate-[radar-progress_1.1s_ease-in-out_infinite] h-full w-1/3" />
            <span className="sr-only">Actualizando el mapa</span>
          </div>
        ) : null}

        {hovered ? (
          <HoverCard
            place={hovered.place}
            rank={rankOf(hovered.place)}
            total={data.length}
            x={hovered.x - leftInset}
            y={hovered.y}
          />
        ) : null}

        {/* La ficha se ancla al borde del hueco, no al del lienzo: al plegar la barra se
            desplaza con él en vez de quedarse debajo del panel. */}
        <div className="absolute top-3 left-3 w-72 max-w-[calc(100%-1.5rem)] space-y-2">
          <PlaceCard
            collapsed={collapsed}
            color={ramp[2]}
            guide={guide}
            legend={steps.length > 0 ? <GradientLegend breaks={steps} ramp={[...ramp]} /> : null}
            onClose={() => onSelect(null)}
            onToggle={() => setCollapsed((open) => !open)}
            periodNote={periodNote}
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
