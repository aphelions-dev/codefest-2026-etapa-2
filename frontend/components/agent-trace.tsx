"use client";

import { DatabaseZapIcon, NetworkIcon, PenLineIcon, SearchIcon, ShieldCheckIcon, TableIcon } from "lucide-react";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { TOOLS, type ToolName } from "@/components/registry";
import type { Step } from "@/lib/agent";
import { cn } from "@/lib/utils";

const ICONS: Record<ToolName, typeof SearchIcon> = {
  search_corpus: SearchIcon,
  get_metadata_breakdown: DatabaseZapIcon,
  get_entity_matrix: TableIcon,
  get_cooccurrence: NetworkIcon,
  get_places: DatabaseZapIcon,
  get_timeline: DatabaseZapIcon,
  get_document: ShieldCheckIcon,
};

const seconds = (ms?: number) => (ms === undefined ? undefined : `${(ms / 1000).toFixed(1)} s`);

/**
 * El razonamiento del agente, tal como su respuesta lo declara: qué agentes participaron, qué
 * herramientas llamó con qué parámetros y cuánto costó.
 *
 * Se construye desde `agentes_invocados`, `tools_called` y `metadata` de la respuesta, que la
 * especificación ya obliga a devolver. Mostrarlo no cuesta un token adicional y es lo que permite
 * a quien evalúa comprobar que el componente activado es el que correspondía a la pregunta.
 */
export function AgentTrace({ steps, cost }: { readonly steps: readonly Step[]; readonly cost?: Cost }) {
  if (steps.length === 0 && !cost) return null;

  return (
    <ChainOfThought className="px-1">
      <ChainOfThoughtHeader>Cómo se respondió</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {steps.map((step, index) => {
          const Icon = step.tool ? ICONS[step.tool] : PenLineIcon;
          const label = step.tool ? TOOLS[step.tool].label : step.agent;
          return (
            <ChainOfThoughtStep
              description={step.detail}
              icon={Icon}
              key={`${step.agent}-${index}`}
              label={label}
              status="complete"
            />
          );
        })}
        {cost ? (
          <p className="text-muted-foreground mt-1 px-1 text-[10px]">
            {cost.interactions} llamada{cost.interactions === 1 ? "" : "s"} al modelo ·{" "}
            {cost.tokens.toLocaleString("es")} tokens
            {seconds(cost.latency) ? ` · ${seconds(cost.latency)}` : ""}
            {cost.agents.length > 0 ? ` · ${cost.agents.join(", ")}` : ""}
          </p>
        ) : null}
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}

/** Lo que la respuesta declara sobre su propio coste: es el número del pitch y nuestro contador. */
export type Cost = {
  readonly interactions: number;
  readonly tokens: number;
  readonly latency?: number;
  readonly agents: readonly string[];
};

/** Distintivo del estado que devolvió el agente, para que un error no se lea como una respuesta. */
export function AgentStatus({ status }: { readonly status: string }) {
  if (status === "ok") return null;
  return (
    <span className={cn("border-destructive/50 text-destructive rounded-full border px-2 py-0.5 text-[10px]")}>
      {status}
    </span>
  );
}
