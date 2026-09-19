// Cifras y fechas como se leen en Colombia.
const LOCALE = "es-CO";

export const formatNumber = (value: number) => value.toLocaleString(LOCALE);

// Mediodía: una fecha sin hora se interpreta en UTC y en Colombia caería el día anterior.
const asDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);

export const formatDate = (iso: string) =>
  asDate(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });

export const formatMonth = (iso: string) => asDate(iso).toLocaleDateString(LOCALE, { month: "short", year: "numeric" });

/** "3.º de 32": el puesto de un lugar dentro de su ranking. */
export const rankLabel = (index: number, total: number) => `${index + 1}.º de ${total}`;

/** La misma fecha un año antes, en ISO: basta con comparar cadenas para filtrar los últimos 12 meses. */
export const yearBefore = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4, 10)}`;
