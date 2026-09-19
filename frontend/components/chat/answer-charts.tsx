"use client";

import { MaximizeIcon } from "lucide-react";
import { useState } from "react";

import { IconButton } from "@/components/icon-button";
import { type Activation, render, TOOLS } from "@/components/registry";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const noop = () => {};

/**
 * Las gráficas que eligió el visualizador, dentro de la respuesta: interactivas, con los mismos
 * datos y la misma traza que en el tablero, porque son los mismos componentes con los filtros que
 * declaró el agente. Una pestaña por componente, como en el diálogo del tablero; ampliar la abre
 * grande —en el tablero, en su diálogo—.
 */
export function AnswerCharts({
  activations,
  onOpen,
}: {
  readonly activations: readonly Activation[];
  /** En el tablero: abrir el componente en el diálogo grande. A solas se amplía aquí mismo. */
  readonly onOpen?: (tool: Activation["tool"]) => void;
}) {
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const current = activations[Math.min(index, activations.length - 1)];
  const context = { phenomenon: null, entity: null, onEntity: noop };
  const chart = render(current, context, true);

  return (
    <section aria-label="Visualizaciones de la respuesta" className="border-border/60 bg-card/40 overflow-hidden rounded-lg border">
      <header className="border-border/60 flex items-center gap-1 border-b px-1.5 py-1">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" role="tablist">
          {activations.map((activation, at) => {
            const Icon = TOOLS[activation.tool].icon;
            return (
              <button
                aria-selected={at === index}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
                  at === index ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                key={activation.tool}
                onClick={() => setIndex(at)}
                role="tab"
                type="button"
              >
                <Icon className="size-3.5" />
                {TOOLS[activation.tool].label}
              </button>
            );
          })}
        </div>
        <IconButton
          label={onOpen ? "Abrir en el tablero" : "Ampliar"}
          onClick={() => (onOpen ? onOpen(current.tool) : setExpanded(true))}
          side="left"
          size="icon-xs"
        >
          <MaximizeIcon />
        </IconButton>
      </header>

      <div className="h-72 p-2 [&>section]:h-full [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-1 [&>section]:shadow-none [&>section]:backdrop-blur-none">
        {chart}
      </div>

      <Dialog onOpenChange={setExpanded} open={expanded}>
        <DialogContent className="flex h-[85dvh] flex-col gap-2 p-4 sm:max-w-5xl">
          <DialogTitle className="text-sm">{TOOLS[current.tool].label}</DialogTitle>
          <DialogDescription className="text-[11px]">{TOOLS[current.tool].task}</DialogDescription>
          <div className="min-h-0 flex-1 [&>section]:h-full [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none">
            {render(current, context, true)}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
