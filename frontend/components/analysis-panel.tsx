"use client";

import { MaximizeIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { IconButton } from "@/components/icon-button";
import { GLASS } from "@/components/map/panel";
import { type Activation, render, TOOLS } from "@/components/registry";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Los componentes que el agente activó, en el hueco visible del mapa.
 *
 * **Uno a la vez, con pestañas.** Repartir el hueco entre dos o tres deja a cada gráfico en un
 * cuarto de pantalla, y ahí una matriz de calor no muestra ni una fila entera y una red se sale de
 * su caja: el componente deja de resolver la tarea que justifica su existencia. Con pestañas, el
 * que se está mirando ocupa todo el ancho disponible y los demás siguen a un clic.
 *
 * El botón de ampliar lleva el componente a pantalla completa, para examinarlo de cerca sin perder
 * el estado del tablero. Esc cierra: primero el filtro por entidad, luego la ampliación, luego el
 * panel.
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
  const [active, setActive] = useState(0);
  const [maximized, setMaximized] = useState(false);

  // Cuando el agente activa otros componentes, se muestra el primero de los nuevos.
  const key = activations.map((activation) => activation.tool).join(",");
  useEffect(() => setActive(0), [key]);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (entity) onEntity(null);
      else if (!maximized) onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose, entity, onEntity, maximized]);

  if (activations.length === 0) return null;
  const current = activations[Math.min(active, activations.length - 1)];

  return (
    <>
      <section
        aria-label="Componentes activos"
        className={cn(
          GLASS,
          "border-border/60 absolute top-3 z-10 flex flex-col gap-2 overflow-hidden rounded-xl border p-2 shadow-2xl shadow-black/50",
        )}
        style={{ left: leftInset + 12, right: rightInset + 12, bottom: bottomInset + 12 }}
      >
        <header className="flex shrink-0 items-center gap-2 px-1">
          {/* Una pestaña por componente, con la tarea analítica que resuelve: el anexo pide que no
              haya que inferir para qué sirve lo que se está viendo. */}
          <div aria-label="Componentes" className="flex min-w-0 flex-1 flex-wrap gap-1" role="tablist">
            {activations.map((activation, index) => (
              <button
                aria-selected={index === active}
                className={cn(
                  "border-border/60 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                  index === active
                    ? "border-primary/60 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                key={activation.tool}
                onClick={() => setActive(index)}
                role="tab"
                type="button"
              >
                {TOOLS[activation.tool].label}
                <span className="opacity-60"> · {TOOLS[activation.tool].task}</span>
              </button>
            ))}
          </div>

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
          <IconButton label="Ver a pantalla completa" onClick={() => setMaximized(true)}>
            <MaximizeIcon className="size-4" />
          </IconButton>
          <IconButton label="Cerrar el análisis y ver el mapa (Esc)" onClick={onClose}>
            <XIcon className="size-4" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 [&>section]:h-full">
          {render(current, { phenomenon, entity, onEntity })}
        </div>
      </section>

      {/* Ampliado: el mismo componente con todo el espacio, para examinarlo de cerca. */}
      <Dialog onOpenChange={setMaximized} open={maximized}>
        <DialogContent className="flex h-[92dvh] flex-col gap-3 p-4 sm:max-w-[94vw]">
          <DialogHeader className="shrink-0 text-left">
            <DialogTitle className="text-base">
              {TOOLS[current.tool].label}
              <span className="text-muted-foreground font-normal"> · {TOOLS[current.tool].task}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 [&>section]:h-full [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none">
            {render(current, { phenomenon, entity, onEntity })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
