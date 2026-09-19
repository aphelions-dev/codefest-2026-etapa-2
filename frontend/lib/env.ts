/** Validadas al compilar en `next.config.ts`: aqui ya se pueden dar por buenas. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL as string;

/** Que superficie sirve esta imagen: el tablero completo o solo el chat de pruebas manuales. */
export const SURFACE = (process.env.NEXT_PUBLIC_SURFACE ?? "dashboard") as "dashboard" | "chat";
