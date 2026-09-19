"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Timeline as TimelineData } from "@/lib/api";
import { phenomenonColor } from "@/lib/filters";
import { useApi } from "@/lib/use-api";

/**
 * Evolución temporal por año. Dice sobre cuántos documentos se puede afirmar algo: si el corpus
 * no trae fecha, el panel lo declara en vez de repartir los documentos y falsear la serie.
 */
export function Timeline({ phenomenon, entity }: { readonly phenomenon: number | null; readonly entity?: string }) {
  const { data, error, loading } = useApi<TimelineData>("/timeline", {
    phenomenon: phenomenon ?? undefined,
    entity,
  });
  const color = phenomenonColor(phenomenon);

  return (
    <Panel
      source={
        data
          ? `${data.dated_documents.toLocaleString("es")} de ${data.total_documents.toLocaleString("es")} documentos tienen fecha en la metadata de su fuente`
          : undefined
      }
      title="Documentos publicados por año"
      unit="Documentos con fecha conocida"
    >
      {!data || data.points.length === 0 ? (
        <PanelState
          empty={
            data
              ? `Ningún documento de este filtro tiene fecha en la metadata de su fuente, así que no hay serie que mostrar (${data.total_documents.toLocaleString("es")} documentos sin fechar).`
              : "Sin datos"
          }
          error={error}
          loading={loading}
        />
      ) : (
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart data={data.points} margin={{ left: 0, right: 8, top: 8 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="year" stroke="var(--color-muted)" tick={{ fontSize: 11 }} />
            <YAxis stroke="var(--color-muted)" tick={{ fontSize: 11 }} width={34} />
            <Tooltip
              contentStyle={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [Number(value).toLocaleString("es"), "documentos"] as [string, string]}
            />
            <Area dataKey="documents" fill={color} fillOpacity={0.22} stroke={color} type="monotone" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
