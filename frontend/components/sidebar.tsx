"use client";

import { LayoutGridIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, RadarIcon } from "lucide-react";

import { Flag } from "@/components/flag";
import { IconButton } from "@/components/icon-button";
import { GLASS, Ranking, SectionHeader } from "@/components/map/panel";
import {
  type MapLevel,
  PHENOMENA,
  PHENOMENON_DOT,
  PHENOMENON_STYLE,
  phenomenonRamp,
} from "@/lib/filters";
import type { MapDatum } from "@/lib/map-layers";
import { cn } from "@/lib/utils";

/** Ancho de la barra abierta y de su riel cuando se pliega. */
export const SIDEBAR_OPEN = 352;
export const SIDEBAR_RAIL = 56;

/**
 * La barra del radar: identidad, el filtro global por fenómeno, los componentes que el agente
 * activó y el ranking del territorio. Va anclada al borde izquierdo y no flotando, para que el mapa
 * ocupe el hueco que le queda en vez de quedar tapado por tarjetas sueltas.
 */
export function Sidebar({
  open,
  onToggle,
  phenomenon,
  onPhenomenon,
  analysisOpen,
  onToggleAnalysis,
  components,
  level,
  places,
  coverage,
  onSelectPlace,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly phenomenon: number | null;
  readonly onPhenomenon: (value: number | null) => void;
  readonly analysisOpen: boolean;
  readonly onToggleAnalysis: () => void;
  /** Cuántos componentes activó el agente: el conmutador dice qué se recupera al abrirlo. */
  readonly components: number;
  readonly level: MapLevel;
  /** Los territorios de la vista activa del mapa, ya ordenados por su cifra. */
  readonly places: readonly MapDatum[];
  /** Lo que la vista declara sobre su propia cobertura, al pie del ranking. */
  readonly coverage: string;
  readonly onSelectPlace: (place: MapDatum) => void;
}) {
  return (
    <aside
      className={cn(GLASS, "border-border/60 absolute inset-y-0 left-0 z-20 flex flex-col border-r")}
      style={{ width: open ? SIDEBAR_OPEN : SIDEBAR_RAIL }}
    >
      <header
        className={cn(
          "border-border/60 flex h-12 shrink-0 items-center gap-2 border-b px-3",
          !open && "h-auto flex-col py-3",
        )}
      >
        <RadarIcon className="text-primary size-4 shrink-0" />
        {open ? (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">Radar Estratégico</span>
        ) : null}
        {components > 0 ? (
          <IconButton
            aria-pressed={analysisOpen}
            label={analysisOpen ? "Ver el mapa entero" : `Ver los ${components} componentes activos`}
            onClick={onToggleAnalysis}
          >
            <LayoutGridIcon className={cn("size-4", analysisOpen && "text-primary")} />
          </IconButton>
        ) : null}
        <IconButton label={open ? "Plegar la barra" : "Desplegar la barra"} onClick={onToggle}>
          {open ? <PanelLeftCloseIcon className="size-4" /> : <PanelLeftOpenIcon className="size-4" />}
        </IconButton>
      </header>

      {/* Filtro global: se propaga a todas las vistas del tablero, como pide el anexo. */}
      <nav
        aria-label="Fenómenos"
        className={cn("border-border/60 space-y-1 border-b p-2", !open && "flex flex-col items-center space-y-2")}
      >
        <FilterButton
          active={phenomenon === null}
          label="Los tres fenómenos"
          onClick={() => onPhenomenon(null)}
          open={open}
          short="···"
        />
        {PHENOMENA.map((item) => (
          <FilterButton
            active={phenomenon === item.id}
            dot={PHENOMENON_DOT[item.id]}
            key={item.id}
            label={item.label}
            onClick={() => onPhenomenon(item.id)}
            open={open}
            short={item.short}
            style={PHENOMENON_STYLE[item.id]}
          />
        ))}
      </nav>

      {open ? (
        <>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-ranking-scroll>
            {/* El ranking va suelto en la barra, sin tarjeta: ya está dentro de un panel con su
                borde, y una caja dentro de otra solo añade ruido. */}
            {places.length > 0 ? (
              <div className="space-y-2">
                <SectionHeader
                  aside={`${places.length}`}
                  info="Los territorios de la vista activa del mapa, del que más registra al que menos. Tocar uno lo fija en el mapa y abre su ficha con la evidencia."
                  title={level === "department" ? "Departamentos" : "Territorios"}
                />
                <Ranking<MapDatum>
                  color={phenomenonRamp(phenomenon)[2]}
                  icon={(place) => <Flag code={place.iso2} />}
                  id={(place) => place.id}
                  items={[...places]}
                  name={(place) => place.name}
                  onSelect={onSelectPlace}
                  value={(place) => place.value}
                />
                {/* La vista declara su cobertura aquí: qué parte del dato está y qué parte falta. */}
                {coverage ? (
                  <p className="text-muted-foreground px-1.5 text-[10px] leading-snug">{coverage}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <footer className="border-border/60 text-muted-foreground border-t px-3 py-1.5 text-[10px] leading-relaxed">
            Corpus de la Etapa 1. Todo dato mostrado lleva a su <code>doc_id</code> y{" "}
            <code>chunk_id</code> de origen.
          </footer>
        </>
      ) : null}
    </aside>
  );
}

/** Un fenómeno del filtro global: nombre completo con la barra abierta, distintivo en el riel. */
function FilterButton({
  active,
  label,
  short,
  open,
  dot,
  style,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly short: string;
  readonly open: boolean;
  readonly dot?: string;
  readonly style?: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "hover:bg-muted/60 flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
        !open && "w-auto justify-center px-1.5",
        active && "bg-muted/70",
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span
        className={cn(
          "border-border/60 flex h-5 min-w-7 items-center justify-center rounded border px-1 font-mono text-[10px] font-semibold",
          active && style,
        )}
      >
        {short}
      </span>
      {open ? (
        <span className={cn("flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs", active && "font-medium")}>
          {dot ? <span className={cn("size-1.5 shrink-0 rounded-full", dot)} /> : null}
          <span className="truncate">{label}</span>
        </span>
      ) : null}
    </button>
  );
}
