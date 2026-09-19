"use client";

import type { ExpressionSpecification } from "maplibre-gl";
import { useEffect, useState } from "react";

import { MapGeoJSON, useMap } from "@/components/ui/map";

/** La API describe la geometria como un objeto libre; MapLibre la necesita como GeoJSON. */
export type Shapes<P> = GeoJSON.FeatureCollection<GeoJSON.Geometry, P>;

/**
 * Cortes por cuantiles (p50, p75, p90, p97). Con una escala continua casi todo sale coloreado y
 * Estados Unidos aplana el resto; asi la mitad menos citada queda sin color y resalta lo que
 * concentra, que es la tarea del mapa.
 */
export function quantileBreaks(values: number[]): number[] {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  const quantile = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const cuts: number[] = [];
  for (const q of [0.5, 0.75, 0.9, 0.97]) cuts.push(Math.max(quantile(q), (cuts.at(-1) ?? 0) + 1));
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
