"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { parseAsString, useQueryStates } from "nuqs";

/**
 * Qué documento del corpus está abierto, y en qué fragmento. Los dos viven en la URL, como los
 * filtros: un evaluador puede compartir el enlace de la evidencia exacta que sustenta un dato del
 * radar, y el botón de atrás lo cierra. Van en la consulta y no en la ruta, así que el mapa y la
 * conversación siguen montados detrás del diálogo.
 */

export const DOC_PARAM = "doc";
export const CHUNK_PARAM = "fragmento";

const PARSERS = { [DOC_PARAM]: parseAsString, [CHUNK_PARAM]: parseAsString };

export function useDocument() {
  const [params, set] = useQueryStates(PARSERS, { history: "push" });
  const pathname = usePathname();
  const search = useSearchParams();

  /** La URL de verdad del documento, para copiar el enlace o abrirlo en otra pestaña. */
  const href = (docId: string, chunkId?: string | null) => {
    const next = new URLSearchParams(search);
    next.set(DOC_PARAM, docId);
    if (chunkId) next.set(CHUNK_PARAM, chunkId);
    else next.delete(CHUNK_PARAM);
    return `${pathname}?${next}`;
  };

  return {
    doc: params[DOC_PARAM],
    chunk: params[CHUNK_PARAM],
    href,
    open: (docId: string, chunkId?: string | null) =>
      set({ [DOC_PARAM]: docId, [CHUNK_PARAM]: chunkId ?? null }),
    close: () => set({ [DOC_PARAM]: null, [CHUNK_PARAM]: null }),
  };
}
