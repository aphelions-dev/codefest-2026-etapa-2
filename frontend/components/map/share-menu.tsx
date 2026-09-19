"use client";

import { CheckIcon, DownloadIcon, ImageIcon, LinkIcon, Share2Icon } from "lucide-react";
import type { Map as MapLibre } from "maplibre-gl";
import { type RefObject, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { composeSnapshot, type Snapshot } from "@/lib/snapshot";
import { cn } from "@/lib/utils";

type Done = "descargada" | "copiada" | "enlace" | "error" | null;

/**
 * Compartir la vista actual: la imagen de la tarjeta —descargada o en el portapapeles, para
 * pegarla en un chat o una presentación— o el enlace, que ya lleva en la URL el fenómeno, la capa,
 * el nivel, el periodo y la entidad, así que abre exactamente lo mismo.
 */
export function ShareMenu({
  map,
  snapshot,
  className,
}: {
  readonly map: RefObject<MapLibre | null>;
  /** Lo que la tarjeta cuenta, leído en el momento de compartir. */
  readonly snapshot: () => Snapshot;
  readonly className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done>(null);

  const flash = (value: Done) => {
    setDone(value);
    setTimeout(() => setDone(null), 2200);
  };

  const image = async () => {
    if (!map.current) throw new Error("El mapa aún no está listo.");
    return composeSnapshot(map.current, snapshot());
  };

  const run = async (action: () => Promise<Done>) => {
    setBusy(true);
    try {
      flash(await action());
    } catch {
      flash("error");
    } finally {
      setBusy(false);
    }
  };

  const download = () =>
    run(async () => {
      const url = URL.createObjectURL(await image());
      const link = document.createElement("a");
      link.href = url;
      link.download = `radar-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`;
      link.click();
      URL.revokeObjectURL(url);
      return "descargada";
    });

  const copyImage = () =>
    run(async () => {
      // El portapapeles acepta la promesa del blob: así el gesto del usuario no caduca mientras se dibuja.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image() })]);
      return "copiada";
    });

  const copyLink = () =>
    run(async () => {
      await navigator.clipboard.writeText(window.location.href);
      return "enlace";
    });

  const label =
    done === "descargada"
      ? "Imagen descargada"
      : done === "copiada"
        ? "Imagen copiada"
        : done === "enlace"
          ? "Enlace copiado"
          : done === "error"
            ? "No se pudo compartir"
            : null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label ? (
        <span
          className={cn(
            "bg-popover/95 animate-in fade-in-0 rounded-md border px-2 py-1 text-[11px] shadow-lg",
            done === "error" ? "text-f3" : "text-foreground",
          )}
          role="status"
        >
          {label}
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Compartir la vista"
            className="bg-background/90 size-8 shadow-lg backdrop-blur"
            disabled={busy}
            size="icon-sm"
            title="Compartir la vista"
            variant="outline"
          >
            {done && done !== "error" ? <CheckIcon className="text-primary size-4" /> : <Share2Icon className="size-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-muted-foreground text-[11px] font-normal">
            La vista con sus filtros, leyenda y ranking
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={download}>
            <DownloadIcon />
            Descargar imagen
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copyImage}>
            <ImageIcon />
            Copiar imagen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={copyLink}>
            <LinkIcon />
            Copiar enlace a esta vista
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
