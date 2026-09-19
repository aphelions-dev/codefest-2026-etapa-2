import { API_URL, SURFACE } from "@/lib/env";

/** Esqueleto: confirma que la imagen se despliega y contra que backend apunta. Las dos superficies
 *  crecen desde aqui, el tablero de componentes y el chat de pruebas manuales. */
export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold">Radar Estratégico de Tendencias Aeroespaciales</h1>
        <p className="text-muted text-sm">
          Superficie <code className="text-accent">{SURFACE}</code>, contra{" "}
          <code className="text-accent">{API_URL}</code>.
        </p>
      </div>
    </main>
  );
}
