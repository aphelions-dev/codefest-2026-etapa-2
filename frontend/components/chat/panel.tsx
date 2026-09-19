"use client";

import { MessageSquareIcon, PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";

import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { AgentStatus, AgentTrace, type Cost } from "@/components/agent-trace";
import { IconButton } from "@/components/icon-button";
import { GLASS } from "@/components/map/panel";
import { type Activation, TOOLS } from "@/components/registry";
import type { Step } from "@/lib/agent";
import { cn } from "@/lib/utils";

/** Lo que el agente contestó, y qué componentes activó al hacerlo. */
export type Turn = {
  readonly question: string;
  readonly answer: string | null;
  readonly activations: readonly Activation[];
  readonly steps?: readonly Step[];
  readonly cost?: Cost;
  readonly status?: string;
  readonly error?: string;
};

const SUGGESTIONS = [
  "¿Qué entidades domina cada observatorio en seguridad espacial?",
  "¿Qué departamentos concentran las dinámicas territoriales?",
  "¿Qué actores aparecen juntos en el corpus territorial?",
];

/**
 * El analista es el mando del radar: la pregunta en lenguaje natural decide qué componentes se
 * activan y con qué filtros. El hilo deja ver cuáles fueron, que es lo que hace demostrable la
 * ejecución dinámica ante quien evalúa.
 */
export function ChatPanel({
  turns,
  pending,
  collapsed,
  onAsk,
  onToggle,
}: {
  readonly turns: readonly Turn[];
  readonly pending: boolean;
  readonly collapsed?: boolean;
  readonly onAsk: (question: string) => void;
  readonly onToggle?: () => void;
}) {
  if (collapsed) {
    return (
      <aside className={cn(GLASS, "border-border/60 flex h-full flex-col items-center gap-2 border-l py-3")}>
        <IconButton label="Abrir el analista" onClick={onToggle} side="left">
          <PanelRightOpenIcon className="size-4" />
        </IconButton>
        <MessageSquareIcon className="text-muted-foreground size-4" />
      </aside>
    );
  }

  return (
    <aside className={cn(GLASS, "border-border/60 flex h-full min-h-0 flex-col border-l")}>
      <header className="border-border/60 flex items-center gap-2 border-b px-3 py-2.5">
        <MessageSquareIcon className="text-primary size-4" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] leading-tight font-medium">Analista</h2>
          <p className="text-muted-foreground text-[11px] leading-snug">Pregunta y el radar se reorganiza</p>
        </div>
        {onToggle ? (
          <IconButton label="Plegar el analista" onClick={onToggle} side="left">
            <PanelRightCloseIcon className="size-4" />
          </IconButton>
        ) : null}
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-4 px-3 py-3">
          {turns.length === 0 ? (
            <div className="space-y-3">
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                IA y capacidades estratégicas, seguridad del entorno espacial o dinámicas territoriales. Cada
                afirmación va con el documento que la sustenta.
              </p>
              <Suggestions className="flex-col items-stretch">
                {SUGGESTIONS.map((suggestion) => (
                  <Suggestion
                    className="h-auto justify-start py-2 text-left text-[11px] whitespace-normal"
                    key={suggestion}
                    onClick={() => onAsk(suggestion)}
                    suggestion={suggestion}
                  />
                ))}
              </Suggestions>
            </div>
          ) : (
            turns.map((turn, index) => (
              <div className="space-y-2" key={index}>
                <Message from="user">
                  <MessageContent className="text-[13px]">{turn.question}</MessageContent>
                </Message>
                <Message from="assistant">
                  <MessageContent className="text-[13px]">
                    {turn.error ? (
                      <span className="text-muted-foreground text-[11px]">{turn.error}</span>
                    ) : (
                      turn.answer
                    )}
                  </MessageContent>
                </Message>
                {turn.steps && turn.steps.length > 0 ? (
                  <AgentTrace cost={turn.cost} steps={turn.steps} />
                ) : null}
                {turn.status ? <AgentStatus status={turn.status} /> : null}
                {turn.activations.length > 0 ? (
                  <ul className="text-muted-foreground flex flex-wrap gap-1 px-1 text-[10px]">
                    {turn.activations.map((activation) => (
                      <li className="border-border/60 rounded-full border px-2 py-0.5" key={activation.tool}>
                        {TOOLS[activation.tool].label} · {TOOLS[activation.tool].task}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))
          )}
          {pending ? <p className="text-muted-foreground px-1 text-[11px]">Consultando el corpus…</p> : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        className="border-border/60 m-3 rounded-lg border"
        onSubmit={(message) => {
          const text = message.text?.trim();
          if (text && !pending) onAsk(text);
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea className="text-[13px]" placeholder="Pregunta al corpus…" />
          <PromptInputFooter className="px-2 pb-2">
            <span className="text-muted-foreground text-[10px]">Solo evidencia del corpus</span>
            <PromptInputSubmit disabled={pending} status={pending ? "submitted" : undefined} />
          </PromptInputFooter>
        </PromptInputBody>
      </PromptInput>
    </aside>
  );
}
