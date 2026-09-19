"use client";

import { useState } from "react";

import { ChatPanel, type Turn } from "@/components/chat/panel";
import { DocumentView } from "@/components/document-view";
import { AgentUnavailable, askStream, type Progress } from "@/lib/agent";

/**
 * El chat a secas, sin tablero: es el frontend que permite interactuar manualmente con el agente
 * durante la evaluación del Reto 1. Comparte el panel con el tablero, así que no hay dos chats que
 * mantener.
 */
export function Chat() {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [live, setLive] = useState<readonly Progress[]>([]);
  const [asking, setAsking] = useState<string | null>(null);

  const onAsk = async (question: string) => {
    setPending(true);
    setLive([]);
    setAsking(question);
    try {
      const result = await askStream(question, (step) => setLive((previous) => [...previous, step]));
      setTurns((previous) => [...previous, { question, ...result }]);
    } catch (error) {
      const message = error instanceof AgentUnavailable ? error.message : "El agente falló.";
      setTurns((previous) => [...previous, { question, answer: null, activations: [], error: message }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="mx-auto h-dvh w-full max-w-3xl border-x border-border/60">
      <ChatPanel
        onAsk={onAsk}
        asking={asking}
        live={live}
        pending={pending}
        standalone
        subtitle="Asistente del Radar Estratégico · cada afirmación con su fuente del corpus"
        turns={turns}
      />
      {/* Las citas y las fuentes abren el documento aquí también, no solo en el tablero. */}
      <DocumentView />
    </main>
  );
}
