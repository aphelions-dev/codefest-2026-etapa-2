"use client";

import { FileTextIcon } from "lucide-react";
import type { ComponentProps, MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Document } from "@/lib/api";
import { PHENOMENON_STYLE } from "@/lib/filters";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { useDocument } from "@/lib/use-document";
import { cn } from "@/lib/utils";

/**
 * El texto original detrás de cualquier dato del radar, abierto sobre el mapa. Es la pieza que hace
 * verificable cada afirmación: un número en un panel sin su fragmento es una autoridad que nadie
 * puede revisar, y la especificación exige poder rastrear todo hasta su `doc_id` y `chunk_id`.
 *
 * El corpus original no viaja con la aplicación: un documento es el texto de sus fragmentos del
 * índice, en orden, que es exactamente lo que el agente leyó. Se sirve por ventanas porque los
 * documentos mayores pasan del millar de fragmentos.
 */

// Aire por encima del fragmento citado cuando es más alto que el panel.
const TOP_MARGIN = 12;

export function DocumentView() {
  const { doc, chunk, close } = useDocument();
  const viewport = useRef<HTMLDivElement>(null);
  // La ventana que pidió el lector, atada a la cita que la abrió: cada documento o fragmento nuevo
  // vuelve solo a la ventana de su cita, sin efecto que la reponga.
  const [requested, setRequested] = useState<{ citation: string; start: number } | null>(null);
  const citation = `${doc}#${chunk}`;
  const start = requested?.citation === citation ? requested.start : null;

  const { data, error, loading } = useApi<Document>(doc ? `/documents/${doc}` : null, {
    around: start === null && chunk ? chunk : undefined,
    start: start ?? undefined,
  });

  // Al llegar la ventana, el fragmento citado al centro. Se mueve el `scrollTop` del panel y no
  // `scrollIntoView`, que también desplazaría la página de detrás del diálogo.
  useEffect(() => {
    if (!data || !chunk) return;
    const panel = viewport.current;
    const target = panel?.querySelector<HTMLElement>(`[data-chunk="${CSS.escape(chunk)}"]`);
    if (!panel || !target) return;
    const offset = target.getBoundingClientRect().top - panel.getBoundingClientRect().top;
    // Al centro, salvo que el fragmento no quepa: entonces por su principio, que es donde se lee.
    const room = Math.max(0, panel.clientHeight - target.clientHeight);
    panel.scrollTop += offset - (room > 0 ? room / 2 : TOP_MARGIN);
  }, [data, chunk]);

  const shown = data?.fragments?.length ?? 0;
  const before = data?.start ?? 0;
  // Un backend sin ventanas no manda `total`: entonces lo que llega es el documento entero.
  const total = data?.total ?? before + shown;
  const after = data ? total - before - shown : 0;
  const goTo = (value: number) => setRequested({ citation, start: value });

  return (
    <Dialog onOpenChange={(open) => !open && close()} open={doc !== null}>
      <DialogContent className="flex h-[85dvh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="gap-1 border-b px-6 pt-6 pb-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileTextIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">{title(data) ?? doc}</span>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-foreground/70 font-mono">{doc}</span>
            {data ? (
              <>
                <span>·</span>
                <span className="truncate">{data.observatory?.replaceAll("_", " ") ?? "sin observatorio"}</span>
                <span>·</span>
                <span className="uppercase">{data.language ?? "—"}</span>
                <span>·</span>
                <span className={cn("rounded-full border px-1.5", PHENOMENON_STYLE[data.phenomenon])}>
                  F{data.phenomenon}
                </span>
                <span>·</span>
                <span>
                  {formatNumber(total)} fragmento{total === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto" ref={viewport}>
          <div className="space-y-3 px-6 py-5">
            {loading && !data ? <p className="text-muted-foreground text-xs">Cargando el documento…</p> : null}
            {error ? <p className="text-muted-foreground text-xs">No se pudo cargar: {error}</p> : null}

            {before > 0 ? (
              <Window
                label={`Ver los ${formatNumber(Math.min(before, shown))} fragmentos anteriores`}
                onClick={() => goTo(Math.max(0, before - shown))}
              />
            ) : null}

            {(data?.fragments ?? []).map((fragment) => (
              <section
                className={cn(
                  "flex gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors",
                  // El fragmento citado, marcado: es el que sustenta el dato desde el que se llegó.
                  fragment.chunk_id === chunk && "border-primary/40 bg-primary/5",
                )}
                data-chunk={fragment.chunk_id}
                key={fragment.chunk_id}
              >
                {/* El corpus está fragmentado: cada corte se ve, en vez de fingir un texto continuo. */}
                <span className="text-muted-foreground pt-0.5 font-mono text-[10px] tabular-nums">
                  {fragment.position + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap">{fragment.text}</p>
                  <p className="text-muted-foreground font-mono text-[10px]">
                    {fragment.chunk_id} · {fragment.num_tokens} tokens
                  </p>
                </div>
              </section>
            ))}

            {after > 0 ? (
              <Window
                label={`Ver los ${formatNumber(Math.min(after, shown))} fragmentos siguientes`}
                onClick={() => goTo(before + shown)}
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** El índice trae `untitled` en los documentos sin título: entonces no hay más nombre que su id. */
function title(data: Document | null) {
  if (!data) return null;
  return data.title && data.title !== "untitled" ? data.title : null;
}

function Window({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <Button className="text-muted-foreground w-full text-xs" onClick={onClick} size="sm" variant="ghost">
      {label}
    </Button>
  );
}

/**
 * Referencia al corpus, clicable: lleva al documento y, si se sabe cuál, al fragmento exacto. Es el
 * gesto que cierra la trazabilidad en toda vista del tablero.
 *
 * Es un `<a>` con su URL real —se puede copiar y abrir en otra pestaña— pero el clic normal lo
 * atiende nuqs sin volver al servidor, así que el mapa no se recarga.
 */
export function DocumentLink({
  docId,
  chunkId,
  className,
  children,
  ...props
}: { readonly docId: string; readonly chunkId?: string | null; readonly children?: ReactNode } & ComponentProps<"a">) {
  const { href, open } = useDocument();

  const navigate = (event: MouseEvent<HTMLAnchorElement>) => {
    // Con modificador o botón central, que el navegador haga lo suyo: otra pestaña o ventana.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    open(docId, chunkId);
  };

  return (
    <a
      aria-label={`Abrir ${docId} en el corpus`}
      className={cn(
        "hover:text-primary font-mono underline decoration-dotted underline-offset-2 transition-colors",
        className,
      )}
      href={href(docId, chunkId)}
      onClick={navigate}
      {...props}
    >
      {children ?? docId}
    </a>
  );
}
