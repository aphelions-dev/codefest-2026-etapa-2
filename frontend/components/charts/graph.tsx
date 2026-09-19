"use client";

import { useEffect, useRef, useState } from "react";

import { Panel, PanelState } from "@/components/charts/panel";
import type { Graph as GraphData } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { useDocument } from "@/lib/use-document";

const TYPE_COLOR: Record<string, string> = {
  organization: "var(--f2)",
  international_body: "var(--primary)",
  company: "var(--f1)",
  program: "var(--f3)",
  technical_standard: "var(--muted-foreground)",
  treaty: "var(--f1)",
  place: "var(--f3)",
};

const SHOWN = 26;
const INNER_RING = 12;

type Positioned = { id: string; name: string; type: string; documents: number; x: number; y: number };

/**
 * Red de co-ocurrencia con disposición radial: la entidad más presente al centro y el resto en
 * dos anillos. Un grafo dirigido por fuerzas con 26 nodos se cruza consigo mismo; el radial deja
 * leer los vecinos, que es la tarea que el componente tiene que resolver.
 */
export function Graph({
  phenomenon,
  entity,
  onEntity,
}: {
  readonly phenomenon: number | null;
  readonly entity: string | null;
  readonly onEntity: (entityId: string | null) => void;
}) {
  const { data, error, loading } = useApi<GraphData>("/entities/cooccurrence", {
    phenomenon: phenomenon ?? undefined,
    min_documents: 4,
  });
  const { open } = useDocument();
  // El nodo enfocado es el filtro global: así seleccionar aquí también mueve el mapa,
  // la línea de tiempo y el resto de componentes, que es lo que pide el anexo.
  const focus = entity;
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 560, height: 320 });

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  let nodes: Positioned[] = [];
  let edges: GraphData["edges"] = [];
  if (data && data.nodes.length > 0) {
    const shown = data.nodes.slice(0, SHOWN);
    const ids = new Set(shown.map((node) => node.entity_id));
    edges = data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    const cx = size.width / 2;
    const cy = size.height / 2;
    const radius = Math.min(cx, cy) - 30;
    nodes = shown.map((node, index) => {
      const common = { id: node.entity_id, name: node.name, type: node.type, documents: node.documents };
      if (index === 0) return { ...common, x: cx, y: cy };
      const inner = index <= INNER_RING;
      const count = inner ? INNER_RING : Math.max(shown.length - INNER_RING - 1, 1);
      const position = inner ? index - 1 : index - INNER_RING - 1;
      const angle = (position / count) * Math.PI * 2 - Math.PI / 2;
      const ring = inner ? 0.56 : 1;
      return { ...common, x: cx + Math.cos(angle) * radius * ring, y: cy + Math.sin(angle) * radius * ring };
    });
  }

  const at = (id: string) => nodes.find((node) => node.id === id);
  const heaviest = Math.max(...edges.map((edge) => edge.documents), 1);
  const neighbours = focus
    ? new Set(
        edges
          .filter((edge) => edge.source === focus || edge.target === focus)
          .flatMap((edge) => [edge.source, edge.target]),
      )
    : null;

  return (
    <Panel
      source={
        data
          ? `${nodes.length} entidades y ${edges.length} relaciones. Tocar una entidad filtra todo el tablero y deja ver sus vecinas; tocar una arista abre el fragmento que la sustenta.`
          : undefined
      }
      title="Entidades que aparecen juntas"
      unit="Una arista une dos entidades que comparten al menos 4 documentos; el grosor son los documentos compartidos"
    >
      <div className="h-full min-h-64" ref={box}>
        {!data || nodes.length === 0 ? (
          <PanelState empty="Sin co-ocurrencias para este filtro" error={error} loading={loading} />
        ) : (
          <svg aria-label="Red de co-ocurrencia de entidades" className="h-full w-full" role="img">
            {edges.map((edge) => {
              const a = at(edge.source);
              const b = at(edge.target);
              if (!a || !b) return null;
              const dimmed = neighbours !== null && edge.source !== focus && edge.target !== focus;
              return (
                <line
                  className="cursor-pointer"
                  key={`${edge.source}-${edge.target}`}
                  onClick={() => open(edge.trace.doc_id, edge.trace.chunk_id)}
                  opacity={dimmed ? 0.05 : 0.28}
                  stroke="var(--muted-foreground)"
                  strokeWidth={0.6 + (edge.documents / heaviest) * 3}
                  x1={a.x}
                  x2={b.x}
                  y1={a.y}
                  y2={b.y}
                >
                  <title>{`${edge.documents} documentos compartidos · abrir el fragmento que sustenta la relación`}</title>
                </line>
              );
            })}
            {nodes.map((node) => {
              const dimmed = neighbours !== null && !neighbours.has(node.id);
              const r = 4 + Math.sqrt(node.documents) / 3;
              return (
                <g
                  className="cursor-pointer"
                  key={node.id}
                  onClick={() => onEntity(focus === node.id ? null : node.id)}
                  opacity={dimmed ? 0.18 : 1}
                >
                  <title>{`${node.name}: ${node.documents} documentos`}</title>
                  <circle cx={node.x} cy={node.y} fill={TYPE_COLOR[node.type] ?? "var(--primary)"} r={r} />
                  <text
                    className="pointer-events-none"
                    fill="var(--foreground)"
                    fontSize={9}
                    textAnchor="middle"
                    x={node.x}
                    y={node.y - r - 4}
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </Panel>
  );
}
