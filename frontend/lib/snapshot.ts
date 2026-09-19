import type { Map as MapLibre } from "maplibre-gl";

import { rankOf } from "@/lib/format";

/**
 * La vista actual del radar como imagen para compartir: el mapa recortado al hueco que dejan los
 * paneles y, encima, lo que hace falta para entenderlo sin el tablero delante —qué mide, con qué
 * filtros, la leyenda, quién encabeza y de dónde sale—. No es una captura de pantalla: una captura
 * arrastra paneles cortados y controles; esto es una tarjeta que se lee sola.
 */

export type Snapshot = {
  readonly title: string;
  /** Fenómeno, periodo, nivel: los filtros que recortan la cifra. */
  readonly filters: readonly string[];
  readonly unit: string;
  readonly legend: { readonly ramp: readonly string[]; readonly breaks: readonly number[] };
  readonly ranking: readonly { readonly name: string; readonly value: number }[];
  readonly selected?: { readonly name: string; readonly headline: string; readonly detail: string } | null;
  readonly source: string;
  readonly url: string;
  /** El hueco visible del mapa, en píxeles CSS: fuera de él solo hay paneles. */
  readonly crop: { readonly left: number; readonly right: number; readonly bottom: number };
};

const WIDTH = 1600;
const HEIGHT = 900;
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const INK = "#e7e7e7";
const MUTED = "#8b8b8b";
const PANEL = "rgba(18, 18, 18, 0.88)";
const ACCENT = "#22d3ee";
const TOP = 8;

/**
 * El lienzo de WebGL se borra después de cada fotograma: solo se puede copiar dentro del propio
 * evento `render`, así que se pide uno y se copia ahí.
 */
function mapFrame(map: MapLibre): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    map.once("render", () => {
      const source = map.getCanvas();
      const copy = document.createElement("canvas");
      copy.width = source.width;
      copy.height = source.height;
      copy.getContext("2d")?.drawImage(source, 0, 0);
      resolve(copy);
    });
    map.triggerRepaint();
  });
}

export async function composeSnapshot(map: MapLibre, snapshot: Snapshot): Promise<Blob> {
  const frame = await mapFrame(map);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no permite dibujar la imagen.");

  ctx.fillStyle = "#121212";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // El mapa, recortado al hueco visible y encajado como `object-fit: cover`.
  const ratio = frame.width / map.getCanvas().clientWidth;
  const sx = snapshot.crop.left * ratio;
  const sw = frame.width - (snapshot.crop.left + snapshot.crop.right) * ratio;
  const sh = frame.height - snapshot.crop.bottom * ratio;
  const scale = Math.max(WIDTH / sw, HEIGHT / sh);
  const cw = WIDTH / scale;
  const ch = HEIGHT / scale;
  ctx.drawImage(frame, sx + (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, WIDTH, HEIGHT);

  // Panel izquierdo: qué mide, con qué filtros, cómo se lee y quién encabeza.
  const x = 32;
  let y = 32;
  const width = 440;
  const rows = snapshot.ranking.slice(0, TOP);
  const height = 250 + rows.length * 34;
  panel(ctx, x, y, width, height);

  y += 40;
  text(ctx, "RADAR ESTRATÉGICO", x + 24, y, 13, ACCENT, "600", 2);
  y += 34;
  y = wrap(ctx, snapshot.title, x + 24, y, width - 48, 24, INK, "700", 30);
  y += 4;
  for (const filter of snapshot.filters) {
    text(ctx, filter, x + 24, y, 15, MUTED);
    y += 22;
  }

  // Leyenda: la rampa y sus cortes.
  y += 10;
  const segment = (width - 48) / Math.max(snapshot.legend.ramp.length, 1);
  snapshot.legend.ramp.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + 24 + index * segment, y, segment, 10);
  });
  y += 28;
  snapshot.legend.breaks.forEach((cut, index) => {
    text(ctx, `≥${cut}`, x + 24 + index * segment, y, 13, MUTED);
  });
  y += 22;
  text(ctx, snapshot.unit, x + 24, y, 13, MUTED);

  // Ranking con barra proporcional, como en la barra lateral.
  y += 28;
  const max = Math.max(...rows.map((row) => row.value), 1);
  const values = snapshot.ranking.map((row) => row.value);
  rows.forEach((row, index) => {
    // Puesto con empates, como en la barra lateral: los empatados comparten número y no lo repiten.
    if (index === 0 || row.value !== rows[index - 1].value) {
      text(ctx, `${rankOf(row.value, values).position}`, x + 24, y, 14, MUTED);
    }
    text(ctx, ellipsis(ctx, row.name, 270, 16), x + 50, y, 16, INK);
    text(ctx, row.value.toLocaleString("es-CO"), x + width - 24, y, 16, INK, "600", 0, "right");
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(x + 50, y + 8, width - 74, 4);
    ctx.fillStyle = snapshot.legend.ramp[2] ?? ACCENT;
    ctx.fillRect(x + 50, y + 8, ((width - 74) * row.value) / max, 4);
    y += 34;
  });

  // El territorio elegido, si lo hay: su cifra y su detalle.
  if (snapshot.selected) {
    const sy = HEIGHT - 72 - 120;
    panel(ctx, x, sy, width, 108);
    text(ctx, snapshot.selected.name, x + 24, sy + 38, 20, INK, "700");
    text(ctx, snapshot.selected.headline, x + 24, sy + 68, 18, snapshot.legend.ramp[3] ?? ACCENT, "600");
    text(ctx, ellipsis(ctx, snapshot.selected.detail, width - 48, 14), x + 24, sy + 92, 14, MUTED);
  }

  // Pie: de dónde sale, cuándo se generó y el enlace que reproduce la vista.
  ctx.fillStyle = PANEL;
  ctx.fillRect(0, HEIGHT - 52, WIDTH, 52);
  const date = new Date().toLocaleString("es-CO", { dateStyle: "long", timeStyle: "short" });
  text(ctx, ellipsis(ctx, `Fuente: ${snapshot.source}`, 900, 13), 32, HEIGHT - 20, 13, MUTED);
  text(ctx, ellipsis(ctx, `${date} · ${snapshot.url}`, 640, 13), WIDTH - 32, HEIGHT - 20, 13, MUTED, "400", 0, "right");

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar la imagen."))), "image/png"),
  );
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.fillStyle = PANEL;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 14);
  ctx.fill();
  ctx.stroke();
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = "400",
  spacing = 0,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(value, x, y);
  ctx.letterSpacing = "0px";
  ctx.textAlign = "left";
}

/** Un título largo en varias líneas; devuelve dónde acaba. */
function wrap(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  width: number,
  size: number,
  color: string,
  weight: string,
  lineHeight: number,
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  let line = "";
  for (const word of value.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      text(ctx, line, x, y, size, color, weight);
      y += lineHeight;
      line = word;
    } else {
      line = next;
    }
  }
  if (line) text(ctx, line, x, y, size, color, weight);
  return y + lineHeight;
}

function ellipsis(ctx: CanvasRenderingContext2D, value: string, width: number, size: number) {
  ctx.font = `400 ${size}px ${FONT}`;
  if (ctx.measureText(value).width <= width) return value;
  let cut = value;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}
