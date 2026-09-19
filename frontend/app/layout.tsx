import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// Banderas SVG: Windows no dibuja los emojis de bandera y mostraria el codigo del pais.
import "flag-icons/css/flag-icons.min.css";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Radar Estratégico de Tendencias Aeroespaciales",
  description:
    "Tablero y asistente sobre inteligencia artificial militar, seguridad espacial y dinámicas territoriales en América Latina.",
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html className={cn("dark h-full font-sans antialiased", geistMono.variable, inter.variable)} lang="es">
      <body className="flex min-h-full flex-col">
        {/* Los filtros globales viven en la URL, para que un enlace lleve el filtro puesto. */}
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
