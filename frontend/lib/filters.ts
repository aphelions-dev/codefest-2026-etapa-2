"use client";

import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";

/** Los tres fenómenos del reto. Los colores están en `globals.css` como `--f1`, `--f2` y `--f3`. */
export const PHENOMENA = [
  { id: 1, short: "F1", label: "IA y capacidades estratégicas" },
  { id: 2, short: "F2", label: "Seguridad del entorno espacial" },
  { id: 3, short: "F3", label: "Dinámicas territoriales" },
] as const;

/** Clases del distintivo y del punto, por fenómeno, para que un mismo fenómeno sea el mismo color. */
export const PHENOMENON_STYLE = ["", "border-f1/50 text-f1", "border-f2/50 text-f2", "border-f3/50 text-f3"];
export const PHENOMENON_DOT = ["", "bg-f1", "bg-f2", "bg-f3"];

/** El color como valor, para lo que se pinta con CSS en vez de con clases (Recharts, SVG). */
export function phenomenonColor(id: number | null | undefined): string {
  return id === 1 || id === 2 || id === 3 ? `var(--f${id})` : "var(--primary)";
}

/**
 * El filtro global vive en la URL: un experto puede compartir el enlace con el filtro puesto y el
 * botón de atrás funciona. Lo que el agente activó vive en memoria con el hilo del chat.
 */
export function usePhenomenon() {
  return useQueryState("fenomeno", parseAsInteger);
}

/**
 * La entidad seleccionada, que es el segundo filtro global del tablero. Seleccionarla en una vista
 * —una celda de la matriz, un nodo de la red, un punto del cuadrante— reduce las demás a los
 * documentos que la nombran: es el *brushing and linking* que pide el anexo, y va en la URL para
 * que un experto pueda compartir exactamente lo que está mirando.
 */
export function useEntity() {
  return useQueryState("entidad", parseAsString);
}

const LEVELS = ["country", "department"] as const;

/** Los dos niveles de agregación territorial del mapa. */
export type MapLevel = (typeof LEVELS)[number];

/**
 * Nivel territorial del mapa. Va en la URL por la misma razón, y por defecto sigue al fenómeno:
 * F3 es territorial y se lee por departamentos; F1 y F2 se leen por países.
 */
export function useMapLevel(phenomenon: number | null) {
  const [level, setLevel] = useQueryState("nivel", parseAsStringLiteral(LEVELS));
  return [level ?? (phenomenon === 3 ? "department" : "country"), setLevel] as const;
}
