"use client";

import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type IconButtonProps = ComponentProps<typeof Button> & {
  /** Nombre accesible y texto del tooltip: un botón solo con icono siempre dice qué hace. */
  label: string;
  side?: ComponentProps<typeof TooltipContent>["side"];
};

/** El único botón de icono de la interfaz: mismo tamaño, mismo hover y tooltip en todos los paneles. */
export function IconButton({ label, side = "bottom", variant = "ghost", size = "icon-sm", children, ...props }: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size={size} aria-label={label} className="text-muted-foreground" {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
