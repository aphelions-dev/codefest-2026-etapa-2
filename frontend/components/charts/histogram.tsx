"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, type TooltipContentProps, XAxis, YAxis } from "recharts";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Distribution } from "@/lib/api";
import { PHENOMENA, phenomenonColor } from "@/lib/filters";
import { formatNumber } from "@/lib/format";
import { periodParams, usePeriod } from "@/lib/period";
import { useApi } from "@/lib/use-api";
import { useDocument } from "@/lib/use-document";
import { cn } from "@/lib/utils";

const MEASURES = {
  fragments: { label: "Longitud", axis: "fragmentos por documento", unit: "fragmentos" },
  entities: { label: "Entidades", axis: "entidades distintas por documento", unit: "entidades" },
} as const;

type Measure = keyof typeof MEASURES;

/**
 * Histograma: cómo se reparte una medida entre los documentos (tarea de distribución, B.2.1).
 *
 * **Tramos que doblan** (1, 2-3, 4-7…): la medida tiene una cola larga y con tramos iguales todo
 * caería en la primera barra. **Apilado por fenómeno**, en su color, porque los tres reparten muy
 * distinto: las alertas de F3 son de un fragmento y los informes de F1, de cientos.
 *
 * Una barra abre el documento con el valor más alto de su tramo, que es su evidencia.
 */
export function Histogram({ measure: initial, phenomenon }: { readonly measure?: string; readonly phenomenon: number | null }) {
  const [measure, setMeasure] = useState<Measure>(initial === "entities" ? "entities" : "fragments");
  const [period] = usePeriod();
  const { data, error, loading } = useApi<Distribution>("/metadata/distribution", {
    measure,
    phenomenon: phenomenon ?? undefined,
    ...periodParams(period),
  });
  const { open } = useDocument();
  const meta = MEASURES[measure];
  const series = phenomenon ? [phenomenon] : [1, 2, 3];
  const rows = (data?.bins ?? []).map((bin) => ({ ...bin, ...bin.by_phenomenon }));
  const [q1, median, q3] = data?.quartiles ?? [];

  return (
    <Panel
      source={
        data
          ? `${formatNumber(data.documents)} documentos. Una barra abre el documento con el valor más alto de su tramo.`
          : undefined
      }
      title={`Distribución: ${meta.axis}`}
      unit={
        median !== undefined
          ? `Documentos por tramo. Mediana ${formatNumber(median)} ${meta.unit}; la mitad central, entre ${formatNumber(q1)} y ${formatNumber(q3)}`
          : "Documentos por tramo"
      }
    >
      <div className="flex h-full min-h-56 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div aria-label="Medida" className="bg-muted/50 flex gap-0.5 rounded-md p-0.5" role="group">
            {(Object.keys(MEASURES) as Measure[]).map((option) => (
              <button
                aria-pressed={measure === option}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] transition-colors",
                  measure === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
                key={option}
                onClick={() => setMeasure(option)}
                type="button"
              >
                {MEASURES[option].label}
              </button>
            ))}
          </div>
          {/* Leyenda: el color de cada tramo apilado es el de su fenómeno en todo el tablero. */}
          <ul className="text-muted-foreground ml-auto flex flex-wrap gap-x-3 text-[10px]">
            {series.map((id) => (
              <li className="flex items-center gap-1" key={id}>
                <span className="size-2 rounded-sm" style={{ backgroundColor: phenomenonColor(id) }} />
                F{id} · {PHENOMENA[id - 1].label}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-h-0 flex-1">
          {!data || rows.length === 0 ? (
            <PanelState empty="Sin documentos para este filtro" error={error} loading={loading} />
          ) : (
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={rows} margin={{ left: 0, right: 8, top: 6, bottom: 14 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  label={{ value: meta.axis, position: "insideBottom", offset: -8, fontSize: 10, fill: "var(--muted-foreground)" }}
                  stroke="var(--muted-foreground)"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                />
                <YAxis allowDecimals={false} axisLine={false} stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} tickLine={false} width={40} />
                <Tooltip content={(props) => <BinTooltip {...props} unit={meta.unit} />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                {series.map((id) => (
                  <Bar
                    className="cursor-pointer"
                    dataKey={String(id)}
                    fill={phenomenonColor(id)}
                    fillOpacity={0.9}
                    key={id}
                    maxBarSize={48}
                    onClick={(item: { payload?: (typeof rows)[number] }) => {
                      const trace = item.payload?.trace;
                      if (trace) open(trace.doc_id, trace.chunk_id);
                    }}
                    stackId="documents"
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Panel>
  );
}

function BinTooltip({ active, payload, label, unit }: TooltipContentProps & { readonly unit: string }) {
  const entries = (payload ?? []).filter((entry) => Number(entry.value) > 0);
  if (!active || entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + Number(entry.value), 0);
  const trace = (entries[0]?.payload as { trace?: { doc_id: string } } | undefined)?.trace;
  return (
    <div className="bg-popover/95 min-w-48 space-y-1 rounded-lg border px-2.5 py-2 text-[11px] shadow-xl shadow-black/40 backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium">
          {label} {unit}
        </span>
        <span className="text-muted-foreground font-mono">{formatNumber(total)} docs</span>
      </div>
      <ul className="space-y-0.5">
        {entries.map((entry) => (
          <li className="text-muted-foreground flex items-center gap-1.5" key={String(entry.dataKey)}>
            <span className="size-2 rounded-sm" style={{ backgroundColor: entry.color }} />
            <span className="flex-1">F{String(entry.dataKey)}</span>
            <span className="text-foreground font-mono">{entry.value}</span>
          </li>
        ))}
      </ul>
      {trace ? <div className="text-muted-foreground/70 border-t pt-1 text-[10px]">Clic: abrir {trace.doc_id}</div> : null}
    </div>
  );
}
