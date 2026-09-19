"use client";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Document } from "@/lib/api";
import { useApi } from "@/lib/use-api";

const PREVIEW = 3;

/**
 * El texto original que sustenta lo que el tablero muestra. Es la pieza que hace verificable
 * cualquier afirmación: sin ella, un número en un panel es una autoridad que nadie puede revisar.
 */
export function Evidence({ docId }: { readonly docId: string | null }) {
  const { data, error, loading } = useApi<Document>(docId ? `/documents/${docId}` : null);

  return (
    <Panel
      source={data ? `${data.doc_id} · ${data.observatory ?? "sin observatorio"} · F${data.phenomenon}` : undefined}
      title="Evidencia citada"
      unit="Fragmentos del documento de origen, con su identificador"
    >
      {!docId ? (
        <PanelState empty="Toca un dato del tablero para ver el documento que lo sustenta." />
      ) : !data ? (
        <PanelState empty="Sin documento" error={error} loading={loading} />
      ) : (
        <div className="h-full space-y-3 overflow-auto pr-1">
          {data.title ? <h3 className="text-sm leading-snug font-medium">{data.title}</h3> : null}
          {(data.fragments ?? []).slice(0, PREVIEW).map((fragment) => (
            <figure className="border-border border-l-2 pl-3" key={fragment.chunk_id}>
              <blockquote className="text-[13px] leading-relaxed">
                {fragment.text.slice(0, 460)}
                {fragment.text.length > 460 ? "…" : ""}
              </blockquote>
              <figcaption className="text-muted-foreground mt-1 text-[11px]">
                {fragment.chunk_id} · fragmento {fragment.position} · {fragment.num_tokens} tokens
              </figcaption>
            </figure>
          ))}
          {(data.fragments ?? []).length > PREVIEW ? (
            <p className="text-muted-foreground text-[11px]">
              y {(data.fragments ?? []).length - PREVIEW} fragmentos más en este documento
            </p>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
