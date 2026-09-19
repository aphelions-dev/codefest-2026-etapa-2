"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Breakdown } from "@/lib/api";
import { phenomenonColor } from "@/lib/filters";
import { type Period, periodParams, usePeriod } from "@/lib/period";
import { useApi } from "@/lib/use-api";
import { useDocument } from "@/lib/use-document";

const FIELD_LABEL: Record<string, string> = {
  phenomenon: "fenómeno",
  observatory: "observatorio",
  language: "idioma",
  format: "formato",
};

/** Comparacion y composicion sobre la metadata. Barras porque la tarea es comparar cantidades. */
export function Bars({
  by,
  phenomenon,
  period: own,
}: {
  readonly by: string;
  readonly phenomenon: number | null;
  /** El periodo que declaró el agente; sin él, el filtro global de la URL. */
  readonly period?: Period;
}) {
  const [global] = usePeriod();
  const period = own ?? global;
  const { open } = useDocument();
  const { data, error, loading } = useApi<Breakdown>("/metadata/breakdown", {
    by,
    phenomenon: phenomenon ?? undefined,
    ...periodParams(period),
  });

  return (
    <Panel
      title={`Documentos por ${FIELD_LABEL[by] ?? by}`}
      unit="Documentos distintos del corpus"
      source={
        data
          ? `${data.total_documents.toLocaleString("es")} documentos, ${data.total_fragments.toLocaleString("es")} fragmentos. Una barra abre uno de sus documentos.`
          : undefined
      }
    >
      {!data ? (
        <PanelState loading={loading} error={error} empty="Sin datos" />
      ) : (
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={data.buckets} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} type="number" />
            <YAxis dataKey="label" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} type="category" width={116} />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [Number(value).toLocaleString("es"), "documentos"] as [string, string]}
            />
            <Bar
              className="cursor-pointer"
              dataKey="documents"
              fill={phenomenonColor(phenomenon)}
              onClick={(item: { payload?: { trace?: { doc_id: string; chunk_id: string } } }) => {
                const trace = item.payload?.trace;
                if (trace) open(trace.doc_id, trace.chunk_id);
              }}
              radius={[0, 3, 3, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
