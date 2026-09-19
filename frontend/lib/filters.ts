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
 * Rampa secuencial de cuatro pasos por fenómeno, del tono más oscuro al del propio fenómeno.
 *
 * Son hexadecimales y no variables CSS porque MapLibre las evalúa dentro de una expresión de
 * pintado, donde un `var(--f2)` no se resuelve. Cada rampa sale del mismo matiz que el distintivo
 * del fenómeno, así que un territorio de F3 se lee con el mismo color en el mapa, en las barras y
 * en la leyenda: es la paleta consistente que pide el anexo.
 *
 * Los cuatro pasos suben en luminosidad además de en saturación, de modo que el orden se mantiene
 * también en escala de grises y para quien no distingue el matiz.
 */
export const PHENOMENON_RAMP: Record<number, readonly string[]> = {
  // Violeta de --f1
  1: ["#332b52", "#4f3f8c", "#7b64d6", "#b8a4ff"],
  // Cian de --f2
  2: ["#173a42", "#1c6472", "#2399ad", "#62e6f7"],
  // Ámbar de --f3
  3: ["#3d2f12", "#6e5214", "#b07d16", "#fbbf24"],
};

// Sin fenómeno elegido, la rampa del color primario del tablero.
const ALL_RAMP = ["#0e5f74", "#1f8fa8", "#3fc0d4", "#8ee9f5"];

export function phenomenonRamp(id: number | null | undefined): readonly string[] {
  return id === 1 || id === 2 || id === 3 ? PHENOMENON_RAMP[id] : ALL_RAMP;
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
