"use client";

import { parseAsString, useQueryState } from "nuqs";

/**
 * El documento abierto vive en la URL, como los filtros: un evaluador puede compartir el enlace de
 * la evidencia exacta que sustenta un dato del radar, y el boton de atras lo cierra.
 */
export function useDocument() {
  const [doc, setDoc] = useQueryState("doc", parseAsString);
  return {
    doc,
    open: (docId: string) => setDoc(docId),
    close: () => setDoc(null),
  };
}
