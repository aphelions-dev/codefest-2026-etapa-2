"use client";

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";

import { IconButton } from "@/components/icon-button";
import { GLASS } from "@/components/map/panel";
import type { Timeline as TimelineData } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { phenomenonColor } from "@/lib/filters";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

// Tonos del color del fenómeno, del más al menos intenso: las fuentes de un mismo fenómeno se leen
// como variantes de lo mismo, no como categorías sin relación entre sí. Es opacidad y no un sufijo
// hexadecimal porque el color llega como `var(--f2)`, y a una variable CSS no se le concatena alfa.
const SHADES = [1, 0.74, 0.54, 0.38, 0.26];
const OTHERS = "#6b6b6b";

/**
 * Documentos publicados por año, apilados por la fuente que los publicó.
 *
 * **Barras y no un área**: los datos son un conteo por año, y una recta entre dos años dibuja un
 * crecimiento continuo que nadie midió. **Apiladas por observatorio** porque el total solo no
 * distingue un año que creció porque publicaron todas las fuentes de otro que creció porque una
 * sola publicó un lote: son dos lecturas distintas y el tablero tiene que dejar ver cuál es.
 *
 * Con una entidad seleccionada se superpone su propia serie, para distinguir un evento aislado de
 * uno que reaparece a lo largo del corpus.
 */
export function TimelineStrip({
  phenomenon,
  entity,
  open,
  onToggle,
}: {
  readonly phenomenon: number | null;
  readonly entity?: string;
  readonly open: boolean;
  readonly onToggle: () => void;
}) {
  const { data, error, loading } = useApi<TimelineData>("/timeline", {
    phenomenon: phenomenon ?? undefined,
  });
  const { data: focused } = useApi<TimelineData>(entity ? "/timeline" : null, {
    phenomenon: phenomenon ?? undefined,
    entity,
  });
  const color = phenomenonColor(phenomenon);
  const empty = data !== null && data.points.length === 0;

  const series = data?.series ?? [];
  const shadeOf = (source: string, index: number) =>
    source === "Otros" ? { fill: OTHERS, opacity: 1 } : { fill: color, opacity: SHADES[index] ?? 0.2 };

  // Una fila por año con una columna por fuente, más la serie de la entidad si la hay.
  const byYear = new Map((focused?.points ?? []).map((point) => [point.year, point.total]));
  const rows = (data?.points ?? []).map((point) => ({
    year: point.year,
    entity: byYear.get(point.year) ?? 0,
    ...point.sources,
  }));
  const appearances = (focused?.points ?? []).filter((point) => point.total > 0).length;

  return (
    <section className={cn(GLASS, "border-border/60 border-t")}>
      <header className="flex items-center gap-2 px-3 py-1.5">
        <h2 className="shrink-0 text-[12px] font-medium">Documentos publicados por año</h2>
        {entity && focused ? (
          <span className="text-primary shrink-0 text-[11px]">
            · {entity.replaceAll("-", " ")} reaparece en {appearances}{" "}
            {appearances === 1 ? "año" : "años"}
          </span>
        ) : null}
        {data ? (
          <span className="text-muted-foreground min-w-0 truncate text-[11px]">
            {empty
              ? `· ninguno de los ${formatNumber(data.total_documents)} documentos de este filtro trae fecha en la metadata de su fuente, así que no hay serie que mostrar`
              : `· ${formatNumber(data.dated_documents)} de ${formatNumber(data.total_documents)} documentos tienen fecha en la metadata de su fuente · apilado por observatorio`}
          </span>
        ) : null}
        {!empty ? (
          <div className="ml-auto">
            <IconButton
              label={open ? "Plegar la línea de tiempo" : "Desplegar la línea de tiempo"}
              onClick={onToggle}
              side="top"
            >
              {open ? <ChevronDownIcon className="size-4" /> : <ChevronUpIcon className="size-4" />}
            </IconButton>
          </div>
        ) : null}
      </header>

      {open && !empty ? (
        <div className="flex h-32 gap-3 px-2 pb-2">
          {!data ? (
            <p className="text-muted-foreground grid h-full w-full place-items-center px-6 text-center text-[11px]">
              {loading ? "Cargando…" : error ? `No se pudo cargar: ${error}` : "Sin datos"}
            </p>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <ResponsiveContainer height="100%" width="100%">
                  <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="year" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <YAxis
                      allowDecimals={false}
                      stroke="var(--muted-foreground)"
                      tick={{ fontSize: 11 }}
                      width={34}
                    />
                    <Tooltip
                      content={(props) => <YearTooltip {...props} />}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    {series.map((source, index) => (
                      <Bar
                        dataKey={source}
                        fill={shadeOf(source, index).fill}
                        fillOpacity={shadeOf(source, index).opacity}
                        key={source}
                        maxBarSize={30}
                        stackId="docs"
                      />
                    ))}
                    {/* Los puntos marcan cada año en que la entidad reaparece en el corpus. */}
                    {entity ? (
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

              {/* Leyenda: sin ella, el color de cada tramo de la barra habría que adivinarlo. */}
              <ul className="w-40 shrink-0 space-y-0.5 overflow-y-auto pt-1 text-[10px]">
                {series.map((source, index) => (
                  <li className="text-muted-foreground flex items-center gap-1.5" key={source}>
                    <span
                      className="size-2 shrink-0 rounded-sm"
                      style={{
                        backgroundColor: shadeOf(source, index).fill,
                        opacity: shadeOf(source, index).opacity,
                      }}
                    />
                    <span className="truncate" title={source.replaceAll("_", " ")}>
                      {source.replaceAll("_", " ")}
                    </span>
                  </li>
                ))}
                {entity ? (
                  <li className="text-foreground flex items-center gap-1.5">
                    <span className="bg-foreground size-2 shrink-0 rounded-full" />
                    <span className="truncate">{entity.replaceAll("-", " ")}</span>
                  </li>
                ) : null}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

/** El año con su total y cada fuente de mayor a menor, con su peso en el año. */
function YearTooltip({ active, payload, label }: TooltipContentProps) {
  const entries = (payload ?? []).filter((entry) => Number(entry.value) > 0);
  if (!active || entries.length === 0) return null;
  // La serie de la entidad no suma al total del año: es la misma cifra vista por otro corte.
  const stacked = entries.filter((entry) => entry.dataKey !== "entity");
  const total = stacked.reduce((sum, entry) => sum + Number(entry.value), 0);

  return (
    <div className="bg-popover/95 min-w-56 space-y-1 rounded-lg border px-2.5 py-2 text-[11px] shadow-lg backdrop-blur-md">
      <div className="text-xs font-medium">
        {label} · {formatNumber(total)} documentos
      </div>
      <ul className="space-y-0.5">
        {[...entries]
          .sort((a, b) => Number(b.value) - Number(a.value))
          .map((entry) => (
            <li className="text-muted-foreground flex items-center gap-1.5" key={String(entry.dataKey)}>
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: entry.color, opacity: entry.payload?.fillOpacity ?? 1 }}
              />
              <span className="flex-1 truncate">
                {String(entry.dataKey) === "entity"
                  ? "de la entidad"
                  : String(entry.dataKey).replaceAll("_", " ")}
              </span>
              <span className="text-foreground font-mono">{entry.value}</span>
              <span className="w-9 text-right font-mono">
                {total ? Math.round((Number(entry.value) / total) * 100) : 0}%
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
