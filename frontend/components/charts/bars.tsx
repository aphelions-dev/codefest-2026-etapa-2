"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Breakdown } from "@/lib/api";
import { phenomenonColor } from "@/lib/filters";
import { useApi } from "@/lib/use-api";

const FIELD_LABEL: Record<string, string> = {
  phenomenon: "fenómeno",
  observatory: "observatorio",
  language: "idioma",
  format: "formato",
};

/** Comparacion y composicion sobre la metadata. Barras porque la tarea es comparar cantidades. */
export function Bars({ by, phenomenon }: { readonly by: string; readonly phenomenon: number | null }) {
  const { data, error, loading } = useApi<Breakdown>("/metadata/breakdown", {
    by,
    phenomenon: phenomenon ?? undefined,
  });

  return (
    <Panel
      title={`Documentos por ${FIELD_LABEL[by] ?? by}`}
      unit="Documentos distintos del corpus"
      source={data ? `${data.total_documents.toLocaleString("es")} documentos, ${data.total_fragments.toLocaleString("es")} fragmentos` : undefined}
    >
      {!data ? (
        <PanelState loading={loading} error={error} empty="Sin datos" />
      ) : (
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={data.buckets} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="var(--color-border)" />
            <XAxis stroke="var(--color-muted)" tick={{ fontSize: 11 }} type="number" />
            <YAxis dataKey="label" stroke="var(--color-muted)" tick={{ fontSize: 11 }} type="category" width={116} />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [Number(value).toLocaleString("es"), "documentos"] as [string, string]}
            />
            <Bar dataKey="documents" fill={phenomenonColor(phenomenon)} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
