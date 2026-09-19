"use client";

import { SendIcon } from "lucide-react";
import { useState } from "react";

import type { Activation } from "@/components/registry";
import { TOOLS } from "@/components/registry";

/** Lo que el agente contestó, y qué componentes activó al hacerlo. */
export type Turn = {
  readonly question: string;
  readonly answer: string | null;
  readonly activations: readonly Activation[];
  readonly error?: string;
};

const SUGGESTIONS = [
  "¿Qué entidades domina cada observatorio en seguridad espacial?",
  "¿Qué departamentos concentran las dinámicas territoriales?",
  "¿Qué actores aparecen juntos en el Catatumbo?",
];

/**
 * El analista. Es el mando del tablero: la pregunta en lenguaje natural decide qué componentes se
 * activan y con qué filtros, y el hilo deja ver cuáles fueron, que es lo que hace demostrable la
 * ejecución dinámica.
 */
export function ChatPanel({
  turns,
  pending,
  onAsk,
}: {
  readonly turns: readonly Turn[];
  readonly pending: boolean;
  readonly onAsk: (question: string) => void;
}) {
  const [draft, setDraft] = useState("");

  const ask = (question: string) => {
    const clean = question.trim();
    if (!clean || pending) return;
    setDraft("");
    onAsk(clean);
  };

  return (
    <section
      aria-label="Analista"
      className="border-border bg-surface flex h-full min-h-0 w-full flex-col border-l"
    >
      <header className="border-border border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Analista</h2>
        <p className="text-muted text-xs">Pregunta y el tablero se reorganiza</p>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4">
        {turns.length === 0 ? (
          <div className="space-y-3">
            <p className="text-muted text-xs">
              Cada afirmación va con el documento que la sustenta. Prueba con:
            </p>
            {SUGGESTIONS.map((suggestion) => (
              <button
                className="border-border hover:border-accent block w-full rounded-lg border px-3 py-2 text-left text-xs"
                key={suggestion}
                onClick={() => ask(suggestion)}
                type="button"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : (
          turns.map((turn, index) => (
            <article className="space-y-2" key={index}>
              <p className="bg-background rounded-lg px-3 py-2 text-[13px]">{turn.question}</p>
              {turn.error ? (
                <p className="text-muted text-xs">{turn.error}</p>
              ) : (
                <p className="text-[13px] leading-relaxed">{turn.answer}</p>
              )}
              {turn.activations.length > 0 ? (
                <ul className="text-muted flex flex-wrap gap-1 text-[11px]">
                  {turn.activations.map((activation) => (
                    <li className="border-border rounded-full border px-2 py-0.5" key={activation.tool}>
                      {TOOLS[activation.tool].label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))
        )}
        {pending ? <p className="text-muted text-xs">Consultando el corpus…</p> : null}
      </div>

      <form
        className="border-border border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          ask(draft);
        }}
      >
        <div className="border-border focus-within:border-accent flex items-end gap-2 rounded-lg border p-2">
          <textarea
            className="placeholder:text-muted max-h-28 min-h-9 flex-1 resize-none bg-transparent text-[13px] outline-none"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                ask(draft);
              }
            }}
            placeholder="Pregunta al corpus…"
            rows={1}
            value={draft}
          />
          <button
            aria-label="Enviar"
            className="bg-accent text-background grid size-8 shrink-0 place-items-center rounded-md disabled:opacity-40"
            disabled={pending || draft.trim() === ""}
            type="submit"
          >
            <SendIcon className="size-4" />
          </button>
        </div>
      </form>
    </section>
  );
}
