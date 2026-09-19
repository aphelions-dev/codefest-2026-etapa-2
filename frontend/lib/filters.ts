"use client";

import { parseAsInteger, useQueryState } from "nuqs";

/** Los tres fenomenos del reto, con el color que los identifica en todas las vistas. */
export const PHENOMENA = [
  { id: 1, short: "F1", label: "IA y capacidades estratégicas", color: "var(--color-phenomenon-1)" },
  { id: 2, short: "F2", label: "Seguridad del entorno espacial", color: "var(--color-phenomenon-2)" },
  { id: 3, short: "F3", label: "Dinámicas territoriales", color: "var(--color-phenomenon-3)" },
] as const;

export function phenomenonColor(id: number | null | undefined): string {
  return PHENOMENA.find((p) => p.id === id)?.color ?? "var(--color-accent)";
}

/**
 * El filtro global vive en la URL: un experto puede compartir el enlace con el filtro puesto y
 * el boton de atras funciona. Lo que el agente activo vive en memoria con el hilo del chat.
 */
export function usePhenomenon() {
  return useQueryState("fenomeno", parseAsInteger);
}
