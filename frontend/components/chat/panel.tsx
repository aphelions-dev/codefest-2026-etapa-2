"use client";

import { CheckIcon, CopyIcon, MessageSquareIcon, PanelRightCloseIcon, PanelRightOpenIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";

import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { AgentLive, AgentStatus, AgentTrace, AnswerSources } from "@/components/agent-trace";
import { AnswerCharts } from "@/components/chat/answer-charts";
import { IconButton } from "@/components/icon-button";
import { GLASS } from "@/components/map/panel";
import { type Activation, TOOLS } from "@/components/registry";
import { DocumentLink } from "@/components/document-view";
import { SurfaceLink } from "@/components/surface-link";
import { type AgentRun, type Cost, linkCitations, parseCitation, type Progress, type Source } from "@/lib/agent";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

/**
 * Las citas del cuerpo de la respuesta se pintan como enlace al fragmento que las sostiene; el
 * resto de enlaces, como enlaces normales.
 */
function CitationAnchor({ href, children, ...props }: ComponentProps<"a">) {
  const citation = parseCitation(href);
  if (!citation) {
    return (
      <a href={href} rel="noreferrer" target="_blank" {...props}>
        {children}
      </a>
    );
  }
  return (
    <DocumentLink chunkId={citation.chunkId} docId={citation.docId}>
      {children}
    </DocumentLink>
  );
}

const RESPONSE_COMPONENTS = { a: CitationAnchor };

/** Lo que el agente contestó, y qué componentes activó al hacerlo. */
export type Turn = {
  readonly question: string;
  readonly answer: string | null;
  readonly activations: readonly Activation[];
  readonly agents?: readonly AgentRun[];
  readonly sources?: readonly Source[];
  readonly cost?: Cost;
  readonly status?: string;
  readonly error?: string;
  /** `doc_id` → `chunk_id`: a qué fragmento lleva cada cita del texto. */
  readonly anchors?: Record<string, string>;
};

// Una pregunta por fenómeno: quien llega ve de qué va el corpus y qué se le puede pedir.
const SUGGESTIONS = [
  { tag: "F1", text: "¿Qué desafíos plantea la IA en las operaciones militares?" },
  { tag: "F2", text: "¿Qué riesgos genera la basura espacial en la órbita baja?" },
  { tag: "F3", text: "¿Qué grupos armados operan en el Putumayo?" },
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
  subtitle = "Pregunta y el radar se reorganiza",
  standalone = false,
  live = [],
  visualized = null,
  asking = null,
  onOpenComponent,
}: {
  readonly turns: readonly Turn[];
  readonly pending: boolean;
  readonly collapsed?: boolean;
  readonly onAsk: (question: string) => void;
  readonly onToggle?: () => void;
  /** Lo que dice la cabecera: en el tablero, que el radar responde; a solas, qué es el asistente. */
  readonly subtitle?: string;
  /** A solas no hay tablero: los componentes que activó la respuesta no se enseñan. */
  readonly standalone?: boolean;
  /** Los agentes que ya terminaron en la pregunta en curso, en vivo. */
  readonly live?: readonly Progress[];
  /** Cuántos componentes eligió ya el visualizador en la pregunta en curso. */
  readonly visualized?: number | null;
  /** La pregunta que se está respondiendo: se ve en el hilo desde que se envía. */
  readonly asking?: string | null;
  /** En el tablero, abrir un componente de la respuesta en el diálogo grande. */
  readonly onOpenComponent?: (tool: Activation["tool"]) => void;
}) {
  // Plegado, todo el riel abre el analista: no hace falta atinar al icono.
  if (collapsed) {
    return (
      <aside className={cn(GLASS, "border-border/60 h-full border-l")}>
        <button
          aria-label="Abrir el analista"
          className="group hover:bg-muted/40 flex h-full w-full flex-col items-center gap-3 py-3 transition-colors"
          onClick={onToggle}
          title="Abrir el analista"
          type="button"
        >
          <PanelRightOpenIcon className="text-muted-foreground group-hover:text-foreground size-4" />
          <MessageSquareIcon className="text-primary size-4" />
          <span className="text-muted-foreground group-hover:text-foreground text-[11px] [writing-mode:vertical-rl]">
            Analista{turns.length > 0 ? ` · ${turns.length}` : ""}
          </span>
        </button>
      </aside>
    );
  }

  return (
    <aside className={cn(GLASS, "border-border/60 flex h-full min-h-0 flex-col border-l")}>
      <header className="border-border/60 flex items-center gap-2 border-b px-3 py-2.5">
        <MessageSquareIcon className="text-primary size-4" />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] leading-tight font-medium">Analista</h2>
          <p className="text-muted-foreground text-[11px] leading-snug">{subtitle}</p>
        </div>
        {/* Solo aparece en el chat a solas: lleva al tablero, donde la pregunta activa componentes. */}
        <SurfaceLink to="dashboard" />
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
              <p className="text-muted-foreground text-[12px] leading-relaxed">
                Pregunta sobre IA y capacidades estratégicas, seguridad del entorno espacial o dinámicas
                territoriales. Cinco agentes revisan, buscan, redactan y verifican, y cada afirmación va con el
                documento que la sustenta.
              </p>
              {/* Columna y no la fila con scroll de ai-elements: en un panel estrecho, esa fila se sale por la derecha. */}
              <div className="flex flex-col gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <Suggestion
                    className="h-auto w-full justify-start gap-2 rounded-lg py-2 text-left text-[12px] whitespace-normal"
                    key={suggestion.text}
                    onClick={() => onAsk(suggestion.text)}
                    suggestion={suggestion.text}
                  >
                    <span className="text-muted-foreground font-mono text-[10px]">{suggestion.tag}</span>
                    {suggestion.text}
                  </Suggestion>
                ))}
              </div>
            </div>
          ) : (
            turns.map((turn, index) => (
              <TurnView
                key={index}
                onAsk={onAsk}
                onOpenComponent={onOpenComponent}
                pending={pending}
                standalone={standalone}
                turn={turn}
              />
            ))
          )}
          {/* Mientras trabajan: cada agente se marca en cuanto el backend dice que terminó. */}
          {pending && asking ? (
            <Message from="user">
              <MessageContent className="text-[13px]">{asking}</MessageContent>
            </Message>
          ) : null}
          {pending ? <AgentLive steps={live} visualized={visualized} /> : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* El margen va en un contenedor: la caja ocupa todo su ancho, y con margen propio se salía del panel. */}
      <div className="p-3">
      <PromptInput
        className="border-border/60 rounded-lg border"
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
      </div>
    </aside>
  );
}

/** Una pregunta y lo que volvió: la respuesta, su estado, sus fuentes y cómo se llegó a ella. */
function TurnView({
  turn,
  pending,
  standalone,
  onAsk,
  onOpenComponent,
}: {
  readonly turn: Turn;
  readonly pending: boolean;
  readonly standalone: boolean;
  readonly onAsk: (question: string) => void;
  readonly onOpenComponent?: (tool: Activation["tool"]) => void;
}) {
  const charts = turn.activations.filter((activation) => activation.byAgent);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(turn.answer ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-2">
      <Message from="user">
        <MessageContent className="text-[13px]">{turn.question}</MessageContent>
      </Message>
      <Message from="assistant">
        <MessageContent className="text-[13px] leading-relaxed">
          {turn.error ? (
            <span className="text-muted-foreground text-[12px]">{turn.error}</span>
          ) : (
            // Markdown, y cada cita enlazada a su fragmento: la viñeta que afirma algo y el texto
            // que lo sustenta quedan a un clic.
            <MessageResponse components={RESPONSE_COMPONENTS}>
              {linkCitations(turn.answer ?? "", turn.anchors ?? {})}
            </MessageResponse>
          )}
        </MessageContent>
      </Message>

      {turn.status ? <AgentStatus status={turn.status} /> : null}
      {/* Lo que eligió el visualizador, dibujado aquí mismo: la respuesta también es gráfica. */}
      {charts.length > 0 ? <AnswerCharts activations={charts} onOpen={standalone ? undefined : onOpenComponent} /> : null}
      {turn.sources ? <AnswerSources sources={turn.sources} /> : null}
      {turn.agents && turn.cost ? <AgentTrace agents={turn.agents} cost={turn.cost} /> : null}

      <div className="flex flex-wrap items-center gap-1">
        {!standalone && charts.length === 0 && turn.activations.length > 0 ? (
          <ul aria-label="Componentes que activó" className="text-muted-foreground flex flex-wrap gap-1 text-[10px]">
            {turn.activations.map((activation) => {
              const Icon = TOOLS[activation.tool].icon;
              return (
                <li className="border-border/60 flex items-center gap-1 rounded-full border px-2 py-0.5" key={activation.tool}>
                  <Icon className="size-3" />
                  {TOOLS[activation.tool].label}
                </li>
              );
            })}
          </ul>
        ) : null}
        <MessageActions className="ml-auto">
          {turn.error ? (
            // Reintentar lo decide quien pregunta: el agente no reintenta solo, que contaría como
            // interacción en la eficiencia.
            <MessageAction disabled={pending} label="Reintentar" onClick={() => onAsk(turn.question)} tooltip="Reintentar">
              <RotateCcwIcon className="size-3.5" />
            </MessageAction>
          ) : (
            <MessageAction label="Copiar la respuesta" onClick={copy} tooltip={copied ? "Copiada" : "Copiar"}>
              {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
            </MessageAction>
          )}
        </MessageActions>
      </div>
    </div>
  );
}
