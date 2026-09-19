"use client";

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { IconButton } from "@/components/icon-button";
import { GLASS } from "@/components/map/panel";
import type { Timeline as TimelineData } from "@/lib/api";
import { phenomenonColor } from "@/lib/filters";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

/**
 * La evolución temporal como franja inferior, a todo lo ancho: una serie de años necesita anchura,
 * no una tarjeta estrecha, y así comparte el eje con el mapa en lugar de competir por el espacio.
 *
 * Declara sobre cuántos documentos se puede afirmar algo. Si el corpus no trae fecha, lo dice en vez
 * de repartir los documentos y falsear la serie.
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
    entity,
  });
  const color = phenomenonColor(phenomenon);
  const empty = data !== null && data.points.length === 0;

  return (
    <section className={cn(GLASS, "border-border/60 border-t")}>
      <header className="flex items-center gap-2 px-3 py-1.5">
        <h2 className="text-[12px] font-medium">Documentos publicados por año</h2>
        {data ? (
          <span className="text-muted-foreground min-w-0 truncate text-[11px]">
            {empty
              ? `· ninguno de los ${data.total_documents.toLocaleString("es")} documentos de este filtro trae fecha en la metadata de su fuente, así que no hay serie que mostrar`
              : `· ${data.dated_documents.toLocaleString("es")} de ${data.total_documents.toLocaleString("es")} documentos tienen fecha en la metadata de su fuente`}
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
        <div className="h-32 px-2 pb-2">
          {!data ? (
            <p className="text-muted-foreground grid h-full place-items-center px-6 text-center text-[11px]">
              {loading ? "Cargando…" : error ? `No se pudo cargar: ${error}` : "Sin datos"}
            </p>
          ) : (
            <ResponsiveContainer height="100%" width="100%">
              <AreaChart data={data.points} margin={{ left: 0, right: 8, top: 6, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} width={34} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value) => [Number(value).toLocaleString("es"), "documentos"] as [string, string]}
                />
                <Area dataKey="documents" fill={color} fillOpacity={0.22} stroke={color} type="monotone" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : null}
    </section>
  );
}
