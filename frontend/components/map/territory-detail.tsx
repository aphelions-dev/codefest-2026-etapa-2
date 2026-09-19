"use client";

import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DocumentLink } from "@/components/document-view";
import { Flag } from "@/components/flag";
import { chunkLabel, Highlight } from "@/components/highlight";
import { IconButton } from "@/components/icon-button";
import { SectionHeader, ShowMore } from "@/components/map/panel";
import type { Territory } from "@/lib/api";
import { PHENOMENON_STYLE, useEntity } from "@/lib/filters";
import { formatDate, formatNumber } from "@/lib/format";
import { periodParams, usePeriod } from "@/lib/period";
import { useApi } from "@/lib/use-api";
import { cn } from "@/lib/utils";

/*
 * El detalle de un territorio: donde el tablero deja de mostrar cifras y muestra evidencia.
 *
 * Las tres secciones vienen de fuentes distintas y pueden no coincidir — un municipio puede
 * registrar presencia armada sin que ningún documento del corpus lo nombre —, así que cada una
 * declara de dónde sale en vez de dejar que el lector suponga que todo mide lo mismo.
 *
 * Las cifras agregadas no se repiten aquí: ya están en la ficha del mapa.
 */

const VISIBLE = 3;

export function TerritoryDetail({
  placeId,
  phenomenon,
  group,
  kind,
  onBack,
}: {
  readonly placeId: string;
  readonly phenomenon: number | null;
  readonly group: string | null;
  readonly kind: string | null;
  readonly onBack: () => void;
}) {
  const [period] = usePeriod();
  // La entidad elegida en otra vista recorta también la evidencia: la del mismo recorte que la cifra.
  const [entity] = useEntity();
  const { data, error, loading } = useApi<Territory>(`/territories/${placeId}`, {
    phenomenon: phenomenon ?? undefined,
    entity: entity ?? undefined,
    ...periodParams(period),
    group: group ?? undefined,
    kind: kind ?? undefined,
  });
  const heading = useRef<HTMLHeadingElement>(null);

  // Al abrirse, el foco pasa al título: quien usa lector de pantalla oye qué territorio se abrió.
  useEffect(() => heading.current?.focus(), [placeId]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <IconButton label="Volver a la lista" onClick={onBack} side="right" size="icon-xs">
          <ArrowLeftIcon />
        </IconButton>
        <Flag code={data?.iso2} />
        <h2 className="min-w-0 truncate text-sm font-semibold outline-none" ref={heading} tabIndex={-1}>
          {data?.name ?? placeId}
        </h2>
        <span className="text-muted-foreground shrink-0 font-mono text-[10px]">{placeId}</span>
      </div>

      {loading && !data ? <p className="text-muted-foreground text-xs">Cargando el territorio…</p> : null}
      {error ? <p className="text-muted-foreground text-xs">No se pudo cargar: {error}</p> : null}

      {data ? (
        <>
          <section className="space-y-2">
            <SectionHeader
              aside={`${formatNumber(data.total_documents)} docs · ${formatNumber(data.total_fragments)} fragm.`}
              info="Fragmentos de cualquier fuente del corpus que nombran el territorio, del que más lo menciona al que menos. Tocar el identificador abre el documento por ese fragmento."
              title="Qué dice el corpus"
            />
            {data.fragments.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-2 text-xs">
                Ningún documento del corpus nombra este territorio con el filtro puesto.
              </p>
            ) : (
              <FragmentList
                entity={entity ? [entity.replaceAll("-", " ")] : []}
                forms={data.forms?.length ? data.forms : [data.name]}
                fragments={data.fragments}
              />
            )}
          </section>

          {data.municipalities.length > 0 ? (
            <section className="space-y-2">
              <SectionHeader
                aside={`${data.municipalities.length}`}
                info="La presencia viene de Amazon Underworld (CC BY 4.0), no del corpus: por eso un municipio puede registrar grupos aunque ningún documento lo nombre. Un municipio sin información no se investigó, que no es lo mismo que sin presencia."
                title="Grupos armados por municipio"
              />
              <MunicipalityList municipalities={data.municipalities} />
            </section>
          ) : null}

          {data.alerts.length > 0 ? (
            <section className="space-y-2">
              <SectionHeader
                aside={`${data.alerts.length}`}
                info="Alertas Tempranas de la Defensoría del Pueblo que nombran el departamento, de la más reciente a la más antigua. Una alerta de alcance nacional aparece en cada departamento que nombra."
                title="Alertas tempranas"
              />
              <AlertList alerts={data.alerts} forms={data.forms?.length ? data.forms : [data.name]} />
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function FragmentList({
  fragments,
  forms,
  entity,
}: {
  readonly fragments: Territory["fragments"];
  /** Las formas con que el corpus nombra el territorio: se marcan tal cual se contaron. */
  readonly forms: readonly string[];
  /** La entidad filtrada, si la hay, que también se marca. */
  readonly entity: readonly string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? fragments : fragments.slice(0, VISIBLE);

  return (
    <div className="space-y-1">
      <ul className="space-y-2">
        {shown.map((fragment) => (
          <li className="bg-card/60 space-y-1.5 rounded-lg border p-2.5" key={fragment.chunk_id}>
            {/* Quién lo dice primero; el identificador, al pie, como la referencia que es. */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className={cn("rounded border px-1 font-mono text-[10px]", PHENOMENON_STYLE[fragment.phenomenon])}>
                F{fragment.phenomenon}
              </span>
              <span className="min-w-0 truncate font-medium">
                {fragment.observatory?.replaceAll("_", " ") ?? "Sin observatorio"}
              </span>
              <span className="text-muted-foreground ml-auto shrink-0 text-[10px] uppercase">{fragment.language}</span>
            </div>
            {/* Los fragmentos traen URLs y códigos sin espacios: se cortan para no salirse. */}
            <p className="text-muted-foreground text-xs leading-relaxed break-words">
              <Highlight exact={forms} loose={entity} text={fragment.excerpt} />
              {fragment.truncated ? "…" : ""}
            </p>
            <DocumentLink chunkId={fragment.chunk_id} className="text-muted-foreground block text-[10px]" docId={fragment.doc_id}>
              {fragment.doc_id} · {chunkLabel(fragment.chunk_id)} · {fragment.mentions}{" "}
              {fragment.mentions === 1 ? "mención" : "menciones"}
            </DocumentLink>
          </li>
        ))}
      </ul>
      {fragments.length > VISIBLE ? (
        <ShowMore
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
          total={fragments.length}
        />
      ) : null}
    </div>
  );
}

function MunicipalityList({
  municipalities,
}: {
  readonly municipalities: Territory["municipalities"];
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? municipalities : municipalities.slice(0, VISIBLE * 2);

  return (
    <div className="space-y-1">
      <ul className="space-y-1.5">
        {shown.map((town) => (
          <li className="bg-card/60 space-y-1 rounded-lg border p-2" key={town.pcode}>
            <div className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium">{town.admin2}</span>
              {town.population ? (
                <span className="text-muted-foreground font-mono text-[10px]">
                  {formatNumber(town.population)} hab.
                </span>
              ) : null}
              <DocumentLink chunkId={town.trace.chunk_id} className="text-[10px]" docId={town.trace.doc_id}>
                fuente
              </DocumentLink>
            </div>
            {town.no_info ? (
              <p className="text-muted-foreground text-[11px]">
                Sin información: la fuente no investigó este municipio.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1 text-[11px]">
                {town.groups.map((name) => (
                  <li className="border-f3/40 bg-f3/10 rounded-md border px-1.5 py-0.5" key={name}>
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {municipalities.length > VISIBLE * 2 ? (
        <ShowMore
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
          total={municipalities.length}
        />
      ) : null}
    </div>
  );
}

// El riesgo inminente se distingue del estructural también por color: son dos cosas distintas.
const ALERT_KIND: Record<string, { readonly dot: string; readonly text: string; readonly label: string }> = {
  Inminencia: { dot: "bg-red-400", text: "text-red-300", label: "Riesgo inminente" },
  Estructural: { dot: "bg-f3", text: "text-f3", label: "Riesgo estructural" },
};

function AlertList({ alerts, forms }: { readonly alerts: Territory["alerts"]; readonly forms: readonly string[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? alerts : alerts.slice(0, VISIBLE);

  return (
    <div className="space-y-1">
      <ul className="space-y-2">
        {shown.map((alert) => {
          const kind = ALERT_KIND[alert.kind] ?? {
            dot: "bg-muted-foreground",
            text: "text-muted-foreground",
            label: alert.kind,
          };
          return (
            <li className="bg-card/60 space-y-1.5 rounded-lg border p-2.5" key={alert.doc_id}>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={cn("size-1.5 rounded-full", kind.dot)} />
                <span className={kind.text}>{kind.label}</span>
                {alert.issued_on ? (
                  <time className="text-muted-foreground ml-auto" dateTime={alert.issued_on}>
                    {formatDate(alert.issued_on)}
                  </time>
                ) : null}
              </div>
              <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed break-words">
                <Highlight exact={forms} text={alert.excerpt} />
              </p>
              <DocumentLink
                chunkId={alert.trace.chunk_id}
                className="block text-[10px]"
                docId={alert.doc_id}
              >
                Alerta {alert.code} · {alert.doc_id} · {chunkLabel(alert.trace.chunk_id)}
              </DocumentLink>
            </li>
          );
        })}
      </ul>
      {alerts.length > VISIBLE ? (
        <ShowMore expanded={expanded} onToggle={() => setExpanded((open) => !open)} total={alerts.length} />
      ) : null}
    </div>
  );
}
