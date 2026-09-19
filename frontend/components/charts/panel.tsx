import type { ReactNode } from "react";

/**
 * Contenedor de todo componente del tablero. El titulo, la unidad y la fuente son obligatorios:
 * el anexo pide que nadie tenga que inferir que representa un eje o un color.
 */
export function Panel({
  title,
  unit,
  source,
  children,
  wide = false,
}: {
  readonly title: string;
  readonly unit: string;
  readonly source?: string;
  readonly children: ReactNode;
  readonly wide?: boolean;
}) {
  return (
    <section
      className={`border-border bg-surface flex min-h-72 flex-col rounded-xl border p-4 ${wide ? "lg:col-span-2" : ""}`}
    >
      <header className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted text-xs">{unit}</p>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
      {source ? <footer className="text-muted mt-3 text-[11px]">{source}</footer> : null}
    </section>
  );
}

/** Lo que se muestra mientras llega la respuesta, o cuando no hay nada que mostrar. */
export function PanelState({ loading, error, empty }: { readonly loading?: boolean; readonly error?: string | null; readonly empty?: string }) {
  const message = loading ? "Cargando…" : error ? `No se pudo cargar: ${error}` : empty;
  return <div className="text-muted grid h-full place-items-center text-center text-xs">{message}</div>;
}
