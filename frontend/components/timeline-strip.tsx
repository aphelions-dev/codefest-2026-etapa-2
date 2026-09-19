"use client";

import { ChevronDownIcon, ChevronUpIcon, InfoIcon, XIcon } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import { GLASS } from "@/components/map/panel";
import { Slider } from "@/components/ui/slider";
import { Tooltip as Hint, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Alerts, Timeline as TimelineData } from "@/lib/api";
import { PHENOMENA, phenomenonColor } from "@/lib/filters";
import { formatNumber } from "@/lib/format";
import type { MapView } from "@/lib/map-layers";
import {
  currentMonth,
  isActive,
  lastMonths,
  monthIndex,
  monthOf,
  type Period,
  periodLabel,
  usePeriod,
  wholeYear,
} from "@/lib/period";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

// Tonos del color del fenómeno, del más al menos intenso: las fuentes de un mismo fenómeno se leen
// como variantes de lo mismo, no como categorías sin relación entre sí. Es opacidad y no un sufijo
// hexadecimal porque el color llega como `var(--f2)`, y a una variable CSS no se le concatena alfa.
const SHADES = [1, 0.74, 0.54, 0.38, 0.26];
const OTHERS = "#6b6b6b";
const IMMINENT = "#f87171";
// Cuánto se apaga un año que queda fuera del periodo: se sigue viendo, para dar contexto.
const OUTSIDE = 0.22;
// Ancho del eje Y y margen derecho del gráfico: el deslizador se alinea con el área de trazado.
const AXIS = 34;
const RIGHT = 8;

const PRESETS: readonly { readonly label: string; readonly title: string; readonly months: number }[] = [
  { label: "12 m", title: "Últimos 12 meses", months: 12 },
  { label: "24 m", title: "Últimos 24 meses", months: 24 },
  { label: "5 años", title: "Últimos 5 años", months: 60 },
];

/**
 * Documentos publicados por año y el control del periodo, el filtro global temporal.
 *
 * **Barras y no un área**: los datos son un conteo por año, y una recta entre dos años dibuja un
 * crecimiento continuo que nadie midió. Con los tres fenómenos se apilan **por fenómeno**, cada
 * uno en su color (anexo B.5.1); con uno solo, **por observatorio**, porque el total no distingue
 * un año en que publicaron todas las fuentes de otro en que una sola publicó un lote.
 *
 * El periodo se elige aquí porque aquí se ve qué hay en cada tramo: un atajo, el deslizador por
 * meses o un clic en la barra de un año. Lo que queda fuera se apaga en vez de desaparecer.
 *
 * Con una entidad seleccionada se superpone su propia serie, para distinguir un evento aislado de
 * uno que reaparece a lo largo del corpus.
 */
export function TimelineStrip({
  phenomenon,
  entity,
  view,
  filter,
  open,
  onToggle,
}: {
  readonly phenomenon: number | null;
  readonly entity?: string;
  /** La serie sigue a la vista del mapa: con alertas arriba, abajo van alertas y no documentos. */
  readonly view: MapView;
  readonly filter: string | null;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const [period, setPeriod] = usePeriod();
  // Mientras se arrastra, el periodo vive aquí; se confirma al soltar, que es cuando se consulta.
  const [dragging, setDragging] = useState<readonly [number, number] | null>(null);

  // Con el mapa en alertas, la franja mide alertas emitidas: una serie de documentos bajo un mapa
  // de alertas son dos cosas distintas presentadas como si fueran la misma.
  const showAlerts = view === "alertas";
  const alerts = useApi<Alerts>(showAlerts ? "/alerts" : null, { kind: filter ?? undefined });

  const { data, error, loading } = useApi<TimelineData>(showAlerts ? null : "/timeline", {
    phenomenon: phenomenon ?? undefined,
  });
  const { data: focused } = useApi<TimelineData>(entity && !showAlerts ? "/timeline" : null, {
    phenomenon: phenomenon ?? undefined,
    entity,
  });
  const color = phenomenonColor(phenomenon);

  const series = showAlerts ? (filter ? [filter] : ["Inminencia", "Estructural"]) : (data?.series ?? []);
  const shadeOf = (source: string, index: number) => {
    if (source === "Inminencia") return { fill: IMMINENT, opacity: 1 };
    if (source === "Otros") return { fill: OTHERS, opacity: 1 };
    const own = /^F([123])$/.exec(source);
    if (own) return { fill: phenomenonColor(Number(own[1])), opacity: 0.9 };
    return { fill: color, opacity: SHADES[index] ?? 0.2 };
  };

  // Una fila por año con una columna por serie, más la de la entidad si la hay.
  const byYear = new Map((focused?.points ?? []).map((point) => [point.year, point.total]));
  const raw: Record<string, number>[] = showAlerts
    ? (alerts.data?.years ?? []).map((year) => ({
        year: year.year,
        Inminencia: year.imminent,
        Estructural: year.structural,
      }))
    : (data?.points ?? []).map((point) => ({
        year: point.year,
        entity: byYear.get(point.year) ?? 0,
        ...point.sources,
      }));
  const rows = continuous(raw);
  const empty = (showAlerts ? alerts.data : data) !== null && rows.length === 0;
  const appearances = (focused?.points ?? []).filter((point) => point.total > 0).length;

  // El dominio del deslizador: de enero del primer año con datos hasta el mes en curso.
  const first = rows[0]?.year;
  const min = first ? first * 12 : monthIndex(currentMonth()) - 120;
  const max = Math.max(monthIndex(currentMonth()), (rows.at(-1)?.year ?? 0) * 12 + 11);
  const range: readonly [number, number] = dragging ?? [
    period.from ? Math.max(min, monthIndex(period.from)) : min,
    period.to ? Math.min(max, monthIndex(period.to)) : max,
  ];
  const shown: Period = { from: monthOf(range[0]), to: monthOf(range[1]) };
  const active = dragging !== null || isActive(period);

  const commit = ([start, end]: number[]) => {
    setDragging(null);
    setPeriod(start <= min && end >= max ? { from: null, to: null } : { from: monthOf(start), to: monthOf(end) });
  };

  // Un año cuenta como dentro si el periodo lo toca: se apaga solo lo que queda del todo fuera.
  const inside = (year: number) => !active || (year * 12 + 11 >= range[0] && year * 12 <= range[1]);
  const onYear = (year: number) => {
    const same = period.from === `${year}-01` && period.to === `${year}-12`;
    setPeriod(same ? { from: null, to: null } : wholeYear(year));
  };

  const loadState = showAlerts
    ? { loading: alerts.loading, error: alerts.error }
    : { loading, error };

  return (
    <section className={cn(GLASS, "border-border/60 border-t")}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          {/* El título pliega y despliega: plegada, la franja entera es su propio mando. */}
          <h2 className="shrink-0 text-[12px] font-medium">
            <button
              aria-expanded={open}
              className="hover:text-primary flex items-center gap-1 transition-colors"
              onClick={onToggle}
              type="button"
            >
              {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronUpIcon className="size-3.5" />}
              {showAlerts ? "Alertas emitidas por año" : "Documentos por año"}
            </button>
          </h2>
          <Coverage alerts={showAlerts ? alerts.data : null} timeline={showAlerts ? null : data} />
          {/* La presencia armada no está fechada: la serie de abajo no es la del mapa, y se dice. */}
          {view === "grupos" ? (
            <span className="text-muted-foreground truncate text-[11px]" title="Amazon Underworld no fecha la presencia de cada grupo, así que no hay serie temporal de la capa del mapa. Se muestran los documentos del fenómeno 3.">
              · la presencia armada no tiene fecha; documentos de F3
            </span>
          ) : null}
          {entity && focused ? (
            <span className="text-primary truncate text-[11px]">
              · {entity.replaceAll("-", " ")} en {appearances} {appearances === 1 ? "año" : "años"}
            </span>
          ) : null}
        </div>

        {/* El periodo: atajos, lo elegido y cómo quitarlo. */}
        <div className="ml-auto flex items-center gap-1.5">
          <div aria-label="Periodo" className="bg-muted/50 flex gap-0.5 rounded-md p-0.5" role="group">
            <PresetButton active={!isActive(period)} onClick={() => setPeriod({ from: null, to: null })} title="Todo el corpus">
              Todo
            </PresetButton>
            {PRESETS.map((preset) => {
              const target = lastMonths(preset.months);
              return (
                <PresetButton
                  active={period.from === target.from && period.to === target.to}
                  key={preset.label}
                  onClick={() => setPeriod(target)}
                  title={preset.title}
                >
                  {preset.label}
                </PresetButton>
              );
            })}
          </div>
          {active ? (
            <button
              className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors"
              onClick={() => setPeriod({ from: null, to: null })}
              title="Quitar el filtro de periodo"
              type="button"
            >
              {periodLabel(shown)}
              <XIcon className="size-3" />
            </button>
          ) : null}
          <PrecisionNote />
        </div>
      </header>

      {open && !empty ? (
        <div className="flex gap-3 px-2 pb-2">
          {rows.length === 0 ? (
            <p className="text-muted-foreground grid h-28 w-full place-items-center text-[11px]">
              {loadState.loading ? "Cargando…" : loadState.error ? `No se pudo cargar: ${loadState.error}` : "Sin datos"}
            </p>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <div className="h-28">
                  <ResponsiveContainer height="100%" width="100%">
                    <ComposedChart data={rows} margin={{ left: 0, right: RIGHT, top: 6, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="year"
                        interval="preserveStartEnd"
                        minTickGap={18}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        axisLine={false}
                        stroke="var(--muted-foreground)"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        width={AXIS}
                      />
                      <Tooltip
                        content={(props) => <YearTooltip {...props} unit={showAlerts ? "alertas" : "documentos"} />}
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                      />
                      {series.map((source, index) => (
                        <Bar
                          className="cursor-pointer"
                          dataKey={source}
                          fill={shadeOf(source, index).fill}
                          key={source}
                          maxBarSize={28}
                          onClick={(item: { payload?: { year?: number } }) => {
                            if (item.payload?.year) onYear(item.payload.year);
                          }}
                          stackId="docs"
                        >
                          {rows.map((row) => (
                            <Cell
                              fillOpacity={shadeOf(source, index).opacity * (inside(row.year) ? 1 : OUTSIDE)}
                              key={row.year}
                            />
                          ))}
                        </Bar>
                      ))}
                      {/* Los puntos marcan cada año en que la entidad reaparece en el corpus. */}
                      {entity && !showAlerts ? (
                        <Line
                          dataKey="entity"
                          dot={{ r: 2.5, fill: "var(--foreground)" }}
                          stroke="var(--foreground)"
                          strokeWidth={1.5}
                          type="monotone"
                        />
                      ) : null}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* El deslizador, alineado con el área de trazado: cada mes cae bajo su año. */}
                <div className="flex h-5 items-center" style={{ paddingLeft: AXIS, paddingRight: RIGHT }}>
                  <Slider
                    aria-label="Periodo por meses"
                    max={max}
                    min={min}
                    minStepsBetweenThumbs={0}
                    onValueChange={([start, end]) => setDragging([start, end])}
                    onValueCommit={commit}
                    step={1}
                    value={[...range]}
                  />
                </div>
              </div>

              {/* Leyenda: sin ella, el color de cada tramo de la barra habría que adivinarlo. */}
              <ul className="w-44 shrink-0 space-y-0.5 overflow-y-auto pt-1 text-[10px]">
                {series.map((source, index) => (
                  <li className="text-muted-foreground flex items-center gap-1.5" key={source}>
                    <span
                      className="size-2 shrink-0 rounded-sm"
                      style={{
                        backgroundColor: shadeOf(source, index).fill,
                        opacity: shadeOf(source, index).opacity,
                      }}
                    />
                    <span className="truncate" title={seriesLabel(source)}>
                      {seriesLabel(source)}
                    </span>
                  </li>
                ))}
                {entity && !showAlerts ? (
                  <li className="text-foreground flex items-center gap-1.5">
                    <span className="bg-foreground size-2 shrink-0 rounded-full" />
                    <span className="truncate">{entity.replaceAll("-", " ")}</span>
                  </li>
                ) : null}
                <li className="text-muted-foreground/70 pt-1 leading-snug">Clic en un año para filtrarlo</li>
              </ul>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** Años sin datos como ceros: un eje temporal con huecos acerca años que no son vecinos. */
function continuous(rows: Record<string, number>[]) {
  if (rows.length === 0) return [];
  const byYear = new Map(rows.map((row) => [row.year, row]));
  const filled: (Record<string, number> & { year: number })[] = [];
  for (let year = rows[0].year; year <= rows[rows.length - 1].year; year++) {
    filled.push({ ...(byYear.get(year) ?? {}), year });
  }
  return filled;
}

function seriesLabel(source: string) {
  if (source === "Inminencia") return "Riesgo inminente";
  if (source === "Estructural") return "Riesgo estructural";
  const own = /^F([123])$/.exec(source);
  if (own) return `${source} · ${PHENOMENA[Number(own[1]) - 1].label}`;
  return source.replaceAll("_", " ");
}

function PresetButton({
  active,
  onClick,
  title,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly title: string;
  readonly children: string;
}) {
  return (
    <button
      aria-pressed={active}
      className={cn(
        "rounded px-1.5 py-0.5 text-[11px] transition-colors",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

/** Cuántos documentos tienen fecha, detrás de un ⓘ en vez de una frase que se trunca. */
function Coverage({ timeline, alerts }: { readonly timeline: TimelineData | null; readonly alerts: Alerts | null }) {
  const text = alerts
    ? `${formatNumber(alerts.alerts)} alertas de la Defensoría del Pueblo${
        alerts.since ? `, emitidas entre ${alerts.since} y ${alerts.until}` : ""
      }. Apilado por clase de riesgo.`
    : timeline
      ? `${formatNumber(timeline.dated_documents)} de ${formatNumber(timeline.total_documents)} documentos traen fecha en la metadata de su fuente; los demás no entran en la serie. ${
          timeline.phenomenon === null ? "Apilado por fenómeno." : "Apilado por observatorio."
        }`
      : null;
  if (!text) return null;
  return (
    <span className="text-muted-foreground shrink-0 font-mono text-[10px]">
      {alerts
        ? formatNumber(alerts.alerts)
        : timeline
          ? `${formatNumber(timeline.dated_documents)}/${formatNumber(timeline.total_documents)}`
          : null}
      <Hint>
        <TooltipTrigger asChild>
          <button aria-label="Qué cubre la serie" className="hover:text-foreground ml-1 align-middle" type="button">
            <InfoIcon className="inline size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-left leading-relaxed" side="top">
          {text}
        </TooltipContent>
      </Hint>
    </span>
  );
}

/** Lo que el filtro por meses puede y no puede afirmar, a un gesto y no en un párrafo fijo. */
function PrecisionNote() {
  return (
    <Hint>
      <TooltipTrigger asChild>
        <button
          aria-label="Cómo se aplica el periodo"
          className="text-muted-foreground hover:text-foreground rounded p-0.5"
          type="button"
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm text-left leading-relaxed" side="top">
        El periodo recorta el mapa, el detalle del territorio y los componentes. Un documento entra cuando
        su fecha conocida cae entera dentro: la mayoría solo trae el año, y esos entran únicamente si el
        periodo cubre su año completo. Las alertas traen el día de emisión. La presencia armada no está
        fechada y no se recorta.
      </TooltipContent>
    </Hint>
  );
}

/** El año con su total y cada serie de mayor a menor, con su peso en el año. */
function YearTooltip({ active, payload, label, unit }: TooltipContentProps & { readonly unit: string }) {
  const entries = (payload ?? []).filter((entry) => Number(entry.value) > 0);
  if (!active || entries.length === 0) return null;
  // La serie de la entidad no suma al total del año: es la misma cifra vista por otro corte.
  const stacked = entries.filter((entry) => entry.dataKey !== "entity");
  const total = stacked.reduce((sum, entry) => sum + Number(entry.value), 0);

  return (
    <div className="bg-popover/95 min-w-52 space-y-1 rounded-lg border px-2.5 py-2 text-[11px] shadow-xl shadow-black/40 backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-muted-foreground font-mono">
          {formatNumber(total)} {unit}
        </span>
      </div>
      <ul className="space-y-0.5">
        {[...entries]
          .sort((a, b) => Number(b.value) - Number(a.value))
          .map((entry) => (
            <li className="text-muted-foreground flex items-center gap-1.5" key={String(entry.dataKey)}>
              <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: entry.color }} />
              <span className="flex-1 truncate">
                {String(entry.dataKey) === "entity" ? "de la entidad" : seriesLabel(String(entry.dataKey))}
              </span>
              <span className="text-foreground font-mono">{entry.value}</span>
              <span className="w-8 text-right font-mono">
                {total ? Math.round((Number(entry.value) / total) * 100) : 0}%
              </span>
            </li>
          ))}
      </ul>
      <div className="text-muted-foreground/70 border-t pt-1 text-[10px]">Clic para filtrar {label}</div>
    </div>
  );
}
