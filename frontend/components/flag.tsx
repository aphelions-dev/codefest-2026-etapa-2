import { cn } from "@/lib/utils";

// Países de Amazon Underworld, que llegan por nombre y no por código.
export const AMAZON_COUNTRY_ISO2: Record<string, string> = {
  Bolivia: "BO", Brasil: "BR", Colombia: "CO", Ecuador: "EC", Perú: "PE", Venezuela: "VE",
};

/**
 * Bandera SVG de `flag-icons` y no emoji: Windows no dibuja los emojis de bandera y mostraría "CO".
 * Decorativa: el nombre del país siempre va al lado.
 */
export function Flag({ code, className }: { code: string | null | undefined; className?: string }) {
  if (!code) return null;
  return <span aria-hidden className={cn("fi shrink-0 rounded-[2px]", `fi-${code.toLowerCase()}`, className)} />;
}
