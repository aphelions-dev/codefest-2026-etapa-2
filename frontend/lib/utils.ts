import { twMerge } from "tailwind-merge";

/** Une clases de Tailwind resolviendo las que se contradicen. */
export function cn(...inputs: (string | false | null | undefined)[]): string {
  return twMerge(inputs.filter(Boolean).join(" "));
}
