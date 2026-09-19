"use client";

import { Panel, PanelState } from "@/components/charts/panel";
import { DocumentLink } from "@/components/document-view";
import type { Document } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

const PREVIEW = 3;

/**
 * El texto original que sustenta lo que el tablero muestra. Es la pieza que hace verificable
 * cualquier afirmación: sin ella, un número en un panel es una autoridad que nadie puede revisar.
 *
 * Cuando se sabe qué fragmento se citó, la ventana se centra en él y queda marcado: el panel no
 * enseña el principio del documento, enseña la frase de la que salió el dato.
 */
export function Evidence({ docId, chunkId }: { readonly docId: string | null; readonly chunkId?: string | null }) {
  const { data, error, loading } = useApi<Document>(docId ? `/documents/${docId}` : null, {
    around: chunkId ?? undefined,
  });

  // Alrededor de la cita, no desde el principio del documento: si hay fragmento citado, se abre ahí.
  const fragments = data?.fragments ?? [];
  const cited = chunkId ? fragments.findIndex((fragment) => fragment.chunk_id === chunkId) : -1;
  const from = cited > 0 ? cited : 0;
  const shown = fragments.slice(from, from + PREVIEW);
  // Igual que en la vista del documento: sin `total`, lo que llego es todo lo que hay.
  const rest = data ? (data.total ?? fragments.length) - from - shown.length : 0;

  return (
    <Panel
      source={data ? `${data.doc_id} · ${data.observatory ?? "sin observatorio"} · F${data.phenomenon}` : undefined}
      title="Evidencia citada"
      unit="Fragmentos del documento de origen, con su identificador. Toca uno para abrirlo en el corpus"
    >
      {!docId ? (
        <PanelState empty="Toca un dato del tablero para ver el fragmento que lo sustenta." />
      ) : !data ? (
        <PanelState empty="Sin documento" error={error} loading={loading} />
      ) : (
        <div className="h-full space-y-3 overflow-auto pr-1">
          {data.title && data.title !== "untitled" ? (
            <h3 className="text-sm leading-snug font-medium">{data.title}</h3>
          ) : null}
          {shown.map((fragment) => (
            <figure
              className={cn(
                "border-border border-l-2 pl-3",
                fragment.chunk_id === chunkId && "border-primary/60",
              )}
              key={fragment.chunk_id}
            >
              <blockquote className="text-[13px] leading-relaxed">
                {fragment.text.slice(0, 460)}
                {fragment.text.length > 460 ? "…" : ""}
              </blockquote>
              <figcaption className="text-muted-foreground mt-1 text-[11px]">
                <DocumentLink chunkId={fragment.chunk_id} docId={data.doc_id}>
                  {fragment.chunk_id}
                </DocumentLink>{" "}
                · fragmento {fragment.position + 1} · {fragment.num_tokens} tokens
              </figcaption>
            </figure>
          ))}
          {rest > 0 ? (
            <p className="text-muted-foreground text-[11px]">
              y {formatNumber(rest)} fragmentos más en este documento
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
