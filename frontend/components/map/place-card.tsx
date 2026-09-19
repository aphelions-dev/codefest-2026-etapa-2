"use client";

import { ChevronDownIcon, ChevronUpIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Flag } from "@/components/flag";
import { DocumentLink } from "@/components/document-view";
import { IconButton } from "@/components/icon-button";
import { GLASS } from "@/components/map/panel";
import { rankLabel } from "@/lib/format";
import type { MapDatum, MapGuide } from "@/lib/map-layers";
import { cn } from "@/lib/utils";

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
  collapsed,
  onToggle,
  onClose,
}: {
  readonly guide: MapGuide;
  readonly color: string;
  readonly legend: ReactNode;
  readonly place: MapDatum | null;
  /** Puesto del territorio elegido dentro de la lista, empezando en 0. */
  readonly rank: number | null;
  readonly total: number;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly onClose: () => void;
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
      className={cn(GLASS, "border-border/60 w-full space-y-2.5 rounded-xl border p-3 shadow-lg")}
    >
      <header className="flex items-start gap-2">
        <span className="mt-1.5">{dot}</span>
        <div className="min-w-0 flex-1">
          {place ? (
            <>
              <div className="text-muted-foreground truncate text-[11px]">{guide.title}</div>
              <div className="flex items-center gap-2">
                <Flag code={place.iso2} />
                <h2 className="truncate font-semibold">{place.name}</h2>
                {rank !== null ? (
                  <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
                    {rankLabel(rank, total)}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <h2 className="text-sm font-semibold">{guide.title}</h2>
          )}
        </div>
        <IconButton label="Plegar el foco" onClick={onToggle} size="icon-xs">
          <ChevronUpIcon />
        </IconButton>
        {close}
      </header>

      {place ? (
        <div className="space-y-0.5">
          <div className="font-mono text-base font-semibold" style={{ color }}>
            {place.headline}
          </div>
          <div className="text-muted-foreground text-xs">{place.detail}</div>
          {/* La cifra del mapa lleva a un fragmento real: es lo que la hace verificable. */}
          <div className="text-muted-foreground text-xs">
            Evidencia:{" "}
            <DocumentLink chunkId={place.trace.chunk_id} docId={place.trace.doc_id}>
              {place.trace.chunk_id}
            </DocumentLink>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs leading-relaxed">{guide.measures}</p>
      )}

      <div className="space-y-1">
        {legend}
        <p className="text-muted-foreground text-[11px] leading-snug">{guide.read}</p>
      </div>

      <footer className="text-muted-foreground space-y-0.5 border-t pt-2 text-[10px] leading-snug">
        <div>Fuente: {guide.source}</div>
        {!place ? <div>{guide.limits}</div> : null}
      </footer>
    </section>
  );
}

/** Lo que dice el mapa bajo el cursor, sin tener que hacer clic. */
export function HoverCard({
  place,
  rank,
  total,
  x,
  y,
}: {
  readonly place: MapDatum;
  readonly rank: number | null;
  readonly total: number;
  readonly x: number;
  readonly y: number;
}) {
  return (
    <div
      className={cn(
        GLASS,
        "border-border/60 pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-lg border px-2.5 py-1.5 shadow-lg",
      )}
      style={{ left: x, top: y }}
    >
      <div className="flex items-center gap-1.5">
        <Flag code={place.iso2} />
        <span className="text-[13px] font-medium">{place.name}</span>
        {rank !== null ? (
          <span className="text-muted-foreground font-mono text-[10px]">{rankLabel(rank, total)}</span>
        ) : null}
      </div>
      <div className="text-muted-foreground text-[11px]">
        {place.headline} · {place.detail}
      </div>
      <div className="text-muted-foreground text-[10px]">Clic para fijarlo y ver su evidencia</div>
    </div>
  );
}
