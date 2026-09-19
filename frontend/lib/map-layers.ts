"use client";

import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";

import type { Alerts, Places, Presence } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { MapLevel } from "@/lib/filters";
import { useApi } from "@/lib/use-api";

/**
 * Las tres cosas que el mapa sabe pintar, normalizadas a una sola forma.
 *
 * Cada vista consulta su propio endpoint y mide algo distinto —documentos que nombran el
 * territorio, alertas emitidas, municipios con presencia armada—, pero todas acaban siendo un
 * polígono, una cifra que decide el color y una traza. Esa normalización es lo que deja que el
 * lienzo del mapa no sepa nada de fenómenos, alertas ni grupos: solo pinta territorios.
 */

const VIEWS = ["documentos", "alertas", "grupos"] as const;
export type MapView = (typeof VIEWS)[number];

/** Un territorio listo para pintar, venga de la vista que venga. */
export type MapDatum = {
  readonly id: string;
  readonly name: string;
  readonly iso2: string | null;
  /** Lo que codifica el color y ordena el ranking. */
  readonly value: number;
  /** La cifra, escrita: es lo que lee quien pasa el cursor o abre la ficha. */
  readonly headline: string;
  /** El desglose que acompaña a la cifra, ya en palabras. */
  readonly detail: string;
  readonly trace: { readonly doc_id: string; readonly chunk_id: string };
  readonly geometry: unknown;
};

/** Qué mide la vista, cómo se lee su color, de dónde sale y qué no cubre. */
export type MapGuide = {
  readonly title: string;
  readonly unit: string;
  readonly measures: string;
  readonly read: string;
  readonly source: string;
  readonly limits: string;
};

export const VIEW_LABEL: Record<MapView, string> = {
  documentos: "Documentos",
  alertas: "Alertas",
  grupos: "Grupos armados",
};

/** La vista del mapa vive en la URL, como los demás filtros. */
export function useMapView() {
  const [view, setView] = useQueryState("vista", parseAsStringLiteral(VIEWS));
  return [view ?? "documentos", setView] as const;
}

/** El filtro propio de la vista: la clase de alerta o el grupo armado. */
export function useLayerFilter() {
  return useQueryState("capa", parseAsString);
}

type Layer = {
  readonly data: readonly MapDatum[];
  readonly guide: MapGuide;
  /** Los valores que puede tomar el filtro propio de la vista, con su conteo. */
  readonly options: readonly { readonly value: string; readonly label: string; readonly count: number }[];
  /** Lo que la vista declara sobre su propia cobertura, bajo el gráfico. */
  readonly coverage: string;
  readonly loading: boolean;
  readonly error: string | null;
};

const EMPTY_GUIDE: MapGuide = {
  title: "",
  unit: "",
  measures: "",
  read: "",
  source: "",
  limits: "",
};

/**
 * Los datos de la vista activa. Las tres peticiones se declaran siempre —los hooks no pueden ir
 * dentro de un `if`— pero solo la de la vista activa lleva ruta, así que las otras dos no se piden.
 */
export function useMapLayer(
  view: MapView,
  {
    phenomenon,
    level,
    entity,
    filter,
  }: {
    phenomenon: number | null;
    level: MapLevel;
    entity: string | null;
    filter: string | null;
  },
): Layer {
  const places = useApi<Places>(view === "documentos" ? "/places" : null, {
    level,
    phenomenon: phenomenon ?? undefined,
    entity: entity ?? undefined,
    limit: level === "department" ? 40 : 90,
  });
  const alerts = useApi<Alerts>(view === "alertas" ? "/alerts" : null, {
    kind: filter ?? undefined,
  });
  const presence = useApi<Presence>(view === "grupos" ? "/presence" : null, {
    group: filter ?? undefined,
  });

  if (view === "alertas") {
    const data = (alerts.data?.features ?? []).map(
      (feature): MapDatum => ({
        id: feature.properties.place_id,
        name: feature.properties.name,
        iso2: feature.properties.iso2 ?? null,
        value: feature.properties.alerts,
        headline: `${formatNumber(feature.properties.alerts)} alertas`,
        detail:
          `${feature.properties.imminent} de riesgo inminente · ` +
          `${feature.properties.structural} estructural` +
          (feature.properties.latest ? ` · la última, ${feature.properties.latest}` : ""),
        trace: feature.properties.trace,
        geometry: feature.geometry,
      }),
    );
    return {
      data,
      guide: {
        title: "Alertas tempranas",
        unit: "Alertas que nombran el departamento",
        measures:
          "Alertas emitidas por la Defensoría del Pueblo que nombran cada departamento, por clase de riesgo.",
        read: "Más intenso, más alertas. Riesgo inminente es una amenaza inmediata; estructural, una sostenida en el tiempo.",
        source: `Defensoría del Pueblo · ${alerts.data?.alerts ?? 0} alertas${
          alerts.data?.since ? ` entre ${alerts.data.since} y ${alerts.data.until}` : ""
        }`,
        limits:
          "Una alerta de alcance nacional cuenta en cada departamento que nombra: la cifra es «alertas que nombran el territorio», no «alertas sobre el territorio».",
      },
      options: alerts.data
        ? [
            { value: "Inminencia", label: "Riesgo inminente", count: alerts.data.imminent },
            { value: "Estructural", label: "Riesgo estructural", count: alerts.data.structural },
          ]
        : [],
      coverage: alerts.data
        ? `${formatNumber(alerts.data.imminent)} de riesgo inminente y ${formatNumber(alerts.data.structural)} estructural`
        : "",
      loading: alerts.loading,
      error: alerts.error,
    };
  }

  if (view === "grupos") {
    const data = (presence.data?.features ?? []).map(
      (feature): MapDatum => ({
        id: feature.properties.place_id,
        name: feature.properties.name,
        iso2: feature.properties.iso2 ?? null,
        value: feature.properties.with_presence,
        headline: `${feature.properties.with_presence} municipios con presencia`,
        detail:
          `de ${feature.properties.municipalities} en el departamento · ` +
          `${feature.properties.groups} grupos distintos` +
          (feature.properties.without_information > 0
            ? ` · ${feature.properties.without_information} sin información`
            : ""),
        trace: feature.properties.trace,
        geometry: feature.geometry,
      }),
    );
    return {
      data,
      guide: {
        title: "Grupos armados · cuenca amazónica",
        unit: "Municipios del departamento con presencia declarada",
        measures: "Municipios donde la fuente registra la presencia de al menos un grupo armado.",
        read: "Más intenso, más municipios con presencia. Es presencia declarada, no intensidad ni nivel de riesgo.",
        source: `Amazon Underworld (CC BY 4.0) · ${presence.data?.municipalities ?? 0} municipios de seis países`,
        limits:
          "Solo la cuenca amazónica, y solo Colombia tiene geometría departamental cargada. Un municipio sin información no se investigó, que no es lo mismo que sin presencia.",
      },
      options: (presence.data?.groups ?? []).map((group) => ({
        value: group.name,
        label: group.name,
        count: group.municipalities,
      })),
      coverage: presence.data
        ? `${formatNumber(presence.data.with_presence)} municipios con presencia y ${formatNumber(presence.data.without_information)} sin investigar, de ${formatNumber(presence.data.municipalities)}`
        : "",
      loading: presence.loading,
      error: presence.error,
    };
  }

  const data = (places.data?.features ?? []).map(
    (feature): MapDatum => ({
      id: feature.properties.place_id,
      name: feature.properties.name,
      iso2: feature.properties.iso2 ?? null,
      value: feature.properties.documents,
      headline: `${formatNumber(feature.properties.documents)} documentos`,
      detail: `${formatNumber(feature.properties.mentions)} menciones en el corpus`,
      trace: feature.properties.trace,
      geometry: feature.geometry,
    }),
  );
  return {
    data,
    guide: {
      title: level === "department" ? "Departamentos nombrados en el corpus" : "Países nombrados en el corpus",
      unit: "Documentos distintos que nombran el territorio",
      measures: `Cuántos documentos del corpus nombran cada ${level === "department" ? "departamento" : "país"}.`,
      read: "Más intenso, más documentos; la mitad menos citada queda sin color.",
      source: "Corpus de la Etapa 1 · fronteras de Natural Earth",
      limits:
        level === "department"
          ? "Mide cuánto se escribe sobre el territorio, no la intensidad de lo que ocurre en él."
          : "Nombrar no es actuar: un país aparece también cuando se lo analiza desde fuera.",
    },
    options: [],
    coverage: "",
    loading: places.loading,
    error: places.error,
  };
}

export const NO_GUIDE = EMPTY_GUIDE;
