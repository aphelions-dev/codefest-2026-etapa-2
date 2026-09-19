import type { NextConfig } from "next";

// Se incrusta en el bundle al compilar: si falta, el tablero se despliega llamando a un backend que
// no existe y falla en silencio. En local la da `.env.development`; en la imagen, el build arg.
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!apiUrl || !URL.canParse(apiUrl)) {
  throw new Error(`NEXT_PUBLIC_API_URL tiene que ser la URL del backend, y vale "${apiUrl ?? ""}"`);
}

// La misma imagen sirve los dos subdominios: el tablero completo y el chat de pruebas manuales.
const surface = process.env.NEXT_PUBLIC_SURFACE ?? "dashboard";
if (surface !== "dashboard" && surface !== "chat") {
  throw new Error(`NEXT_PUBLIC_SURFACE tiene que ser "dashboard" o "chat", y vale "${surface}"`);
}

const nextConfig: NextConfig = {
  // Imagen minima: server.js con solo las dependencias que el trazado encuentra.
  output: "standalone",
  // El indicador de desarrollo tapa la esquina donde van los controles del mapa.
  devIndicators: false,
  // Sin optimizador de imagenes: evita arrastrar sharp al contenedor.
  images: { unoptimized: true },
  poweredByHeader: false,
  // Memoiza componentes y derivados al compilar: el codigo propio va sin useMemo ni useCallback.
  reactCompiler: true,
  // Sin Content-Security-Policy mientras no se pruebe en produccion: MapLibre carga workers y
  // teselas de otro origen, y una CSP a ciegas rompe el mapa sin avisar.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
