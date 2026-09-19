"use client";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Matrix } from "@/lib/api";
import { useApi } from "@/lib/use-api";

/** Escala secuencial para una variable numérica ordenada, sobre el fondo del tablero. */
function shade(value: number, max: number): string {
  if (value === 0) return "var(--color-background)";
  // Raíz cuadrada: unas pocas celdas enormes aplanarían el resto en una escala lineal.
  const t = Math.sqrt(value / max);
  return `color-mix(in oklab, var(--color-accent) ${Math.round(12 + t * 88)}%, var(--color-background))`;
}

/**
 * Matriz de calor: dos variables categóricas en los ejes y una numérica en el color. Responde
 * "qué entidad domina cada fuente": una fila con el color repartido es un concepto transversal,
 * una fila con una sola celda oscura es un concepto confinado a una fuente.
 */
export function Heatmap({ cols, phenomenon }: { readonly cols: string; readonly phenomenon: number | null }) {
  const { data, error, loading } = useApi<Matrix>("/entities/matrix", {
    cols,
    phenomenon: phenomenon ?? undefined,
  });

  const max = data ? Math.max(...data.cells.map((cell) => cell.documents), 1) : 1;
  const cellAt = (row: string, col: string) => data?.cells.find((c) => c.row === row && c.col === col);

  return (
    <Panel
      source={data ? `${data.rows.length} entidades por ${data.cols.length} fuentes` : undefined}
      title="Entidades por fuente"
      unit="Color: documentos que nombran la entidad en esa fuente"
      wide
    >
      {!data || data.cells.length === 0 ? (
        <PanelState empty="Sin menciones para este filtro" error={error} loading={loading} />
      ) : (
        <div className="h-full overflow-auto">
          <table className="w-full border-separate border-spacing-[2px] text-[11px]">
            <thead>
              <tr>
                <th className="bg-surface sticky left-0 z-10" />
                {data.cols.map((col) => (
                  <th className="text-muted max-w-24 truncate px-1 pb-1 text-left font-normal" key={col} title={col}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row}>
                  <th
                    className="bg-surface sticky left-0 z-10 max-w-40 truncate pr-2 text-left font-normal"
                    title={row}
                  >
                    {row}
                  </th>
                  {data.cols.map((col) => {
                    const cell = cellAt(row, col);
                    const documents = cell?.documents ?? 0;
                    const label = cell
                      ? `${row} en ${col}: ${documents} documentos, ${cell.mentions} menciones (${cell.trace.doc_id})`
                      : `${row} en ${col}: sin menciones`;
                    return (
                      <td
                        className="h-6 rounded-[3px] text-center align-middle"
                        key={col}
                        style={{ background: shade(documents, max) }}
                        title={label}
                      >
                        <span className="sr-only">{label}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
