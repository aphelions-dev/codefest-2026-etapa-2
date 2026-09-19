import { Suspense } from "react";

import { TooltipProvider } from "@/components/ui/tooltip";

import { Chat } from "@/components/chat/surface";
import { Dashboard } from "@/components/dashboard";
import { SURFACE } from "@/lib/env";

/**
 * La misma imagen sirve las dos superficies. El tablero es el Reto 2; el chat a secas es el
 * frontend de pruebas manuales del Reto 1, que se despliega aparte para que retocar el tablero no
 * pueda tumbarlo durante su ventana de evaluación.
 *
 * El tablero lee el filtro global de la URL, y eso obliga a un límite de Suspense para que la
 * página se pueda prerenderizar.
 */
export default function Home() {
  if (SURFACE === "chat") return <Chat />;
  return (
    <TooltipProvider delayDuration={300}>
      <Suspense fallback={<main className="grid h-dvh place-items-center text-sm">Cargando el radar…</main>}>
        <Dashboard />
      </Suspense>
    </TooltipProvider>
  );
}
