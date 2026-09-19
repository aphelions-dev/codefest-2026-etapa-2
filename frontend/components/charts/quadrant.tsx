"use client";

import { useEffect, useRef, useState } from "react";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Quadrant as QuadrantData } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { isActive, usePeriod } from "@/lib/period";
import { useApi } from "@/lib/use-api";
import { useDocument } from "@/lib/use-document";

// Margen para los ejes y sus etiquetas.
const PAD = { top: 14, right: 16, bottom: 26, left: 40 };

/**
 * Cuadrante de priorización: intensidad en el eje horizontal, tendencia en el vertical.
 *
 * Responde a "¿a qué mirar primero?", que es una pregunta que ningún eje contesta por separado: una
 * entidad muy citada pero en documentos antiguos no es lo mismo que una citada menos pero casi solo
 * en los recientes. Las dos coordenadas son conteos del corpus —documentos que nombran la entidad,
 * y qué proporción de ellos está en la mitad reciente— y las líneas de corte son las medianas, así
 * que el gráfico compara entidades entre sí y no inventa ningún índice ni umbral de riesgo.
 */
export function Quadrant({
  phenomenon,
  entity,
  onEntity,
}: {
  readonly phenomenon: number | null;
  readonly entity: string | null;
  readonly onEntity: (entityId: string | null) => void;
}) {
  const { data, error, loading } = useApi<QuadrantData>("/entities/quadrant", {
    phenomenon: phenomenon ?? undefined,
  });
  const { open } = useDocument();
  // El cuadrante ya parte el tiempo en dos mitades: recortarlo a un periodo le quitaría el eje.
  const [period] = usePeriod();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 520, height: 300 });
  const [hovered, setHovered] = useState<string | null>(null);

  // El SVG se dibuja al tamaño real del panel, que cambia al plegar la barra o el analista.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const points = data?.points ?? [];
  const maxDocuments = Math.max(...points.map((point) => point.documents), 1);
  const width = size.width;
  const height = size.height;
  const x = (documents: number) =>
    PAD.left + (documents / maxDocuments) * (width - PAD.left - PAD.right);
  // La proporción reciente va de 0 a 1, y el eje crece hacia arriba.
  const y = (share: number) => PAD.top + (1 - share) * (height - PAD.top - PAD.bottom);

  return (
    <Panel
      source={
        data && data.split_year
          ? `${formatNumber(data.dated_documents)} de ${formatNumber(data.total_documents)} documentos tienen fecha en la metadata de su fuente.${
              isActive(period) ? " El periodo no lo recorta: su eje vertical ya compara lo reciente con lo anterior." : ""
            } Un clic en una entidad filtra todo el tablero; dos, abren su fragmento.`
          : undefined
      }
      title="Intensidad y tendencia por entidad"
      unit={
        data && data.split_year
          ? `Horizontal: documentos que la nombran. Vertical: proporción publicada desde ${data.split_year}. Las líneas son las medianas`
          : "Documentos que nombran la entidad frente a qué parte de ellos es reciente"
      }
    >
      <div className="h-full min-h-56" ref={box}>
        {!data || points.length === 0 ? (
          <PanelState
            empty="Sin documentos fechados para este filtro, así que no hay tendencia que mostrar"
            error={error}
            loading={loading}
          />
        ) : (
          <svg aria-label="Cuadrante de intensidad y tendencia" className="h-full w-full" role="img">
            {/* Las dos líneas de corte, rotuladas: el anexo pide que no haya que inferir el eje. */}
            <line
              stroke="var(--border)"
              strokeDasharray="4 3"
              x1={x(data.median_documents)}
              x2={x(data.median_documents)}
              y1={PAD.top}
              y2={height - PAD.bottom}
            />
            <line
              stroke="var(--border)"
              strokeDasharray="4 3"
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(data.median_recent_share)}
              y2={y(data.median_recent_share)}
            />
            <text className="fill-muted-foreground" fontSize={9} x={PAD.left + 4} y={PAD.top + 10}>
              Emergente
            </text>
            <text
              className="fill-muted-foreground"
              fontSize={9}
              textAnchor="end"
              x={width - PAD.right - 4}
              y={PAD.top + 10}
            >
              Prioridad: intensa y al alza
            </text>
            <text
              className="fill-muted-foreground"
              fontSize={9}
              x={PAD.left + 4}
              y={height - PAD.bottom - 4}
            >
              Bajo interés
            </text>
            <text
              className="fill-muted-foreground"
              fontSize={9}
              textAnchor="end"
              x={width - PAD.right - 4}
              y={height - PAD.bottom - 4}
            >
              Establecida
            </text>

            {/* Ejes con sus unidades. */}
            <text className="fill-muted-foreground" fontSize={9} x={PAD.left} y={height - 6}>
              0
            </text>
            <text
              className="fill-muted-foreground"
              fontSize={9}
              textAnchor="end"
              x={width - PAD.right}
              y={height - 6}
            >
              {formatNumber(maxDocuments)} documentos
            </text>
            <text className="fill-muted-foreground" fontSize={9} x={4} y={PAD.top + 4}>
              100%
            </text>
            <text className="fill-muted-foreground" fontSize={9} x={4} y={height - PAD.bottom}>
              0%
            </text>

            {points.map((point, index) => {
              const share = point.recent / point.documents;
              const cx = x(point.documents);
              const cy = y(share);
              const selected = entity === point.entity_id;
              const active = selected || hovered === point.entity_id;
              // Con una entidad elegida en cualquier vista, el resto del plano se apaga.
              const dimmed = entity !== null && !selected;
              return (
                <g
                  className="cursor-pointer"
                  key={point.entity_id}
                  onClick={() => onEntity(selected ? null : point.entity_id)}
                  onDoubleClick={() => open(point.trace.doc_id, point.trace.chunk_id)}
                  onMouseEnter={() => setHovered(point.entity_id)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <title>
                    {`${point.name}: ${point.documents} documentos, ${point.recent} desde ${data.split_year} y ${point.earlier} antes · un clic filtra el tablero, dos abren su fragmento`}
                  </title>
                  <circle
                    cx={cx}
                    cy={cy}
                    fill="var(--primary)"
                    fillOpacity={dimmed ? 0.15 : active ? 1 : 0.65}
                    r={active ? 5 : 3.5}
                    stroke="var(--background)"
                    strokeWidth={1}
                  />
                  {/* Solo se rotula lo que el lector está mirando y las tres entidades más
                      intensas: con cuarenta etiquetas a la vez el cuadrante deja de leerse. */}
                  {active || (!dimmed && index < 3) ? (
                    <text
                      className="pointer-events-none fill-foreground"
                      fontSize={9}
                      textAnchor={cx > width / 2 ? "end" : "start"}
                      x={cx + (cx > width / 2 ? -7 : 7)}
                      y={cy + 3}
                    >
                      {point.name}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </Panel>
  );
}
