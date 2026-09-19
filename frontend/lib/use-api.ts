"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/** Carga un endpoint y expone los tres estados. Sin datos inventados mientras llega la respuesta. */
export function useApi<T>(path: string | null, params: Record<string, string | number | undefined> = {}): State<T> {
  const key = `${path}?${JSON.stringify(params)}`;
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: path !== null });

  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    api<T>(path, params)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error: Error) => live && setState({ data: null, error: error.message, loading: false }));
    return () => {
      live = false;
    };
    // El backend cambia solo cuando cambia la ruta o un filtro, y eso es lo que codifica `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
