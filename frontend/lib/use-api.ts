"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

type State<T> = { data: T | null; error: string | null; loading: boolean };

// Lo último que respondió el backend y a qué petición: con eso se deriva si está cargando.
type Answer<T> = { readonly key: string; readonly data: T | null; readonly error: string | null };

/**
 * Carga un endpoint y expone los tres estados. Sin datos inventados mientras llega la respuesta.
 *
 * `loading` no se guarda: es que la última respuesta no corresponde a la petición actual. Mientras
 * llega la nueva se conservan los datos anteriores, que es lo que deja al mapa seguir pintado y
 * mostrar solo una barra de progreso al cambiar un filtro.
 */
export function useApi<T>(path: string | null, params: Record<string, string | number | undefined> = {}): State<T> {
  const key = `${path}?${JSON.stringify(params)}`;
  const [answer, setAnswer] = useState<Answer<T> | null>(null);

  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path, params)
      .then((data) => live && setAnswer({ key, data, error: null }))
      .catch((error: Error) => live && setAnswer({ key, data: null, error: error.message }));
    return () => {
      live = false;
    };
    // El backend cambia solo cuando cambia la ruta o un filtro, y eso es lo que codifica `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = answer?.key === key;
  return {
    data: answer?.data ?? null,
    error: current ? (answer?.error ?? null) : null,
    loading: path !== null && !current,
  };
}
