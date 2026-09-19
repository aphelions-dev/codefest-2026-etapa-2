"use client";

import {
  BadgeCheckIcon,
  BookOpenTextIcon,
  BrainIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  type LucideIcon,
  RouteIcon,
  ShieldCheckIcon,
  ShieldHalfIcon,
} from "lucide-react";
import { useState } from "react";

import { DocumentLink } from "@/components/document-view";
import { chunkLabel } from "@/components/highlight";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AgentRun, Cost, Source, ToolRun } from "@/lib/agent";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Cómo se llama y qué hace cada agente del grafo, en el orden en que actúan. */
const AGENTS: Record<string, { readonly name: string; readonly role: string; readonly icon: LucideIcon }> = {
  input_guardrail: { name: "Guardián de entrada", role: "Revisa la pregunta antes de que llegue a los demás", icon: ShieldCheckIcon },
  orchestrator: { name: "Orquestador", role: "Decide el camino y reformula la búsqueda", icon: RouteIcon },
  rag_analyst: { name: "Analista del corpus", role: "Busca en el índice y redacta citando cada afirmación", icon: BookOpenTextIcon },
  verifier: { name: "Verificador", role: "Comprueba que cada cita exista y que la respuesta sea fiel", icon: BadgeCheckIcon },
  output_guardrail: { name: "Guardián de salida", role: "Última revisión antes de responder", icon: ShieldHalfIcon },
};

/** Qué hace cada herramienta, en palabras. */
const TOOL_LABEL: Record<string, string> = {
  analyze_prompt_injection: "Busca intentos de inyección",
  filter_input: "Sanea la pregunta",
  route_intent: "Elige el camino",
  decompose_query: "Reformula la búsqueda",
  search_corpus: "Búsqueda semántica en el corpus",
  extract_fragments: "Aplica el umbral de evidencia",
  validate_traceability: "Comprueba que las citas existan",
  validate_faithfulness: "Comprueba la fidelidad a las fuentes",
  detect_injection: "Busca instrucciones en los fragmentos",
  analyze_response_toxicity: "Revisa el tono",
  detect_indirect_injection: "Busca inyección indirecta",
};

// Salidas que dicen que la comprobación no pasó: se marcan en ámbar en vez de con un visto.
const FAILED = /no fiel|infiel|rechaz|bloque|inyecci[oó]n detectada|t[oó]xic|no existe|falta|sin citas/i;

const seconds = (ms?: number) => (ms === undefined ? undefined : `${(ms / 1000).toFixed(1).replace(".", ",")} s`);

/** El resultado de una herramienta, legible: la ruta en palabras, la consulta entre comillas. */
function outcome(tool: ToolRun): string {
  if (tool.name === "route_intent") return tool.output === "corpus" ? "buscar en el corpus" : "responder sin buscar";
  if (tool.name === "decompose_query") return `«${tool.output}»`;
  if (tool.name === "filter_input") return tool.output === tool.input.message ? "sin cambios" : "saneada";
  return tool.output;
}

/** Los parámetros que dicen algo a quien lee: el fenómeno, cuántos fragmentos, el umbral. */
function detail(tool: ToolRun): string | null {
  if (tool.name === "search_corpus") {
    const parts = [
      tool.input.phenomenon ? `fenómeno ${String(tool.input.phenomenon)}` : "los tres fenómenos",
      tool.input.top_k ? `los ${String(tool.input.top_k)} más cercanos` : null,
    ];
    return parts.filter(Boolean).join(" · ");
  }
  if (tool.name === "extract_fragments" && tool.input.threshold !== undefined) {
    return `similitud mínima ${String(tool.input.threshold)}`;
  }
  return null;
}

/**
 * El razonamiento, tal como la respuesta lo declara: los agentes en el orden en que actuaron, con su
 * modelo, su parte del gasto y cada herramienta con lo que devolvió. No se reconstruye nada: todo
 * sale de `agentes_invocados`, `tokens_por_agente` y `tools_called`.
 */
export function AgentTrace({ agents, cost }: { readonly agents: readonly AgentRun[]; readonly cost: Cost }) {
  const [open, setOpen] = useState(false);
  if (agents.length === 0) return null;
  const tools = agents.reduce((sum, agent) => sum + agent.tools.length, 0);
  const spent = agents.reduce((sum, agent) => sum + (agent.tokens?.total ?? 0), 0);

  return (
    <Collapsible className="border-border/60 bg-card/40 rounded-lg border" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="hover:bg-muted/40 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors">
        <BrainIcon className="text-primary size-3.5 shrink-0" />
        <span className="text-[12px] font-medium">Razonamiento</span>
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-[11px] tabular-nums">
          {agents.length} agentes · {tools} pasos
          {seconds(cost.latency) ? ` · ${seconds(cost.latency)}` : ""}
          {cost.tokens ? ` · ${formatNumber(cost.tokens)} tokens` : ""}
        </span>
        <ChevronDownIcon className={cn("text-muted-foreground size-3.5 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>

      {/* Cerrado, el reparto del gasto entre agentes sigue a la vista: quién trabajó más. */}
      {spent > 0 ? (
        <div aria-hidden className="mx-2.5 mb-2 flex h-1 gap-px overflow-hidden rounded-full">
          {agents.map((agent, index) => (
            <div
              className="bg-primary"
              key={agent.id}
              style={{ width: `${((agent.tokens?.total ?? 0) / spent) * 100}%`, opacity: 1 - index * 0.16 }}
              title={`${AGENTS[agent.id]?.name ?? agent.id}: ${formatNumber(agent.tokens?.total ?? 0)} tokens`}
            />
          ))}
        </div>
      ) : null}

      <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0">
        <ol className="px-2.5 pb-2.5">
          {agents.map((agent, index) => {
            const meta = AGENTS[agent.id] ?? { name: agent.id, role: "", icon: CircleCheckIcon };
            const Icon = meta.icon;
            const share = spent && agent.tokens ? Math.round((agent.tokens.total / spent) * 100) : null;
            return (
              <li className="relative flex gap-2.5 pb-3 last:pb-0" key={agent.id}>
                {/* La línea une los agentes: es una cadena, no una lista suelta. */}
                {index < agents.length - 1 ? (
                  <span aria-hidden className="bg-border absolute top-6 bottom-0 left-[11px] w-px" />
                ) : null}
                <span className="bg-muted text-primary relative z-10 grid size-6 shrink-0 place-items-center rounded-full">
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-[12px] font-medium">{meta.name}</span>
                    {agent.model ? (
                      <span className="border-border/60 text-muted-foreground rounded border px-1 font-mono text-[9px]">
                        {agent.model}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">sin llamada al modelo</span>
                    )}
                    {agent.tokens ? (
                      <span className="text-muted-foreground ml-auto text-[10px] tabular-nums">
                        {formatNumber(agent.tokens.total)} tokens{share !== null ? ` · ${share} %` : ""}
                      </span>
                    ) : null}
                  </div>
                  {meta.role ? <p className="text-muted-foreground text-[11px] leading-snug">{meta.role}</p> : null}
                  {agent.tools.length > 0 ? (
                    <ul className="space-y-1 pt-0.5">
                      {agent.tools.map((tool, at) => {
                        const failed = FAILED.test(tool.output);
                        const extra = detail(tool);
                        return (
                          <li className="flex items-start gap-1.5 text-[11px] leading-snug" key={`${tool.name}-${at}`}>
                            {failed ? (
                              <CircleAlertIcon className="text-f3 mt-px size-3 shrink-0" />
                            ) : (
                              <CircleCheckIcon className="mt-px size-3 shrink-0 text-emerald-400/80" />
                            )}
                            <span className="min-w-0 break-words">
                              <span className="text-foreground/85">{TOOL_LABEL[tool.name] ?? tool.name}</span>
                              {extra ? <span className="text-muted-foreground"> ({extra})</span> : null}
                              <span className="text-muted-foreground"> → {outcome(tool)}</span>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-muted-foreground border-border/60 border-t px-2.5 py-1.5 text-[10px] tabular-nums">
          {cost.interactions} llamada{cost.interactions === 1 ? "" : "s"} al modelo · {formatNumber(cost.tokens)} tokens
          {seconds(cost.latency) ? ` · ${seconds(cost.latency)} de principio a fin` : ""}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Lo que el agente leyó, separando lo que cita de lo que solo consultó: cada fragmento con el
 * principio de su texto y un enlace que lo abre en su sitio del documento.
 */
export function AnswerSources({ sources }: { readonly sources: readonly Source[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;
  // Un documento puede llegar en varios fragmentos: se lista una vez, por el mejor colocado.
  const unique = sources.filter((source, index) => sources.findIndex((other) => other.docId === source.docId) === index);
  const cited = unique.filter((source) => source.cited);
  const rest = unique.filter((source) => !source.cited);

  return (
    <Collapsible className="px-0.5" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-[11px] transition-colors">
        <BookOpenTextIcon className="size-3.5" />
        {cited.length > 0
          ? `${cited.length} ${cited.length === 1 ? "fuente citada" : "fuentes citadas"} de ${unique.length} documentos leídos`
          : `${unique.length} documentos leídos`}
        <ChevronDownIcon className={cn("size-3 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 mt-2 space-y-1.5">
        {[...cited, ...rest].map((source) => (
          <DocumentLink
            chunkId={source.chunkId}
            className={cn(
              "border-border/60 hover:border-primary/50 hover:bg-muted/40 block rounded-md border px-2 py-1.5 no-underline transition-colors",
              !source.cited && "opacity-60",
            )}
            docId={source.docId}
            key={source.chunkId}
          >
            <span className="flex items-center gap-1.5 text-[10px]">
              <span className={cn("font-medium", source.cited ? "text-primary" : "text-muted-foreground")}>
                {source.docId}
              </span>
              <span className="text-muted-foreground">· {chunkLabel(source.chunkId)}</span>
              {!source.cited ? <span className="text-muted-foreground ml-auto font-sans">leído, no citado</span> : null}
            </span>
            <span className="text-muted-foreground line-clamp-2 font-sans text-[11px] leading-snug">{source.excerpt}</span>
          </DocumentLink>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Qué significa cada estado que no es «ok», en palabras de quien pregunta. */
const STATUS: Record<string, string> = {
  sin_evidencia: "El corpus no tiene evidencia suficiente: el radar prefiere no afirmar lo que no puede citar.",
  no_verificada: "El verificador no pudo confirmar todas las afirmaciones: léela con cautela y revisa sus fuentes.",
  error_entrada_bloqueada: "La pregunta se bloqueó en la revisión de seguridad.",
  error_salida_bloqueada: "La respuesta se bloqueó en la revisión final.",
};

/** El estado que devolvió el agente, explicado, para que un rechazo no se lea como una respuesta. */
export function AgentStatus({ status }: { readonly status: string }) {
  if (status === "ok") return null;
  return (
    <p className="border-f3/40 bg-f3/5 text-foreground/85 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[11px] leading-snug">
      <CircleAlertIcon className="text-f3 mt-px size-3.5 shrink-0" />
      {STATUS[status] ?? `Estado: ${status}`}
    </p>
  );
}

/**
 * Mientras el agente trabaja. No hay streaming, así que no se finge en qué paso va: se enseña la
 * cadena que va a recorrer, con un pulso que dice que está en marcha.
 */
export function AgentPending() {
  return (
    <div className="border-border/60 bg-card/40 space-y-2 rounded-lg border px-2.5 py-2" role="status">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="relative flex size-2">
          <span className="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-60" />
          <span className="bg-primary relative inline-flex size-2 rounded-full" />
        </span>
        Los agentes están trabajando…
      </div>
      <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-[10px]">
        {Object.entries(AGENTS).map(([id, meta], index) => {
          const Icon = meta.icon;
          return (
            <li className="flex items-center gap-1" key={id}>
              {index > 0 ? <span aria-hidden>→</span> : null}
              <span className="border-border/60 flex items-center gap-1 rounded-full border px-1.5 py-0.5">
                <Icon className="size-3" />
                {meta.name}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
