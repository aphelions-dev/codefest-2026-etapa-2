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
import { TerritoryDetail } from "@/components/map/territory-detail";
import {
  type MapDatum,
  type MapView,
  VIEW_LABEL,
  VIEW_PHENOMENON,
  VIEW_PLACES,
} from "@/lib/map-layers";
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
  view,
  onView,
  onLevel,
  onFilter,
  options,
  places,
  coverage,
  onSelectPlace,
  detail,
  filter,
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
  readonly view: MapView;
  readonly onView: (view: MapView) => void;
  readonly onLevel: (level: MapLevel) => void;
  readonly onFilter: (value: string | null) => void;
  /** Los valores del filtro propio de la vista, con cuántos registra cada uno. */
  readonly options: readonly { readonly value: string; readonly label: string; readonly count: number }[];
  /** Los territorios de la vista activa del mapa, ya ordenados por su cifra. */
  readonly places: readonly MapDatum[];
  /** Lo que la vista declara sobre su propia cobertura, al pie del ranking. */
  readonly coverage: string;
  readonly onSelectPlace: (place: MapDatum | null) => void;
  /** El territorio abierto: su detalle reemplaza la lista, que es el maestro-detalle del anexo. */
  readonly detail: string | null;
  /** El filtro propio de la vista, para que el detalle enseñe lo mismo que el mapa. */
  readonly filter: string | null;
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
          {/* Qué mide el mapa, y con qué recorte. Va aquí y no flotando sobre el mapa porque es
              navegación —de qué va el tablero ahora mismo—, no una anotación del territorio, y
              porque es lo que manda sobre el ranking que viene justo debajo. */}
          <div className="border-border/60 space-y-2 border-b p-2">
            <div aria-label="Vista del mapa" className="bg-muted/40 flex gap-0.5 rounded-lg p-0.5" role="group">
              {(Object.keys(VIEW_LABEL) as MapView[]).map((option) => (
                <button
                  aria-pressed={view === option}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-[11px] transition-colors",
                    view === option
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  key={option}
                  onClick={() => onView(option)}
                  title={
                    VIEW_PHENOMENON[option]
                      ? `${VIEW_LABEL[option]} · solo hay datos del fenómeno ${VIEW_PHENOMENON[option]}, así que se filtra a él`
                      : VIEW_LABEL[option]
                  }
                  type="button"
                >
                  {VIEW_LABEL[option]}
                </button>
              ))}
            </div>

            {/* El nivel solo aplica a los documentos: las otras dos vistas miden en su propio nivel. */}
            {view === "documentos" ? (
              <div aria-label="Nivel territorial" className="flex gap-1" role="group">
                {(["country", "department"] as const).map((option) => (
                  <button
                    aria-pressed={level === option}
                    className="border-border/60 aria-pressed:border-primary aria-pressed:text-primary text-muted-foreground rounded-md border px-2 py-0.5 text-[10px]"
                    key={option}
                    onClick={() => onLevel(option)}
                    type="button"
                  >
                    {option === "country" ? "Países" : "Departamentos"}
                  </button>
                ))}
              </div>
            ) : null}

            {options.length > 0 ? (
              <div aria-label="Filtrar la capa" className="flex flex-wrap gap-1" role="group">
                <button
                  aria-pressed={filter === null}
                  className="border-border/60 aria-pressed:border-primary aria-pressed:text-primary text-muted-foreground rounded-md border px-1.5 py-0.5 text-[10px]"
                  onClick={() => onFilter(null)}
                  type="button"
                >
                  Todos
                </button>
                {options.map((option) => (
                  <button
                    aria-pressed={filter === option.value}
                    className="border-border/60 aria-pressed:border-primary aria-pressed:text-primary text-muted-foreground rounded-md border px-1.5 py-0.5 text-[10px]"
                    key={option.value}
                    onClick={() => onFilter(filter === option.value ? null : option.value)}
                    type="button"
                  >
                    {option.label}
                    <span className="opacity-60"> {option.count}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-ranking-scroll>
            {/* Maestro-detalle: con un territorio abierto, su evidencia ocupa el lugar de la lista
                en vez de abrirse en otro sitio y partir la atención en dos. El ranking va suelto,
                sin tarjeta: ya está dentro de un panel con su borde.

                En la vista de grupos no hay detalle: ahí cada elemento ya es un municipio, y su
                evidencia es el fragmento al que enlaza la ficha del mapa. */}
            {detail ? (
              <TerritoryDetail
                group={null}
                kind={view === "alertas" ? filter : null}
                onBack={() => onSelectPlace(null)}
                phenomenon={phenomenon}
                placeId={detail}
              />
            ) : places.length > 0 ? (
              <div className="space-y-2">
                <SectionHeader
                  aside={`${places.length}`}
                  info="Lo que la vista activa del mapa está midiendo, del que más registra al que menos. Tocar uno lo fija en el mapa y abre su evidencia aquí."
                  title={
                    view === "documentos" && level === "country" ? "Países" : VIEW_PLACES[view]
                  }
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
