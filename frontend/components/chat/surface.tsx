"use client";

import { useState } from "react";

import { ChatPanel, type Turn } from "@/components/chat/panel";
import { AgentUnavailable, ask } from "@/lib/agent";

/**
 * El chat a secas, sin tablero: es el frontend que permite interactuar manualmente con el agente
 * durante la evaluación del Reto 1. Comparte el panel con el tablero, así que no hay dos chats que
 * mantener.
 */
export function Chat() {
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [pending, setPending] = useState(false);

  const onAsk = async (question: string) => {
    setPending(true);
    try {
      const { answer, activations, steps, cost, status } = await ask(question);
      setTurns((previous) => [...previous, { question, answer, activations, steps, cost, status }]);
    } catch (error) {
      const message = error instanceof AgentUnavailable ? error.message : "El agente falló.";
      setTurns((previous) => [...previous, { question, answer: null, activations: [], error: message }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="mx-auto h-dvh w-full max-w-2xl">
      <ChatPanel onAsk={onAsk} pending={pending} turns={turns} />
    </main>
  );
}
