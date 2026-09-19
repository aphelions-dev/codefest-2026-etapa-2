// Cifras y fechas como se leen en Colombia.
const LOCALE = "es-CO";

export const formatNumber = (value: number) => value.toLocaleString(LOCALE);

// Mediodía: una fecha sin hora se interpreta en UTC y en Colombia caería el día anterior.
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);

export const formatDate = (iso: string) =>
  asDate(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });

export const formatMonth = (iso: string) => asDate(iso).toLocaleDateString(LOCALE, { month: "short", year: "numeric" });

/**
 * El puesto de un lugar con empates: todos los que tienen la misma cifra comparten puesto. Sin esto,
 * entre 470 municipios con un solo grupo el puesto lo decidía el orden arbitrario del desempate.
 */
export type Rank = { readonly position: number; readonly ties: number };

/** "3.º de 32", o "169.º de 639 · empate con 470". */
export const rankLabel = (rank: Rank, total: number) =>
  `${rank.position}.º de ${total}${rank.ties > 0 ? ` · empate con ${formatNumber(rank.ties)}` : ""}`;

/** El puesto de `value` entre `values`: uno más que los que lo superan, y cuántos lo igualan. */
export function rankOf(value: number, values: readonly number[]): Rank {
  return {
    position: values.filter((other) => other > value).length + 1,
    ties: values.filter((other) => other === value).length - 1,
  };
}

/** "1 grupo", "3 grupos": el sustantivo concuerda con la cifra. */
export const count = (value: number, one: string, many: string) =>
  `${formatNumber(value)} ${value === 1 ? one : many}`;

/** La misma fecha un año antes, en ISO: basta con comparar cadenas para filtrar los últimos 12 meses. */
export const yearBefore = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4, 10)}`;
