import type { Metadata } from "next";
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
