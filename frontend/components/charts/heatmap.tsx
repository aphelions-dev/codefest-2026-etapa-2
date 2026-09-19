"use client";

import { Panel, PanelState } from "@/components/charts/panel";
import { useDocument } from "@/lib/use-document";
import type { Matrix } from "@/lib/api";
import { periodParams, usePeriod } from "@/lib/period";
import { useApi } from "@/lib/use-api";

/** Escala secuencial para una variable numérica ordenada, sobre el fondo del tablero. */
function shade(value: number, max: number): string {
  if (value === 0) return "var(--background)";
  // Raíz cuadrada: unas pocas celdas enormes aplanarían el resto en una escala lineal.
  const t = Math.sqrt(value / max);
  return `color-mix(in oklab, var(--primary) ${Math.round(12 + t * 88)}%, var(--background))`;
}

// Por encima de esta intensidad la celda es clara y la cifra va en oscuro para leerse.
const LIGHT = 0.55;

/**
 * Matriz de calor: dos variables categóricas en los ejes y una numérica en el color. Responde
 * "qué entidad domina cada fuente": una fila con el color repartido es un concepto transversal,
 * una fila con una sola celda oscura es un concepto confinado a una fuente.
 */
export function Heatmap({
  cols,
  phenomenon,
  entity,
  onEntity,
}: {
  readonly cols: string;
  readonly phenomenon: number | null;
  readonly entity: string | null;
  readonly onEntity: (entityId: string | null) => void;
}) {
  const [period] = usePeriod();
  const { data, error, loading } = useApi<Matrix>("/entities/matrix", {
    cols,
    phenomenon: phenomenon ?? undefined,
    ...periodParams(period),
  });

  const { open } = useDocument();
  const max = data ? Math.max(...data.cells.map((cell) => cell.documents), 1) : 1;
  const cellAt = (entityId: string, col: string) =>
    data?.cells.find((cell) => cell.row_id === entityId && cell.col === col);

  return (
    <Panel
      source={data ? `${data.rows.length} entidades por ${data.cols.length} fuentes` : undefined}
      title="Entidades por fuente"
      unit="Documentos que nombran la entidad en cada fuente. La celda abre el fragmento que la sustenta; el nombre de la fila filtra todo el tablero"
    >
      {!data || data.cells.length === 0 ? (
        <PanelState empty="Sin menciones para este filtro" error={error} loading={loading} />
      ) : (
        <div className="flex h-full flex-col gap-2">
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-separate border-spacing-[2px] text-[11px]">
            <thead>
              <tr>
                <th className="bg-card sticky left-0 z-10" />
                {data.cols.map((col) => (
                  <th className="text-muted-foreground max-w-24 truncate px-1 pb-1 text-left font-normal" key={col} title={col}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const selected = entity === row.entity_id;
                // Con una entidad elegida en cualquier vista, las demás filas se apagan.
                const dimmed = entity !== null && !selected;
                return (
                <tr className={dimmed ? "opacity-25" : undefined} key={row.entity_id}>
                  <th className="bg-card sticky left-0 z-10 max-w-40 p-0 text-left font-normal">
                    <button
                      aria-pressed={selected}
                      className="hover:text-foreground aria-pressed:text-primary w-full truncate pr-2 text-left"
                      onClick={() => onEntity(selected ? null : row.entity_id)}
                      title={`${row.name} · filtrar todo el tablero por esta entidad`}
                      type="button"
                    >
                      {row.name}
                    </button>
                  </th>
                  {data.cols.map((col) => {
                    const cell = cellAt(row.entity_id, col);
                    const documents = cell?.documents ?? 0;
                    const label = cell
                      ? `${row.name} en ${col}: ${documents} documentos, ${cell.mentions} menciones (${cell.trace.chunk_id})`
                      : `${row.name} en ${col}: sin menciones`;
                    return (
                      <td className="p-0" key={col}>
                        <button
                          className="hover:ring-foreground/60 h-7 w-full rounded-[3px] align-middle font-mono text-[10px] tabular-nums transition-shadow hover:ring-1 disabled:cursor-default disabled:hover:ring-0"
                          disabled={!cell}
                          onClick={() => cell && open(cell.trace.doc_id, cell.trace.chunk_id)}
                          style={{
                            background: shade(documents, max),
                            color: Math.sqrt(documents / max) > LIGHT ? "var(--primary-foreground)" : "var(--muted-foreground)",
                          }}
                          title={cell ? `${label} · abrir el documento` : label}
                          type="button"
                        >
                          <span aria-hidden>{documents || ""}</span>
                          <span className="sr-only">{label}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          {/* La escala: raíz cuadrada, así que el tono medio no es la mitad del máximo. */}
          <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-[10px]">
            <span>1</span>
            <div
              className="h-1.5 w-32 rounded-full"
              style={{ background: `linear-gradient(to right, ${shade(1, max)}, ${shade(max, max)})` }}
            />
            <span className="font-mono">{max}</span>
            <span>documentos por celda</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
