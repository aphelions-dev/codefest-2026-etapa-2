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

/** Nombre legible de cada tipo de entidad: el filtro y la leyenda no muestran el identificador. */
const TYPE_LABEL: Record<string, string> = {
  organization: "organizaciones",
  international_body: "organismos",
  company: "empresas",
  program: "programas",
  technical_standard: "estándares",
  treaty: "tratados",
  place: "lugares",
  technology: "tecnologías",
  concept: "conceptos",
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
  // Tipos ocultos y cuántos nodos se muestran: el anexo pide poder reducir el grafo a un
  // subconjunto relevante y expandirlo poco a poco, en vez de renderizarlo entero de golpe.
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const [shown, setShown] = useState(SHOWN);

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
  const available = data ? [...new Set(data.nodes.map((node) => node.type))].sort() : [];
  const visible = (data?.nodes ?? []).filter((node) => !hidden.includes(node.type));

  if (data && visible.length > 0) {
    const placed = visible.slice(0, shown);
    const ids = new Set(placed.map((node) => node.entity_id));
    edges = data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    const cx = size.width / 2;
    const cy = size.height / 2;
    const radius = Math.min(cx, cy) - 30;
    nodes = placed.map((node, index) => {
      const common = { id: node.entity_id, name: node.name, type: node.type, documents: node.documents };
      if (index === 0) return { ...common, x: cx, y: cy };
      const inner = index <= INNER_RING;
      const count = inner ? INNER_RING : Math.max(placed.length - INNER_RING - 1, 1);
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
      <div className="flex h-full min-h-64 flex-col gap-1.5">
        {/* Filtros por tipo de entidad y expansión progresiva (Anexo B.3.3). El color del chip es
            el mismo que el del nodo, así que el filtro dobla como leyenda. */}
        {available.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            {available.map((type) => {
              const off = hidden.includes(type);
              return (
                <button
                  aria-pressed={!off}
                  className="border-border/60 flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] transition-opacity"
                  key={type}
                  onClick={() =>
                    setHidden((current) =>
                      off ? current.filter((item) => item !== type) : [...current, type],
                    )
                  }
                  style={{ opacity: off ? 0.35 : 1 }}
                  title={off ? `Mostrar ${TYPE_LABEL[type] ?? type}` : `Ocultar ${TYPE_LABEL[type] ?? type}`}
                  type="button"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: TYPE_COLOR[type] ?? "var(--primary)" }}
                  />
                  {TYPE_LABEL[type] ?? type}
                </button>
              );
            })}
            {visible.length > shown ? (
              <button
                className="text-muted-foreground hover:text-foreground ml-auto rounded-md px-1.5 py-0.5 text-[10px]"
                onClick={() => setShown((current) => current + SHOWN)}
                type="button"
              >
                Expandir {Math.min(SHOWN, visible.length - shown)} más
              </button>
            ) : shown > SHOWN ? (
              <button
                className="text-muted-foreground hover:text-foreground ml-auto rounded-md px-1.5 py-0.5 text-[10px]"
                onClick={() => setShown(SHOWN)}
                type="button"
              >
                Ver menos
              </button>
            ) : null}
          </div>
        ) : null}

      <div className="min-h-0 flex-1" ref={box}>
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
      </div>
    </Panel>
  );
}
