"use client";

import type { ExpressionSpecification } from "maplibre-gl";
import { useEffect, useState } from "react";

import { MapGeoJSON, useMap } from "@/components/ui/map";

/** La API describe la geometria como un objeto libre; MapLibre la necesita como GeoJSON. */
export type Shapes<P> = GeoJSON.FeatureCollection<GeoJSON.Geometry, P>;

/**
 * Cortes por cuantiles: desde el minimo, p50, p80 y p95. Con una escala continua Estados Unidos
 * aplana el resto; con cuantiles lo que concentra resalta. Todo territorio con al menos un documento
 * lleva color: dejar sin relleno la mitad menos citada la hacia indistinguible de la que ningun
 * documento nombra, y eso es afirmar una ausencia que no existe.
 */
export function quantileBreaks(values: number[]): number[] {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const quantile = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const cuts: number[] = [];
  for (const q of [0, 0.5, 0.8, 0.95]) cuts.push(Math.max(quantile(q), (cuts.at(-1) ?? 0) + 1));
  return cuts;
}

/** Relleno escalonado por los cortes, con la rampa secuencial del tablero. */
export function choroplethPaint(property: string, breaks: number[], ramp: string[]) {
  const color = ["step", ["get", property], "#000000", ...breaks.flatMap((cut, index) => [cut, ramp[index]])];
  const opacity = ["step", ["get", property], 0, breaks[0] ?? 1, 0.6, breaks[2] ?? 2, 0.78];
  return {
    "fill-color": color as ExpressionSpecification,
    "fill-opacity": opacity as ExpressionSpecification,
  };
}

/**
 * El coropletico va debajo de las fronteras y los nombres del mapa base: dibujado encima, el color
 * tapa las etiquetas de paises y ciudades.
 */
export function ChoroplethLayer<P extends GeoJSON.GeoJsonProperties>(
  props: Omit<Parameters<typeof MapGeoJSON<P>>[0], "beforeId">,
) {
  const { map, isLoaded } = useMap();
  const [beforeId, setBeforeId] = useState<string | undefined>();

  useEffect(() => {
    if (!map || !isLoaded) return;
    const overlay = map
      .getStyle()
      .layers.find((layer) => layer.type === "symbol" || layer.id.startsWith("boundary"));
    setBeforeId(overlay?.id);
  }, [map, isLoaded]);

  return <MapGeoJSON {...props} beforeId={beforeId} />;
}

/**
 * El mapa cambia de tamano cuando el panel se acomoda, no solo con la ventana. Sin esto el lienzo
 * se queda con el tamano que tenia al crearse y MapLibre no pide ni una tesela, sin dar ningun error.
 */
export function MapResizer() {
  const { map } = useMap();
  useEffect(() => {
    if (!map) return;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** Contorno del lugar abierto, por encima del coroplético: se ve qué está seleccionado. */
export function SelectionOutline({ geometry, color }: { readonly geometry: GeoJSON.Geometry; readonly color: string }) {
  return (
    <MapGeoJSON
      data={{ type: "Feature", geometry, properties: {} }}
      fillPaint={false}
      linePaint={{ "line-color": color, "line-width": 2.5 }}
    />
  );
}

function bounds(geometry: GeoJSON.Geometry): [[number, number], [number, number]] | null {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (coordinates: unknown): void => {
    if (typeof (coordinates as unknown[])[0] === "number") {
      const [lon, lat] = coordinates as [number, number];
      west = Math.min(west, lon);
      south = Math.min(south, lat);
      east = Math.max(east, lon);
      north = Math.max(north, lat);
      return;
    }
    for (const part of coordinates as unknown[]) walk(part);
  };
  if (geometry.type === "GeometryCollection") {
    geometry.geometries.forEach((part) => walk("coordinates" in part ? part.coordinates : []));
  } else {
    walk(geometry.coordinates);
  }
  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}

/** Encuadra el lugar abierto al elegirlo, desde el mapa, la lista o un enlace compartido. */
export function FitToGeometry({
  geometry,
  maxZoom,
  padding,
}: {
  readonly geometry: GeoJSON.Geometry;
  readonly maxZoom: number;
  /** Respiro alrededor del territorio; el hueco entre paneles lo pone `FitToPanels`. */
  readonly padding: number;
}) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    const box = bounds(geometry);
    // Los paneles translúcidos tapan los bordes del mapa: se encuadra en el hueco visible.
    if (box) map.fitBounds(box, { padding, maxZoom, duration: 700 });
    // El relleno cambia al plegar paneles; eso no debe volver a mover la cámara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isLoaded, geometry, maxZoom]);
  return null;
}

/**
 * Mantiene la cámara dentro del hueco que dejan los paneles.
 *
 * El lienzo ocupa la pantalla entera y los paneles se apoyan encima, así que su tamaño nunca
 * cambia y `map.resize()` no se entera de nada: plegar la barra dejaba el centro del mapa detrás
 * de un panel. El `padding` de MapLibre desplaza el centro **efectivo** sin tocar el lienzo, y
 * todas las operaciones de cámara —`fitBounds`, `easeTo`, el zoom de los controles— lo respetan.
 *
 * Se anima con la misma duración que el plegado del panel, para que el mapa acompañe al panel en
 * vez de dar un salto cuando este termina de moverse.
 */
export function FitToPanels({
  left,
  right,
  bottom,
  top = 0,
}: {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top?: number;
}) {
  const { map, isLoaded } = useMap();

  useEffect(() => {
    if (!map || !isLoaded) return;
    // Nunca más de un tercio por lado: con la ventana estrecha, un padding mayor que el lienzo
    // deja a MapLibre sin área donde encuadrar y la cámara se vuelve inestable.
    const limit = (value: number, extent: number) => Math.min(Math.max(value, 0), extent / 3);
    const { width, height } = map.getContainer().getBoundingClientRect();
    map.easeTo({
      padding: {
        left: limit(left, width),
        right: limit(right, width),
        bottom: limit(bottom, height),
        top: limit(top, height),
      },
      duration: 200,
    });
  }, [map, isLoaded, left, right, bottom, top]);

  return null;
}
