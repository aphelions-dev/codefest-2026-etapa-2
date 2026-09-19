"use client";

import { XIcon } from "lucide-react";
import { useEffect } from "react";

import { IconButton } from "@/components/icon-button";
import { GLASS } from "@/components/map/panel";
import { type Activation, render, TOOLS } from "@/components/registry";
import { cn } from "@/lib/utils";

/**
 * Los componentes que el agente activó, en el hueco visible del mapa y a su ancho completo.
 *
 * Una matriz de calor y una red de entidades no se leen en una columna estrecha: necesitan el ancho
 * de la pantalla. El mapa se sigue viendo detrás —es el lienzo del radar— pero deja de competir por
 * el espacio cuando la pregunta del analista va sobre otra cosa. Se cierra con Esc.
 */
export function AnalysisPanel({
  activations,
  phenomenon,
  entity,
  onEntity,
  leftInset,
  rightInset,
  bottomInset,
  onClose,
}: {
  readonly activations: readonly Activation[];
  readonly phenomenon: number | null;
  /** Filtro global por entidad: una selección en cualquier vista lo cambia para todas. */
  readonly entity: string | null;
  readonly onEntity: (entityId: string | null) => void;
  readonly leftInset: number;
  readonly rightInset: number;
  readonly bottomInset: number;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (entity) onEntity(null);
      else onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose, entity, onEntity]);

  if (activations.length === 0) return null;

  return (
    <section
      aria-label="Componentes activos"
      className={cn(
        GLASS,
        "border-border/60 absolute top-3 z-10 flex flex-col gap-2 overflow-hidden rounded-xl border p-2 shadow-2xl shadow-black/50",
      )}
      style={{ left: leftInset + 12, right: rightInset + 12, bottom: bottomInset + 12 }}
    >
      <header className="flex shrink-0 items-center gap-2 px-1">
        <h2 className="text-[13px] font-medium">Análisis</h2>
        {/* Qué tarea analítica resuelve cada componente: el anexo pide que no haya que inferirlo. */}
        <ul className="text-muted-foreground flex min-w-0 flex-1 flex-wrap gap-1 text-[10px]">
          {activations.map((activation) => (
            <li className="border-border/60 rounded-full border px-2 py-0.5" key={activation.tool}>
              {TOOLS[activation.tool].label} · {TOOLS[activation.tool].task}
            </li>
          ))}
        </ul>
        {/* El filtro activo, siempre visible y siempre reversible: sin esto, el tablero muestra
            cifras reducidas sin decir por qué. */}
        {entity ? (
          <button
            className="border-primary/50 text-primary hover:bg-primary/10 flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
            onClick={() => onEntity(null)}
            title="Quitar el filtro por entidad"
            type="button"
          >
            Filtrado por {entity.replaceAll("-", " ")}
            <XIcon className="size-3" />
          </button>
        ) : null}
        <IconButton label="Cerrar el análisis y ver el mapa (Esc)" onClick={onClose}>
          <XIcon className="size-4" />
        </IconButton>
      </header>

      {/* Dos columnas como mucho: una matriz de calor o un cuadrante en un tercio de pantalla
          amontona sus etiquetas y deja de resolver la tarea. Con tres componentes, el tercero
          ocupa la fila siguiente a todo lo ancho. */}
      <div
        className="grid min-h-0 flex-1 auto-rows-fr gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(activations.length, 2)}, minmax(0, 1fr))` }}
      >
        {activations.map((activation, index) => (
          <div
            className="min-h-0 [&>section]:h-full"
            key={activation.tool}
            // Un tercero impar se lleva la fila entera en vez de dejar media fila vacía.
            style={activations.length === 3 && index === 2 ? { gridColumn: "span 2" } : undefined}
          >
            {render(activation, { phenomenon, entity, onEntity })}
          </div>
        ))}
      </div>
    </section>
  );
}
