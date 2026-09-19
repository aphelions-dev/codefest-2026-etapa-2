"use client";

import { createParser, useQueryStates } from "nuqs";

/**
 * El periodo, segundo filtro global del tablero junto al fenómeno. Vive en la URL como `desde` y
 * `hasta`, dos meses `AAAA-MM`: un experto comparte el enlace con el periodo puesto.
 *
 * La granularidad es el mes, pero no todo el corpus la tiene: la mayoría de los documentos solo
 * sabe su año. El backend deja entrar a un documento cuando todo lo que se sabe de su fecha cae en
 * el periodo, así que uno fechado por año entra solo si el periodo cubre su año entero. Las alertas
 * sí traen su día de emisión.
 */

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

const parseAsMonth = createParser({
  parse: (value: string) => (MONTH.test(value) ? value : null),
  serialize: (value: string) => value,
});

export type Period = { readonly from: string | null; readonly to: string | null };

export function usePeriod() {
  const [period, setPeriod] = useQueryStates({ desde: parseAsMonth, hasta: parseAsMonth });
  const value: Period = { from: period.desde, to: period.hasta };
  const set = (next: Period) => setPeriod({ desde: next.from, hasta: next.to });
  return [value, set] as const;
}

/** Los parámetros que entiende el backend: primer día del mes inicial, último del final. */
export function periodParams(period: Period): { date_from?: string; date_to?: string } {
  return {
    date_from: period.from ? `${period.from}-01` : undefined,
    date_to: period.to ? lastDay(period.to) : undefined,
  };
}

export const isActive = (period: Period) => period.from !== null || period.to !== null;

/** Meses contados desde el año 0: con ellos el deslizador trabaja con enteros. */
export const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1;

export const monthOf = (index: number) =>
  `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;

export function currentMonth() {
  const now = new Date();
  return monthOf(now.getFullYear() * 12 + now.getMonth());
}

function lastDay(month: string) {
  const [year, number] = month.split("-").map(Number);
  // El día 0 del mes siguiente es el último de este.
  const day = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, "0")}`;
}

const NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const monthLabel = (month: string) => `${NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** "dic 2025 – sep 2026", "desde mar 2024", "hasta 2019": el periodo como se lee. */
export function periodLabel(period: Period) {
  const { from, to } = period;
  if (from && to) {
    // Un año entero se dice con el año.
    if (from.endsWith("-01") && to.endsWith("-12") && from.slice(0, 4) === to.slice(0, 4)) return from.slice(0, 4);
    return `${monthLabel(from)} – ${monthLabel(to)}`;
  }
  if (from) return `desde ${monthLabel(from)}`;
  if (to) return `hasta ${monthLabel(to)}`;
  return "Todo el corpus";
}

/** Los últimos `months` meses, contando el actual. */
export function lastMonths(months: number): Period {
  const end = monthIndex(currentMonth());
  return { from: monthOf(end - months + 1), to: monthOf(end) };
}

/** Un año natural completo: es lo que deja entrar a los documentos fechados solo por año. */
export const wholeYear = (year: number): Period => ({ from: `${year}-01`, to: `${year}-12` });
