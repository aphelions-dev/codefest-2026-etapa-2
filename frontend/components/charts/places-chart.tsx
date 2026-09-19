"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Alerts, Places, Presence } from "@/lib/api";
import { phenomenonColor } from "@/lib/filters";
import { formatNumber } from "@/lib/format";
import { type Period, periodParams } from "@/lib/period";
import { useApi } from "@/lib/use-api";
import { useDocument } from "@/lib/use-document";

const TOP = 10;

type Row = { readonly name: string; readonly value: number; readonly trace: { doc_id: string; chunk_id: string } };

/**
 * El mapa, en la respuesta del chat: los territorios que encabezan la capa que eligió el agente,
 * como barras. Un coroplético en una tarjeta de chat no se lee; el ranking sí, y trae la misma
 * cifra y la misma traza que el mapa del tablero, porque sale del mismo endpoint.
 */
export function PlacesChart({
  view,
  level,
  phenomenon,
  period,
}: {
  readonly view: string;
  readonly level: string;
  readonly phenomenon: number | null;
  readonly period: Period;
}) {
  const dated = periodParams(period);
  const places = useApi<Places>(view === "documentos" ? "/places" : null, {
    level,
    phenomenon: phenomenon ?? undefined,
    limit: TOP,
    ...dated,
  });
  const alerts = useApi<Alerts>(view === "alertas" ? "/alerts" : null, { ...dated });
  const presence = useApi<Presence>(view === "grupos" ? "/presence" : null, {});
  const { open } = useDocument();

  const rows: Row[] =
    view === "alertas"
      ? (alerts.data?.features ?? []).map((f) => ({ name: f.properties.name, value: f.properties.alerts, trace: f.properties.trace }))
      : view === "grupos"
        ? [...(presence.data?.features ?? [])]
            .sort((a, b) => b.properties.groups.length - a.properties.groups.length)
            .map((f) => ({ name: f.properties.admin2, value: f.properties.groups.length, trace: f.properties.trace }))
        : (places.data?.features ?? []).map((f) => ({ name: f.properties.name, value: f.properties.documents, trace: f.properties.trace }));
  const shown = rows.slice(0, TOP);
  const state = view === "alertas" ? alerts : view === "grupos" ? presence : places;
  const unit = view === "alertas" ? "alertas" : view === "grupos" ? "grupos armados" : "documentos";

  return (
    <Panel
      source="Una barra abre el fragmento que sustenta la cifra."
      title={
        view === "alertas"
          ? "Departamentos con más alertas tempranas"
          : view === "grupos"
            ? "Municipios con más grupos armados"
            : level === "department"
              ? "Departamentos que más nombra el corpus"
              : "Países que más nombra el corpus"
      }
      unit={`${unit[0].toUpperCase()}${unit.slice(1)} por territorio, los ${TOP} primeros`}
    >
      {shown.length === 0 ? (
        <PanelState empty="Ningún territorio con estos filtros" error={state.error} loading={state.loading} />
      ) : (
        <ResponsiveContainer height="100%" width="100%">
          <BarChart data={shown} layout="vertical" margin={{ left: 4, right: 16 }}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis allowDecimals={false} stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} type="number" />
            <YAxis dataKey="name" interval={0} stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} type="category" width={110} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
              formatter={(value) => [formatNumber(Number(value)), unit] as [string, string]}
            />
            <Bar
              className="cursor-pointer"
              dataKey="value"
              fill={phenomenonColor(view === "documentos" ? phenomenon : 3)}
              onClick={(item: { payload?: Row }) => item.payload && open(item.payload.trace.doc_id, item.payload.trace.chunk_id)}
              radius={[0, 3, 3, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Panel>
  );
}
