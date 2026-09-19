"use client";

import { ArrowUpRightIcon, LayoutDashboardIcon, MessageSquareIcon } from "lucide-react";
import { useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * El chat y el tablero son dos despliegues de la misma imagen en `frontagent.` y `dashboard.`, así
 * que cada uno sabe dónde está el otro cambiando el primer nivel del nombre de host: no hace falta
 * ninguna variable más. En local no hay otro, y el enlace no se pinta.
 */
const SUBDOMAIN = { chat: "frontagent", dashboard: "dashboard" } as const;

const noop = () => () => {};

function useCounterpart(to: keyof typeof SUBDOMAIN) {
  const host = useSyncExternalStore(noop, () => window.location.host, () => null);
  if (!host) return null;
  const [first, ...rest] = host.split(".");
  const from = to === "dashboard" ? SUBDOMAIN.chat : SUBDOMAIN.dashboard;
  return first === from && rest.length > 0 ? `${window.location.protocol}//${SUBDOMAIN[to]}.${rest.join(".")}` : null;
}

export function SurfaceLink({ to, className }: { readonly to: keyof typeof SUBDOMAIN; readonly className?: string }) {
  const href = useCounterpart(to);
  if (!href) return null;
  const Icon = to === "dashboard" ? LayoutDashboardIcon : MessageSquareIcon;
  return (
    <a
      className={cn(
        "border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/50 flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
        className,
      )}
      href={href}
      rel="noreferrer"
      target="_blank"
      title={to === "dashboard" ? "Abrir el tablero del radar en otra pestaña" : "Abrir el chat del asistente en otra pestaña"}
    >
      <Icon className="size-3.5" />
      {to === "dashboard" ? "Tablero" : "Chat"}
      <ArrowUpRightIcon className="size-3" />
    </a>
  );
}
