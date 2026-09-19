"use client";

import { LayoutGridIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { IconButton } from "@/components/icon-button";
import { GLASS } from "@/components/map/panel";
import { type Activation, render, TOOLS } from "@/components/registry";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { PHENOMENA, PHENOMENON_STYLE } from "@/lib/filters";
import { isActive, periodLabel, usePeriod } from "@/lib/period";
import { cn } from "@/lib/utils";

/**
 * Los componentes que el agente activó.
 *
 * **Cerrados, son una píldora sobre el mapa**; abiertos, un diálogo grande. Encajarlos en el hueco
 * del mapa dejaba a una matriz de calor sin una fila entera y a una red saliéndose de su caja: el
 * componente dejaba de resolver la tarea que justifica su existencia. El diálogo ocupa todo menos
 * el analista, que sigue a la vista y se puede usar: la pregunta y lo que activó se leen juntos.
 *
 * **Uno a la vez, con pestañas**: el que se mira tiene todo el espacio y los demás siguen a un clic.
 * Cuando el agente responde con componentes, el diálogo se abre solo en el primero.
 */
export function AnalysisPanel({
  activations,
  phenomenon,
  entity,
  onEntity,
  entityNote,
  open,
  onOpenChange,
  leftInset,
  rightInset,
  bottomInset,
}: {
  readonly activations: readonly Activation[];
  readonly phenomenon: number | null;
  /** Filtro global por entidad: una selección en cualquier vista lo cambia para todas. */
  readonly entity: string | null;
  readonly onEntity: (entityId: string | null) => void;
  /** Qué no alcanza el filtro por entidad, cuando la vista del mapa no sale del corpus. */
  readonly entityNote?: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Lo que ocupan la barra, el analista y la franja temporal: la píldora va en el hueco. */
  readonly leftInset: number;
  readonly rightInset: number;
  readonly bottomInset: number;
}) {
  // La pestaña elegida va atada a los componentes entre los que se eligió: cuando el agente activa
  // otros, se muestra el primero de los nuevos.
  const [chosen, setChosen] = useState<{ readonly key: string; readonly index: number } | null>(null);
  const [period] = usePeriod();

  const key = activations.map((activation) => activation.tool).join(",");
  const active = chosen?.key === key ? chosen.index : 0;
  const setActive = (index: number) => setChosen({ key, index });

  if (activations.length === 0) return null;
  const index = Math.min(active, activations.length - 1);
  const current = activations[index];
  const openAt = (at: number) => {
    setActive(at);
    onOpenChange(true);
  };

  return (
    <>
      {/* Cerrado: una píldora en el hueco del mapa, sobre la franja temporal. */}
      {!open ? (
        <div
          className="pointer-events-none absolute z-10 flex justify-center px-3 transition-[left,right,bottom] duration-200"
          style={{ left: leftInset, right: rightInset, bottom: bottomInset + 12 }}
        >
          <nav
            aria-label="Componentes activos"
            className={cn(
              GLASS,
              "border-border/60 pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border p-1 shadow-xl shadow-black/40",
            )}
          >
            <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 pr-1 pl-2 text-[11px]">
              <LayoutGridIcon className="text-primary size-3.5" />
              Análisis
            </span>
            {activations.map((activation, at) => {
              const Icon = TOOLS[activation.tool].icon;
              return (
                <button
                  className="hover:bg-muted text-foreground/90 flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors"
                  key={activation.tool}
                  onClick={() => openAt(at)}
                  title={`Abrir ${TOOLS[activation.tool].label.toLowerCase()} · ${TOOLS[activation.tool].task}`}
                  type="button"
                >
                  <Icon className="text-muted-foreground size-3.5" />
                  {TOOLS[activation.tool].label}
                </button>
              );
            })}
          </nav>
        </div>
      ) : null}

      {/* Abierto: no modal, para que el analista siga respondiendo mientras se mira el componente. */}
      <Dialog modal={false} onOpenChange={onOpenChange} open={open}>
        <DialogContent
          className="bg-popover/95 flex flex-col gap-0 overflow-hidden p-0 shadow-2xl shadow-black/60 backdrop-blur-xl"
          onInteractOutside={(event) => event.preventDefault()}
          // Al abrir, el foco se queda en el contenido y no pinta un anillo en la primera pestaña.
          onOpenAutoFocus={(event) => event.preventDefault()}
          showCloseButton={false}
          style={{
            top: 12,
            bottom: 12,
            left: 12,
            right: rightInset + 12,
            width: "auto",
            maxWidth: "none",
            translate: "none",
          }}
        >
          <header className="border-border/60 flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
            <div className="min-w-0">
              <DialogTitle className="text-sm">{TOOLS[current.tool].label}</DialogTitle>
              <DialogDescription className="text-[11px]">{TOOLS[current.tool].task}</DialogDescription>
            </div>

            {/* Una pestaña por componente activo. */}
            {activations.length > 1 ? (
              <div aria-label="Componentes" className="bg-muted/50 flex gap-0.5 rounded-lg p-0.5" role="tablist">
                {activations.map((activation, at) => {
                  const Icon = TOOLS[activation.tool].icon;
                  return (
                  <button
                    aria-selected={at === index}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition-colors",
                      at === index
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    key={activation.tool}
                    onClick={() => setActive(at)}
                    role="tab"
                    type="button"
                  >
                    <Icon className="size-3.5" />
                    {TOOLS[activation.tool].label}
                  </button>
                  );
                })}
              </div>
            ) : null}

            {/* Los filtros que recortan lo que se ve: sin ellos el componente enseña cifras reducidas
                sin decir por qué. El de entidad se quita desde aquí. */}
            <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px]">
              <span
                className={cn(
                  "border-border/60 text-muted-foreground rounded-md border px-1.5 py-0.5",
                  phenomenon ? PHENOMENON_STYLE[phenomenon] : null,
                )}
              >
                {phenomenon ? `F${phenomenon} · ${PHENOMENA[phenomenon - 1].label}` : "Los tres fenómenos"}
              </span>
              {isActive(period) ? (
                <span className="border-border/60 text-muted-foreground rounded-md border px-1.5 py-0.5 tabular-nums">
                  {periodLabel(period)}
                </span>
              ) : null}
              {entity ? (
                <button
                  className="border-primary/50 text-primary hover:bg-primary/10 flex items-center gap-1 rounded-md border px-1.5 py-0.5"
                  onClick={() => onEntity(null)}
                  title={entityNote ? `Quitar el filtro por entidad. ${entityNote}` : "Quitar el filtro por entidad"}
                  type="button"
                >
                  {entity.replaceAll("-", " ")}
                  <XIcon className="size-3" />
                </button>
              ) : null}
              <IconButton label="Cerrar y volver al mapa (Esc)" onClick={() => onOpenChange(false)} size="icon-xs">
                <XIcon />
              </IconButton>
            </div>
          </header>

          <div className="min-h-0 flex-1 p-4 [&>section]:h-full [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none [&>section]:backdrop-blur-none">
            {render(current, { phenomenon, entity, onEntity })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
