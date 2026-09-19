import type { ReactNode } from "react";

import { GLASS } from "@/components/map/panel";
import { cn } from "@/lib/utils";

/**
 * Contenedor de todo componente del tablero. Flota sobre el mapa con vidrio esmerilado, así que el
 * radar se sigue viendo debajo de lo que el analista acaba de pedir.
 *
 * El título, la unidad y la fuente son obligatorios: el anexo pide que nadie tenga que inferir qué
 * representa un eje o un color.
 */
export function Panel({
  title,
  unit,
  source,
  children,
  className,
}: {
  readonly title: string;
  readonly unit: string;
  readonly source?: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <section
      className={cn(
        GLASS,
        "border-border/60 flex min-h-0 flex-col rounded-xl border p-3 shadow-lg shadow-black/30",
        className,
      )}
    >
      <header className="mb-2">
        <h2 className="text-[13px] leading-tight font-medium">{title}</h2>
        <p className="text-muted-foreground text-[11px] leading-snug">{unit}</p>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
      {source ? <footer className="text-muted-foreground mt-2 text-[10px] leading-snug">{source}</footer> : null}
    </section>
  );
}

/** Lo que se muestra mientras llega la respuesta, o cuando no hay nada que mostrar. */
export function PanelState({
  loading,
  error,
  empty,
}: {
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly empty?: string;
}) {
  const message = loading ? "Cargando…" : error ? `No se pudo cargar: ${error}` : empty;
  return (
    <div className="text-muted-foreground grid h-full place-items-center px-3 text-center text-[11px]">{message}</div>
  );
}
