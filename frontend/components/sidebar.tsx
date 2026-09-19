"use client";

import {
  BrainCircuitIcon,
  FileTextIcon,
  GlobeIcon,
  LayersIcon,
  type LucideIcon,
  MapIcon,
  MapPinnedIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RadarIcon,
  SatelliteIcon,
  SwordsIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";

import { Flag } from "@/components/flag";
import { IconButton } from "@/components/icon-button";
import { GLASS, Ranking, SectionHeader } from "@/components/map/panel";
import {
  type MapLevel,
  PHENOMENA,
  PHENOMENON_DOT,
  PHENOMENON_STYLE,
  PHENOMENON_TEXT,
  phenomenonRamp,
} from "@/lib/filters";
import { TerritoryDetail } from "@/components/map/territory-detail";
import {
  type MapDatum,
  type MapView,
  VIEW_LABEL,
  VIEW_PHENOMENON,
  VIEW_PLACES,
  VIEW_SCOPE,
} from "@/lib/map-layers";
import { cn } from "@/lib/utils";

/** Un icono por fenómeno y por capa: el mismo en la barra abierta y en el riel. */
const PHENOMENON_ICON: Record<number, LucideIcon> = { 1: BrainCircuitIcon, 2: SatelliteIcon, 3: MapPinnedIcon };
const VIEW_ICON: Record<MapView, LucideIcon> = {
  documentos: FileTextIcon,
  alertas: TriangleAlertIcon,
  grupos: SwordsIcon,
};
const SECTION = "text-muted-foreground px-2 pb-1 text-[10px] font-medium tracking-wide uppercase";

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
      className={cn(
        GLASS,
        "border-border/60 absolute inset-y-0 left-0 z-20 flex flex-col border-r",
        // La misma duración con que el mapa anima su encuadre: panel y cámara se mueven juntos.
        "transition-[width] duration-200",
      )}
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
        <IconButton label={open ? "Plegar la barra" : "Desplegar la barra"} onClick={onToggle}>
          {open ? <PanelLeftCloseIcon className="size-4" /> : <PanelLeftOpenIcon className="size-4" />}
        </IconButton>
      </header>

      {/* Filtro global: se propaga a todas las vistas del tablero, como pide el anexo. */}
      <nav
        aria-label="Fenómenos"
        className={cn("border-border/60 space-y-0.5 border-b p-2", !open && "flex flex-col items-center space-y-1")}
      >
        {open ? <div className={SECTION}>Fenómeno</div> : null}
        <FilterButton
          active={phenomenon === null}
          icon={LayersIcon}
          label="Los tres fenómenos"
          onClick={() => onPhenomenon(null)}
          open={open}
        />
        {PHENOMENA.map((item) => (
          <FilterButton
            active={phenomenon === item.id}
            dot={PHENOMENON_DOT[item.id]}
            icon={PHENOMENON_ICON[item.id]}
            key={item.id}
            label={item.label}
            onClick={() => onPhenomenon(item.id)}
            open={open}
            short={item.short}
            tone={PHENOMENON_TEXT[item.id]}
          />
        ))}
      </nav>

      {open ? (
        <>
          {/* Qué mide el mapa, y con qué recorte. Va aquí y no flotando sobre el mapa porque es
              navegación —de qué va el tablero ahora mismo—, no una anotación del territorio, y
              porque es lo que manda sobre el ranking que viene justo debajo. */}
          <div className="border-border/60 space-y-0.5 border-b p-2">
            <div className={SECTION}>Capa del mapa</div>
            <div aria-label="Capa del mapa" className="space-y-0.5" role="group">
              {(Object.keys(VIEW_LABEL) as MapView[]).map((option) => {
                const Icon = VIEW_ICON[option];
                const selected = view === option;
                const required = VIEW_PHENOMENON[option];
                return (
                  <div key={option}>
                    <button
                      aria-pressed={selected}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                        selected ? "bg-muted/70" : "hover:bg-muted/40",
                      )}
                      onClick={() => onView(option)}
                      title={required ? `Solo hay datos del fenómeno ${required}, así que se filtra a él` : undefined}
                      type="button"
                    >
                      <Icon className={cn("size-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-xs", selected && "font-medium")}>{VIEW_LABEL[option]}</span>
                        <span className="text-muted-foreground block truncate text-[10px]">{VIEW_SCOPE[option]}</span>
                      </span>
                      {required ? (
                        <span className={cn("rounded border px-1 font-mono text-[9px]", PHENOMENON_STYLE[required])}>
                          F{required}
                        </span>
                      ) : null}
                    </button>

                    {/* Lo que afina la capa, justo debajo de ella: el nivel en los documentos, la
                        clase de riesgo en las alertas y el grupo en la presencia armada. */}
                    {selected && option === "documentos" ? <LevelSwitch level={level} onLevel={onLevel} /> : null}
                    {selected && option === "alertas" && options.length > 0 ? (
                      <KindSwitch filter={filter} onFilter={onFilter} options={options} />
                    ) : null}
                    {selected && option === "grupos" && options.length > 0 ? (
                      <GroupBars filter={filter} onFilter={onFilter} options={options} />
                    ) : null}
                  </div>
                );
              })}
            </div>
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

/** Un fenómeno del filtro global: nombre completo con la barra abierta, su icono en el riel. */
function FilterButton({
  active,
  label,
  short,
  open,
  icon: Icon,
  dot,
  tone,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly short?: string;
  readonly open: boolean;
  readonly icon: LucideIcon;
  readonly dot?: string;
  /** El color de texto del fenómeno: el icono lo toma al elegirlo. */
  readonly tone?: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={open ? undefined : label}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
        !open && "size-9 justify-center p-0",
        active ? "bg-muted/70" : "hover:bg-muted/40",
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon className={cn("size-4 shrink-0", active ? (tone ?? "text-primary") : "text-muted-foreground")} />
      {open ? (
        <>
          <span className={cn("min-w-0 flex-1 truncate text-left text-xs", active && "font-medium")}>{label}</span>
          {dot ? (
            <span className="text-muted-foreground flex items-center gap-1 font-mono text-[10px]">
              <span className={cn("size-1.5 rounded-full", dot)} />
              {short}
            </span>
          ) : null}
        </>
      ) : null}
    </button>
  );
}

type Option = { readonly value: string; readonly label: string; readonly count: number };

const SEGMENT = "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors";
const segment = (active: boolean) =>
  cn(SEGMENT, active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");

/** Países o departamentos: solo los documentos cambian de nivel, las otras capas miden en el suyo. */
function LevelSwitch({ level, onLevel }: { readonly level: MapLevel; readonly onLevel: (level: MapLevel) => void }) {
  return (
    <div aria-label="Nivel territorial" className="bg-muted/40 my-1 ml-8 flex gap-0.5 rounded-md p-0.5" role="group">
      <button aria-pressed={level === "country"} className={segment(level === "country")} onClick={() => onLevel("country")} title="Países del mundo" type="button">
        <GlobeIcon className="size-3.5" />
        Países
      </button>
      <button aria-pressed={level === "department"} className={segment(level === "department")} onClick={() => onLevel("department")} title="Departamentos de Colombia" type="button">
        <MapIcon className="size-3.5" />
        Departamentos
      </button>
    </div>
  );
}

// El riesgo inminente se lee en rojo y el estructural en el ámbar de F3, como en la franja temporal.
const KIND_DOT: Record<string, string> = { Inminencia: "bg-red-400", Estructural: "bg-f3" };

/** La clase de riesgo: dos valores que no se suman, así que un conmutador y no una lista. */
function KindSwitch({
  options,
  filter,
  onFilter,
}: {
  readonly options: readonly Option[];
  readonly filter: string | null;
  readonly onFilter: (value: string | null) => void;
}) {
  return (
    <div aria-label="Clase de riesgo" className="bg-muted/40 my-1 ml-8 flex gap-0.5 rounded-md p-0.5" role="group">
      <button aria-pressed={filter === null} className={segment(filter === null)} onClick={() => onFilter(null)} type="button">
        Todas
      </button>
      {options.map((option) => (
        <button
          aria-pressed={filter === option.value}
          className={segment(filter === option.value)}
          key={option.value}
          onClick={() => onFilter(filter === option.value ? null : option.value)}
          title={`${option.label}: ${option.count} alertas`}
          type="button"
        >
          <span className={cn("size-1.5 rounded-full", KIND_DOT[option.value])} />
          {option.value === "Inminencia" ? "Inminente" : "Estructural"}
          <span className="font-mono opacity-60">{option.count}</span>
        </button>
      ))}
    </div>
  );
}

const GROUPS_VISIBLE = 5;

/**
 * Los grupos armados como barras: además de elegir uno, se ve cuánto pesa cada uno en la cuenca.
 * Una nube de diez botones obliga a leerlos todos; una lista ordenada con su cifra se escanea.
 */
function GroupBars({
  options,
  filter,
  onFilter,
}: {
  readonly options: readonly Option[];
  readonly filter: string | null;
  readonly onFilter: (value: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const max = Math.max(...options.map((option) => option.count), 1);
  // El elegido siempre a la vista, aunque esté más abajo del corte.
  const shown = expanded
    ? options
    : options.filter((option, index) => index < GROUPS_VISIBLE || option.value === filter);

  return (
    <div className="my-1 ml-8 space-y-0.5">
      <div className="text-muted-foreground flex items-center justify-between px-1 text-[10px]">
        <span>Municipios con presencia</span>
        {filter ? (
          <button className="hover:text-foreground underline-offset-2 hover:underline" onClick={() => onFilter(null)} type="button">
            Ver todos
          </button>
        ) : null}
      </div>
      <ul aria-label="Grupo armado" className="space-y-px">
        {shown.map((option) => {
          const selected = filter === option.value;
          const dimmed = filter !== null && !selected;
          return (
            <li key={option.value}>
              <button
                aria-pressed={selected}
                className={cn(
                  "relative flex w-full items-center gap-2 overflow-hidden rounded px-1.5 py-1 text-left text-[11px] transition-colors",
                  selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  dimmed && "opacity-50",
                )}
                onClick={() => onFilter(selected ? null : option.value)}
                type="button"
              >
                <span
                  aria-hidden
                  className={cn("absolute inset-y-0 left-0 rounded", selected ? "bg-f3/30" : "bg-f3/12")}
                  style={{ width: `${(option.count / max) * 100}%` }}
                />
                <span className="relative min-w-0 flex-1 truncate">{option.label}</span>
                <span className="relative font-mono text-[10px]">{option.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {options.length > GROUPS_VISIBLE ? (
        <button
          aria-expanded={expanded}
          className="text-muted-foreground hover:text-foreground px-1 text-[10px]"
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          {expanded ? "Ver menos" : `Ver los ${options.length}`}
        </button>
      ) : null}
    </div>
  );
}
