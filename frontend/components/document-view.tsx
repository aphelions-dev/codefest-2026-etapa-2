"use client";

import { FileTextIcon } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Document } from "@/lib/api";
import { PHENOMENON_STYLE } from "@/lib/filters";
import { useApi } from "@/lib/use-api";
import { useDocument } from "@/lib/use-document";
import { cn } from "@/lib/utils";

/**
 * El texto original detrás de cualquier dato del radar, abierto sobre el mapa. Es la pieza que hace
 * verificable cada afirmación: un número en un panel sin su fragmento es una autoridad que nadie
 * puede revisar, y la especificación exige poder rastrear todo hasta su `doc_id` y `chunk_id`.
 */
export function DocumentView() {
  const { doc, close } = useDocument();
  const { data, error, loading } = useApi<Document>(doc ? `/documents/${doc}` : null);

  return (
    <Dialog onOpenChange={(open) => !open && close()} open={doc !== null}>
      <DialogContent className="flex h-[85dvh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="gap-1 border-b px-6 pt-6 pb-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileTextIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="truncate">{data?.title ?? doc}</span>
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
                  {(data.fragments ?? []).length} fragmento{(data.fragments ?? []).length === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-4 px-6 py-5">
            {loading ? <p className="text-muted-foreground text-xs">Cargando el documento…</p> : null}
            {error ? <p className="text-muted-foreground text-xs">No se pudo cargar: {error}</p> : null}
            {(data?.fragments ?? []).map((fragment) => (
              <figure className="border-border border-l-2 pl-3" key={fragment.chunk_id}>
                <blockquote className="text-[13px] leading-relaxed whitespace-pre-line">{fragment.text}</blockquote>
                <figcaption className="text-muted-foreground mt-1 font-mono text-[10px]">
                  {fragment.chunk_id} · posición {fragment.position} · {fragment.num_tokens} tokens
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Abre el documento que sustenta un dato. Es el gesto que cierra la trazabilidad en toda vista. */
export function DocumentLink({
  docId,
  children,
  className,
}: {
  readonly docId: string;
  readonly children?: React.ReactNode;
  readonly className?: string;
}) {
  const { open } = useDocument();
  return (
    <button
      className={cn("hover:text-primary font-mono underline decoration-dotted underline-offset-2", className)}
      onClick={() => open(docId)}
      title={`Ver el documento ${docId}`}
      type="button"
    >
      {children ?? docId}
    </button>
  );
}
