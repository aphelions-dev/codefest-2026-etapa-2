"use client";

import { InfoIcon } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const SECTION_TITLE = "font-medium text-[11px] text-muted-foreground uppercase tracking-wide";
// Fondo translúcido de todo lo que flota o se ancla sobre el mapa.
export const GLASS = "bg-background/80 backdrop-blur-xl";

/** Título de sección con la fuente y cómo leerla detrás de un ⓘ, en vez de un párrafo suelto. */
export function SectionHeader({ title, aside, info }: { title: string; aside?: ReactNode; info?: ReactNode }) {
  return (
    <div className={cn(SECTION_TITLE, "flex items-center gap-1")}>
      <span className="flex-1">{title}</span>
      {aside && <span className="font-mono normal-case">{aside}</span>}
      {info && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="Fuente y cómo leerlo"
              className="rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <InfoIcon className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-md text-left font-normal normal-case leading-relaxed tracking-normal">
            {info}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/** "Ver los 32" / "Ver menos": el resto de una lista, a petición. */
export function ShowMore({ expanded, total, onToggle }: { expanded: boolean; total: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {expanded ? "Ver menos" : `Ver los ${total}`}
    </button>
  );
}

// Filas visibles como mínimo; si el panel tiene más alto libre, se muestran las que quepan.
const RANKING_MIN_ROWS = 10;
// Alto reservado para el botón "Ver los N" y el margen inferior del panel.
const RANKING_FOOTER = 44;

/**
 * Cuántas filas de la lista caben en el alto que le queda al panel desplazable (`data-ranking-scroll`)
 * por debajo de su comienzo. Se recalcula al cambiar el tamaño del panel.
 */
function useFittingRows(list: RefObject<HTMLUListElement | null>, count: number) {
  const [rows, setRows] = useState(RANKING_MIN_ROWS);
  useEffect(() => {
    const element = list.current;
    const scroller = element?.closest<HTMLElement>("[data-ranking-scroll]");
    if (!element || !scroller) return;
    const measure = () => {
      const row = element.firstElementChild?.getBoundingClientRect().height;
      if (!row) return;
      const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      setRows(Math.max(RANKING_MIN_ROWS, Math.floor((scroller.clientHeight - top - RANKING_FOOTER) / (row + 2))));
    };
    // El observador mide al empezar y en cada cambio de tamaño; `count` vuelve a medir cuando llegan
    // los datos, porque sin filas no hay alto de fila que medir.
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [list, count]);
  return rows;
}

/** Lista ordenada de lugares con barra proporcional: las filas que quepan (10 o más) y un clic abre su detalle. */
export function Ranking<T>({ items, name, value, id, color, onSelect, icon, meta }: {
  items: T[]; name: (item: T) => string; value: (item: T) => number; id: (item: T) => string;
  color: string; onSelect: (item: T) => void; icon?: (item: T) => ReactNode;
  /** Una línea de contexto bajo el nombre, cuando el nombre solo es ambiguo. */
  meta?: (item: T) => string | undefined;
}) {
  const [expanded, setExpanded] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  const fitting = useFittingRows(list, items.length);
  const max = items.length ? value(items[0]) : 1;
  const shown = expanded ? items : items.slice(0, fitting);
  return (
    <div className="space-y-1">
      <ul ref={list} className="space-y-0.5">
        {shown.map((item, index) => (
          <li key={id(item)}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="w-full space-y-1 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60"
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="w-4 font-mono text-[10px] text-muted-foreground">{index + 1}</span>
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  {icon?.(item)}
                  <span className="truncate">{name(item)}</span>
                  {meta?.(item) ? <span className="truncate text-[10px] text-muted-foreground">{meta(item)}</span> : null}
                </span>
                <span className="font-mono text-muted-foreground">{value(item)}</span>
              </div>
              <div className="ml-6 h-1 rounded-full bg-muted">
                <div className="h-1 rounded-full" style={{ width: `${(value(item) / Math.max(max, 1)) * 100}%`, backgroundColor: color }} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      {items.length > fitting && (
        <ShowMore expanded={expanded} total={items.length} onToggle={() => setExpanded((open) => !open)} />
      )}
    </div>
  );
}

export function GradientLegend({ ramp, breaks }: { ramp: string[]; breaks: number[] }) {
  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full">
        {ramp.map((color) => (
          <div key={color} className="flex-1" style={{ backgroundColor: color }} />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        {breaks.map((cut) => (
          <span key={cut}>≥{cut}</span>
        ))}
      </div>
    </div>
  );
}

export function SwatchLegend({ items }: { items: [label: string, color: string][] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
