import type { ReactNode } from "react";

/**
 * El texto con sus menciones marcadas: en un fragmento de cuatrocientos caracteres, lo que justifica
 * que esté ahí se encuentra de un vistazo.
 *
 * `exact` son las formas con que el backend contó la mención («United States», «EE. UU.») y se
 * buscan como él: distinguiendo mayúsculas y como palabra entera, así que se marca justo lo que se
 * contó. `loose` ignora mayúsculas, para lo que solo se conoce por su identificador (una entidad).
 */
export function Highlight({
  text,
  exact = [],
  loose = [],
}: {
  readonly text: string;
  readonly exact?: readonly string[];
  readonly loose?: readonly string[];
}) {
  const ranges = [...spans(text, exact, "g"), ...spans(text, loose, "gi")].sort((a, b) => a[0] - b[0]);
  if (ranges.length === 0) return text;

  const parts: ReactNode[] = [];
  let last = 0;
  for (const [start, end] of ranges) {
    if (start < last) continue; // solapada con la anterior, que ya la marca
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <mark className="bg-primary/20 text-foreground rounded-sm px-0.5 font-medium" key={start}>
        {text.slice(start, end)}
      </mark>,
    );
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function spans(text: string, terms: readonly string[], flags: string): [number, number][] {
  // La forma más larga primero, como en el backend: «Norte de Santander» antes que «Santander».
  const wanted = [...new Set(terms)].filter((term) => term.length >= 2).sort((a, b) => b.length - a.length);
  if (wanted.length === 0) return [];
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])(?:${wanted.map(escape).join("|")})(?![\\p{L}\\p{N}_-])`, `${flags}u`);
  return [...text.matchAll(pattern)].map((match) => [match.index, match.index + match[0].length]);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** «F3-ABC-12-chunk-0004» → «fragmento 5»: la posición que lee una persona, contando desde uno. */
export function chunkLabel(chunkId: string) {
  const position = /-chunk-(\d+)$/.exec(chunkId)?.[1];
  return position === undefined ? chunkId : `fragmento ${Number(position) + 1}`;
}
