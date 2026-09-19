"use client";

import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";

import type { Alerts, Places, Presence } from "@/lib/api";
import { count, formatDate, formatNumber } from "@/lib/format";
import type { MapLevel } from "@/lib/filters";
import { type Period, periodParams } from "@/lib/period";
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
  /** Dónde está, cuando el nombre solo no basta: un municipio se repite entre departamentos. */
  readonly region?: string;
  readonly iso2: string | null;
  /** Lo que codifica el color y ordena el ranking. */
  readonly value: number;
  /** La cifra, escrita y con su sustantivo: es lo que lee quien pasa el cursor o abre la ficha. */
  readonly headline: string;
  /** Datos que acompañan a la cifra, cada uno con su rótulo: se leen en rejilla, no en una frase. */
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  /** Partes de la cifra que no se suman entre sí sino que la componen: se dibujan como barra. */
  readonly split?: readonly { readonly label: string; readonly value: number; readonly color: string }[];
  /** Nombres que la cifra cuenta, como los grupos de un municipio. */
  readonly tags?: readonly string[];
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
  /** Qué es el fragmento al que lleva la ficha: uno de muestra, no toda la evidencia. */
  readonly sample: string;
  /** Dónde está el resto de la evidencia, si está en algún sitio. */
  readonly more: string | null;
};

/**
 * A qué fenómeno pertenece cada vista. Las alertas de la Defensoría y la presencia armada son
 * documentos del fenómeno 3 y de ningún otro, así que verlas con el filtro puesto en F1 mostraría
 * cifras de F3 bajo una etiqueta que dice F1. En vez de dejar ese estado y explicarlo después, la
 * vista fija su fenómeno al activarse y el filtro global la devuelve a documentos si cambia.
 */
export const VIEW_PHENOMENON: Record<MapView, number | null> = {
  documentos: null,
  alertas: 3,
  grupos: 3,
};

/** Cómo se llama lo que cada vista lista: no son departamentos en todas. */
export const VIEW_PLACES: Record<MapView, string> = {
  documentos: "Territorios",
  alertas: "Departamentos",
  grupos: "Municipios",
};

export const VIEW_LABEL: Record<MapView, string> = {
  documentos: "Documentos",
  alertas: "Alertas",
  grupos: "Grupos armados",
};

/** Qué mide cada capa y dónde: el selector lo dice para que nadie tenga que adivinarlo. */
export const VIEW_SCOPE: Record<MapView, string> = {
  documentos: "Territorios que nombra el corpus",
  alertas: "Defensoría del Pueblo · Colombia",
  grupos: "Amazon Underworld · cuenca amazónica",
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

/** Un valor del filtro propio de la capa, con cuántos registra y un registro que lo muestra. */
export type LayerOption = {
  readonly value: string;
  readonly label: string;
  readonly count: number;
  readonly trace?: { readonly doc_id: string; readonly chunk_id: string };
};

type Layer = {
  readonly data: readonly MapDatum[];
  readonly guide: MapGuide;
  /** Los valores que puede tomar el filtro propio de la vista, con su conteo. */
  readonly options: readonly LayerOption[];
  /** Lo que la vista declara sobre su propia cobertura, bajo el gráfico. */
  readonly coverage: string;
  /** Si el filtro global por entidad recorta esta vista: no todas salen del corpus. */
  readonly entityApplies: boolean;
  /** Si el periodo la recorta: la presencia armada no trae fecha. */
  readonly periodApplies: boolean;
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
  sample: "",
  more: null,
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
    period,
  }: {
    phenomenon: number | null;
    level: MapLevel;
    entity: string | null;
    filter: string | null;
    period: Period;
  },
): Layer {
  const dated = periodParams(period);
  const places = useApi<Places>(view === "documentos" ? "/places" : null, {
    level,
    phenomenon: phenomenon ?? undefined,
    entity: entity ?? undefined,
    limit: level === "department" ? 40 : 90,
    ...dated,
  });
  const alerts = useApi<Alerts>(view === "alertas" ? "/alerts" : null, {
    kind: filter ?? undefined,
    entity: entity ?? undefined,
    ...dated,
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
        headline: count(feature.properties.alerts, "alerta", "alertas"),
        // Mismo rojo y mismo ámbar que la franja temporal y el conmutador de la barra.
        split: [
          { label: "Riesgo inminente", value: feature.properties.imminent, color: "#f87171" },
          { label: "Riesgo estructural", value: feature.properties.structural, color: "var(--f3)" },
        ],
        facts: feature.properties.latest
          ? [{ label: "La más reciente", value: formatDate(feature.properties.latest) }]
          : [],
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
        sample: "La alerta más reciente",
        more: "Todas sus alertas, en la barra lateral",
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
      // El filtro por entidad recorta las alertas, porque una alerta es un documento del corpus.
      entityApplies: true,
      periodApplies: true,
      loading: alerts.loading,
      error: alerts.error,
    };
  }

  if (view === "grupos") {
    // El mapa pinta **municipios**: es donde Amazon Underworld mide, y agregarlos al departamento
    // perdería justo lo que la fuente aporta, que dentro de un departamento unos registran cuatro
    // grupos y otros ninguno.
    const data = [...(presence.data?.features ?? [])]
      .sort((a, b) => b.properties.groups.length - a.properties.groups.length)
      .map(
        (feature): MapDatum => ({
          id: feature.properties.pcode,
          name: feature.properties.admin2,
          region: `${feature.properties.admin1}, ${feature.properties.country}`,
          iso2: null,
          value: feature.properties.groups.length,
          headline: count(feature.properties.groups.length, "grupo armado", "grupos armados"),
          facts: feature.properties.population
            ? [{ label: "Habitantes", value: formatNumber(feature.properties.population) }]
            : [],
          // «Otros» son los grupos que la fuente no nombra aparte, igual que en la barra lateral.
          tags: feature.properties.groups.map((group) => (group === "Otros" ? "Otros grupos" : group)),
          trace: feature.properties.trace,
          geometry: feature.geometry,
        }),
      );
    return {
      data,
      guide: {
        title: "Grupos armados · cuenca amazónica",
        unit: "Grupos armados presentes en el municipio",
        measures: "Grupos que la fuente registra en cada municipio de la cuenca amazónica.",
        read: "Más intenso, más grupos distintos. Es presencia declarada, no intensidad ni nivel de riesgo.",
        source: `Amazon Underworld (CC BY 4.0) · geometría de geoBoundaries (CC BY 4.0) · ${formatNumber(
          presence.data?.municipalities ?? 0,
        )} municipios de Bolivia, Brasil, Colombia, Ecuador, Perú y Venezuela`,
        limits:
          "Solo la cuenca amazónica. Un municipio sin información no se investigó, que no es lo mismo que sin presencia, y por eso no aparece en el mapa.",
        sample: "El registro de la fuente",
        more: null,
      },
      // «Otros» no es un grupo sino los que la fuente no nombra aparte: se dice y va al final.
      options: [...(presence.data?.groups ?? [])]
        .sort((a, b) => Number(a.name === "Otros") - Number(b.name === "Otros"))
        .map((group) => ({
          value: group.name,
          label: group.name === "Otros" ? "Otros grupos" : group.name,
          count: group.municipalities,
          trace: group.trace,
        })),
      coverage: presence.data
        ? `${formatNumber(presence.data.with_presence)} municipios con presencia y ${formatNumber(presence.data.without_information)} sin investigar, de ${formatNumber(presence.data.municipalities)}`
        : "",
      // La presencia no sale del corpus sino de Amazon Underworld, así que filtrar por una entidad
      // del corpus no la recorta, y tampoco el periodo: la fuente no fecha la presencia. Se declara
      // en vez de ignorarlo en silencio.
      entityApplies: false,
      periodApplies: false,
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
      headline: count(feature.properties.documents, "documento", "documentos"),
      facts: [{ label: "Menciones", value: formatNumber(feature.properties.mentions) }],
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
      read: "Más intenso, más documentos. Sin color, ningún documento lo nombra con este filtro.",
      source: "Corpus de la Etapa 1 · fronteras de Natural Earth",
      limits:
        level === "department"
          ? "Mide cuánto se escribe sobre el territorio, no la intensidad de lo que ocurre en él."
          : "Nombrar no es actuar: un país aparece también cuando se lo analiza desde fuera.",
      sample: "El fragmento que más lo menciona",
      more: "Todos los fragmentos, en la barra lateral",
    },
    options: [],
    coverage: "",
    entityApplies: true,
    periodApplies: true,
    loading: places.loading,
    error: places.error,
  };
}

export const NO_GUIDE = EMPTY_GUIDE;
