import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Radar Estratégico de Tendencias Aeroespaciales",
  description:
    "Tablero y asistente sobre inteligencia artificial militar, seguridad espacial y dinámicas territoriales en América Latina.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        {/* Los filtros globales viven en la URL, para que un enlace lleve el filtro puesto. */}
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
