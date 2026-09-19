import type { paths } from "@/lib/api-types";
import { API_URL } from "@/lib/env";

/** Las respuestas del backend, tipadas desde su OpenAPI: nada se escribe a mano dos veces. */
type Get<P extends keyof paths> = paths[P] extends { get: { responses: { 200: { content: { "application/json": infer R } } } } }
  ? R
  : never;

export type Breakdown = Get<"/metadata/breakdown">;
export type Matrix = Get<"/entities/matrix">;
export type Graph = Get<"/entities/cooccurrence">;
export type Places = Get<"/places">;
export type Quadrant = Get<"/entities/quadrant">;
export type Timeline = Get<"/timeline">;
export type Document = Get<"/documents/{doc_id}">;

export class ApiError extends Error {}

/** Una peticion al backend. Los errores suben para que el panel muestre el motivo, no un vacio. */
export async function api<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(path, API_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new ApiError(`${response.status} en ${path}`);
  return (await response.json()) as T;
}
