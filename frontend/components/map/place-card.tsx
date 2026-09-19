"use client";

import { ChevronDownIcon, ChevronUpIcon, InfoIcon, MousePointerClickIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Flag } from "@/components/flag";
import { DocumentLink } from "@/components/document-view";
import { chunkLabel } from "@/components/highlight";
import { IconButton } from "@/components/icon-button";
import { GLASS } from "@/components/map/panel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatNumber, type Rank, rankLabel } from "@/lib/format";
import type { MapDatum, MapGuide } from "@/lib/map-layers";
import { cn } from "@/lib/utils";

// Cuántas etiquetas se enseñan antes de resumir el resto en "+N".
const TAGS = 4;

/**
 * Qué se está viendo en el mapa. Sin territorio elegido explica la vista; con uno, resume sus
 * cifras y lleva al fragmento que las sustenta. Se pliega a una píldora para no tapar el radar.
 */
export function PlaceCard({
  guide,
  color,
  legend,
  place,
  rank,
  total,
  max,
  collapsed,
  onToggle,
  onClose,
  periodNote,
}: {
  readonly guide: MapGuide;
  readonly color: string;
  readonly legend: ReactNode;
  readonly place: MapDatum | null;
  readonly rank: Rank | null;
  readonly total: number;
  /** La cifra más alta de la capa: la barra de la ficha se mide contra ella. */
  readonly max: number;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
  /** El periodo que recorta la vista, o por qué no la recorta. */
  readonly periodNote: string | null;
}) {
  const dot = <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
  const close = place ? (
    <IconButton label="Cerrar la selección" onClick={onClose} size="icon-xs">
      <XIcon />
    </IconButton>
  ) : null;

  if (collapsed) {
    return (
      <div className={cn(GLASS, "border-border/60 flex max-w-md items-center gap-2 rounded-full border py-1 pr-1 pl-3 shadow-lg")}>
        {dot}
        <Flag code={place?.iso2} />
        <span className="truncate text-sm font-medium">{place?.name ?? guide.title}</span>
        {place ? <span className="text-muted-foreground shrink-0 text-xs">{place.headline}</span> : null}
        <IconButton label="Mostrar el foco" onClick={onToggle} size="icon-xs">
          <ChevronDownIcon />
        </IconButton>
        {close}
      </div>
    );
  }

  return (
    <section
      aria-label="Foco del mapa"
      className={cn(GLASS, "border-border/60 w-full space-y-2.5 rounded-xl border p-3 shadow-xl shadow-black/40")}
    >
      <header className="flex items-start gap-1.5">
        <span className="mt-1.5">{dot}</span>
        <div className="min-w-0 flex-1">
          {place ? (
            <PlaceTitle place={place} />
          ) : (
            <h2 className="truncate text-[13px] font-semibold" title={guide.title}>
              {guide.title}
            </h2>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label="Fuente y límites de la vista"
              className="text-muted-foreground hover:text-foreground rounded p-0.5"
              type="button"
            >
              <InfoIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs flex-col items-start text-left" side="bottom">
            <span>{guide.read}</span>
            <span className="text-muted-foreground">Fuente: {guide.source}</span>
            <span className="text-muted-foreground">{guide.limits}</span>
          </TooltipContent>
        </Tooltip>
        <IconButton label="Plegar el foco" onClick={onToggle} size="icon-xs">
          <ChevronUpIcon />
        </IconButton>
        {close}
      </header>

      {place ? (
        <>
          <PlaceSummary color={color} max={max} place={place} rank={rank} total={total} unit={guide.title} />
          {/* La cifra lleva a un fragmento real, que es lo que la hace verificable. Se dice que es
              uno de muestra y dónde está el resto, para que no se lea como toda la evidencia. */}
          <div className="border-border/60 space-y-0.5 border-t pt-2 text-[11px] leading-snug">
            <div className="text-muted-foreground">{guide.sample}</div>
            <DocumentLink chunkId={place.trace.chunk_id} docId={place.trace.doc_id}>
              {place.trace.doc_id} · {chunkLabel(place.trace.chunk_id)}
            </DocumentLink>
            {guide.more ? <div className="text-muted-foreground/80 text-[10px]">← {guide.more}</div> : null}
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-[11px] leading-snug">{guide.measures}</p>
      )}

      {legend}

      {periodNote ? (
        <div className="text-muted-foreground border-border/60 border-t pt-1.5 text-[10px] tabular-nums">
          Periodo: <span className="text-foreground/80">{periodNote}</span>
        </div>
      ) : null}
    </section>
  );
}

/** Bandera, nombre y dónde está: lo mismo en la ficha y en el popup. */
function PlaceTitle({ place }: { readonly place: MapDatum }) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <Flag code={place.iso2} />
        <h2 className="truncate text-[13px] leading-tight font-semibold">{place.name}</h2>
      </div>
      {place.region ? <div className="text-muted-foreground truncate text-[11px]">{place.region}</div> : null}
    </>
  );
}

/**
 * La cifra de un territorio con su contexto: cuánto es frente al que más tiene, en qué puesto queda,
 * de qué se compone y qué nombra. Cada dato con su rótulo, en vez de todo en una frase.
 */
function PlaceSummary({
  place,
  color,
  max,
  rank,
  total,
  unit,
}: {
  readonly place: MapDatum;
  readonly color: string;
  readonly max: number;
  readonly rank: Rank | null;
  readonly total: number;
  readonly unit: string;
}) {
  const parts = place.split?.filter((part) => part.value > 0) ?? [];
  const whole = parts.reduce((sum, part) => sum + part.value, 0);
  const shown = place.tags?.slice(0, TAGS) ?? [];
  const hidden = (place.tags?.length ?? 0) - shown.length;

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="text-[15px] leading-tight font-semibold tabular-nums" style={{ color }}>
          {place.headline}
        </div>
        {/* La cifra frente a la mayor de la capa: el puesto dice el orden, la barra la distancia. */}
        <div aria-hidden className="bg-muted h-1 overflow-hidden rounded-full" title={unit}>
          <div className="h-full rounded-full" style={{ width: `${(place.value / Math.max(max, 1)) * 100}%`, backgroundColor: color }} />
        </div>
        {rank ? <div className="text-muted-foreground text-[10px] tabular-nums">{rankLabel(rank, total)}</div> : null}
      </div>

      {parts.length > 0 ? (
        <div className="space-y-1">
          <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full">
            {parts.map((part) => (
              <div key={part.label} style={{ width: `${(part.value / whole) * 100}%`, backgroundColor: part.color }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
            {parts.map((part) => (
              <li className="text-muted-foreground flex items-center gap-1" key={part.label}>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: part.color }} />
                {part.label}
                <span className="text-foreground font-medium tabular-nums">{formatNumber(part.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {place.facts.length > 0 ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          {place.facts.map((fact) => (
            <div className="contents" key={fact.label}>
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd className="text-right font-medium tabular-nums">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {shown.length > 0 ? (
        <ul className="flex flex-wrap gap-1 text-[10px]">
          {shown.map((tag) => (
            <li className="border-f3/40 bg-f3/10 rounded-md border px-1.5 py-0.5" key={tag}>
              {tag}
            </li>
          ))}
          {hidden > 0 ? (
            <li className="text-muted-foreground px-1 py-0.5" title={place.tags?.slice(TAGS).join(", ")}>
              +{hidden}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

// Ancho del popup y distancia al cursor: con ellos se decide si cabe arriba o hay que darle la vuelta.
const HOVER_WIDTH = 256;
const HOVER_GAP = 14;
const HOVER_ROOM = 190;

/**
 * Lo que dice el mapa bajo el cursor, sin tener que hacer clic. Se abre encima del cursor y, si no
 * cabe —pegado al borde superior o a un lateral del hueco—, debajo o hacia dentro.
 */
export function HoverCard({
  place,
  rank,
  total,
  max,
  color,
  x,
  y,
  width,
}: {
  readonly place: MapDatum;
  readonly rank: Rank | null;
  readonly total: number;
  readonly max: number;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  /** Ancho del hueco visible del mapa, para no salirse por los lados. */
  readonly width: number;
}) {
  const below = y < HOVER_ROOM;
  const left = Math.min(Math.max(x, HOVER_WIDTH / 2 + 8), width - HOVER_WIDTH / 2 - 8);

  return (
    <div
      className={cn(
        GLASS,
        "border-border/60 pointer-events-none absolute z-20 space-y-2 rounded-xl border p-3 shadow-xl shadow-black/50",
        "animate-in fade-in-0 zoom-in-95 duration-100",
      )}
      style={{
        left,
        top: below ? y + HOVER_GAP : y - HOVER_GAP,
        width: HOVER_WIDTH,
        translate: below ? "-50% 0" : "-50% -100%",
      }}
    >
      <PlaceTitle place={place} />
      <PlaceSummary color={color} max={max} place={place} rank={rank} total={total} unit="" />
      <div className="text-muted-foreground/80 flex items-center gap-1 text-[10px]">
        <MousePointerClickIcon className="size-3" />
        Clic para fijarlo y ver su evidencia
      </div>
    </div>
  );
}
