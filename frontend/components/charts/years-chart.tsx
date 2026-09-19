"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Timeline } from "@/lib/api";
import { PHENOMENA, phenomenonColor } from "@/lib/filters";
import { useApi } from "@/lib/use-api";
import { useDocument } from "@/lib/use-document";

// Tonos del color del fenómeno para las fuentes de un mismo fenómeno, como en la franja temporal.
const SHADES = [1, 0.74, 0.54, 0.38, 0.26, 0.2];

/**
 * La línea de tiempo, en la respuesta del chat: documentos por año, apilados por fenómeno —o por
 * fuente con un fenómeno elegido—, con los mismos colores que la franja del tablero. Una barra
 * abre un documento de ese año.
 */
export function YearsChart({ phenomenon, entity }: { readonly phenomenon: number | null; readonly entity?: string }) {
  const { data, error, loading } = useApi<Timeline>("/timeline", {
    phenomenon: phenomenon ?? undefined,
    entity,
  });
  const { open } = useDocument();
  const rows = (data?.points ?? []).map((point) => ({ year: point.year, trace: point.trace, ...point.sources }));
  const color = (source: string, index: number) => {
    const own = /^F([123])$/.exec(source);
    return own ? { fill: phenomenonColor(Number(own[1])), opacity: 0.9 } : { fill: phenomenonColor(phenomenon), opacity: SHADES[index] ?? 0.2 };
  };
  const label = (source: string) => {
    const own = /^F([123])$/.exec(source);
    return own ? `${source} · ${PHENOMENA[Number(own[1]) - 1].label}` : source.replaceAll("_", " ");
  };

  return (
    <Panel
      source={
        data
          ? `${data.dated_documents} de ${data.total_documents} documentos tienen fecha en la metadata de su fuente. Una barra abre un documento de ese año.`
          : undefined
      }
      title={entity ? `Documentos por año que nombran ${entity.replaceAll("-", " ")}` : "Documentos publicados por año"}
      unit={data?.phenomenon === null ? "Apilado por fenómeno" : "Apilado por fuente"}
    >
      {rows.length === 0 ? (
        <PanelState empty="Sin documentos fechados con estos filtros" error={error} loading={loading} />
      ) : (
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={rows} margin={{ left: 0, right: 8, top: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} width={32} />
            <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
            <Legend formatter={(value) => label(String(value))} iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            {(data?.series ?? []).map((source, index) => (
              <Bar
                className="cursor-pointer"
                dataKey={source}
                fill={color(source, index).fill}
                fillOpacity={color(source, index).opacity}
                key={source}
                onClick={(item: { payload?: { trace?: { doc_id: string; chunk_id: string } } }) => {
                  const trace = item.payload?.trace;
                  if (trace) open(trace.doc_id, trace.chunk_id);
                }}
                stackId="years"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
