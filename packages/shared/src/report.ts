import { z } from "zod";
import { areaRef } from "./area";
import { isoDateTime, objectId, paginationQuery } from "./common";
import { priority, slaState, ticketStatus } from "./enums";
import { statsPeriod, statsQueryFields, statsRange, statsScope, scopeRangeRules } from "./stats";
import { userSummary } from "./user";

// El constructor de reportes del spec §7.8 es, en el fondo, un catálogo: medidas
// (§7.8.4), dimensiones (§7.8.5) y tipos de gráfica (§7.8.6) que se combinan. El
// catálogo vive aquí porque lo necesitan los dos lados: el servidor para calcular y
// rechazar, y el panel de configuración para ofrecer solo lo que tiene sentido.
//
// Lo que NO vive aquí es el alcance: eso lo decide el servidor en cada consulta
// desde la sesión (spec §7.8.1, regla de seguridad). Un reporte guardado guarda lo
// que se pidió, nunca un permiso.

// ── Medidas (spec §7.8.4) ─────────────────────────────────────

export const MEASURE_KEYS = [
  // Volumen
  "created",
  "resolved",
  "closed",
  "cancelled",
  "reopened",
  "backlog",
  "unassigned",
  "transferred",
  "merged_duplicates",
  "incidents_detected",
  // Tiempos
  "first_response_time",
  "resolution_time",
  "hold_time",
  "backlog_age",
  // SLA
  "sla_response_rate",
  "sla_resolution_rate",
  "sla_breached",
  "sla_at_risk",
  // Calidad
  "csat_average",
  "csat_responses",
  "csat_response_rate",
  "reopen_rate",
  // IA
  "ai_area_accuracy",
  "ai_category_accuracy",
  "priority_corrected_rate",
  "ai_classification_failed",
  "incident_precision",
  // Carga y actividad
  "open_assigned",
  "multi_assignee_rate",
  "public_messages",
  "internal_messages",
  "attachments_per_ticket",
  "join_requests",
  // Personas
  "away_days",
  "on_behalf_rate",
] as const;
export const measureKey = z.enum(MEASURE_KEYS);
export type MeasureKey = z.infer<typeof measureKey>;

export const MEASURE_FAMILIES = ["volume", "time", "sla", "quality", "ai", "load", "people"] as const;
export const measureFamily = z.enum(MEASURE_FAMILIES);
export type MeasureFamily = z.infer<typeof measureFamily>;

export const MEASURE_FAMILY_LABEL: Record<MeasureFamily, string> = {
  volume: "Volumen",
  time: "Tiempos",
  sla: "SLA",
  quality: "Calidad",
  ai: "Inteligencia artificial",
  load: "Carga y actividad",
  people: "Personas",
};

/** Unidad de la medida. Dos medidas solo comparten gráfica si comparten unidad (spec §7.8.3). */
export const MEASURE_UNITS = ["count", "hours", "percent", "rating", "days"] as const;
export const measureUnit = z.enum(MEASURE_UNITS);
export type MeasureUnit = z.infer<typeof measureUnit>;

/** *A* = como agente (lo que atendió); *S* = como solicitante (lo que pidió). */
export const PERSPECTIVES = ["agent", "requester"] as const;
export const perspective = z.enum(PERSPECTIVES);
export type Perspective = z.infer<typeof perspective>;

export const PERSPECTIVE_LABEL: Record<Perspective, string> = {
  agent: "Como agente",
  requester: "Como solicitante",
};

export const AGGREGATIONS = ["avg", "median", "p90"] as const;
export const aggregation = z.enum(AGGREGATIONS);
export type Aggregation = z.infer<typeof aggregation>;

export const AGGREGATION_LABEL: Record<Aggregation, string> = {
  avg: "Media",
  median: "Mediana",
  p90: "Percentil 90",
};

export interface MeasureMeta {
  label: string;
  family: MeasureFamily;
  unit: MeasureUnit;
  /** Desde qué perspectivas tiene sentido; el resto se oculta al empleado. */
  perspectives: readonly Perspective[];
  /** Si la medida admite media, mediana o P90; solo los tiempos (spec §9). */
  aggregations?: readonly Aggregation[];
  /**
   * ¿Subir es mejorar? Decide el color de la insignia de variación de la tarjeta
   * KPI: más resueltos es verde, más vencidos es rojo (spec §7.8.2).
   */
  higherIsBetter: boolean;
  /** Habla del área, no de una persona: no se ofrece en el alcance personal. */
  areaOnly?: boolean;
  /** Dato de personas: solo supervisores, RRHH y admin (spec §7.8.4). */
  supervisorOnly?: boolean;
  /**
   * Dimensiones por las que esta medida puede agruparse. Sin este campo, cualquiera:
   * se declara solo cuando la medida no sale de los tickets (los días de ausencia
   * vienen de `availability_logs` y solo saben de personas).
   */
  onlyDimensions?: readonly DimensionKey[];
  /** Frase que explica la fórmula; se muestra bajo la tarjeta y en el panel. */
  hint?: string;
}

const BOTH = PERSPECTIVES;
const AGENT = ["agent"] as const;
const REQUESTER = ["requester"] as const;
const TIME_AGGREGATIONS = AGGREGATIONS;

export const MEASURE_META: Record<MeasureKey, MeasureMeta> = {
  created: {
    label: "Tickets creados",
    family: "volume",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: true,
    hint: "Tickets que entraron en el período.",
  },
  resolved: {
    label: "Tickets resueltos",
    family: "volume",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: true,
    hint: "Cuenta para cada responsable al momento de resolver (spec §9).",
  },
  closed: {
    label: "Tickets cerrados",
    family: "volume",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: true,
  },
  cancelled: {
    label: "Tickets cancelados",
    family: "volume",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: false,
  },
  reopened: {
    label: "Tickets reabiertos",
    family: "volume",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: false,
    hint: "Una reapertura dice que la solución no resolvió.",
  },
  backlog: {
    label: "Tickets pendientes",
    family: "volume",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: false,
    hint: "Sin resolver al final del período.",
  },
  unassigned: {
    label: "Tickets sin asignar",
    family: "volume",
    unit: "count",
    perspectives: AGENT,
    higherIsBetter: false,
    areaOnly: true,
  },
  transferred: {
    label: "Tickets transferidos",
    family: "volume",
    unit: "count",
    perspectives: AGENT,
    higherIsBetter: false,
    areaOnly: true,
    hint: "Cambiaron de área: suele indicar un error de clasificación.",
  },
  merged_duplicates: {
    label: "Duplicados fusionados",
    family: "volume",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: false,
    hint: "Cuántos tickets llegaron repetidos; delata incidentes masivos.",
  },
  incidents_detected: {
    label: "Incidentes detectados",
    family: "volume",
    unit: "count",
    perspectives: AGENT,
    higherIsBetter: false,
    areaOnly: true,
    hint: "Grupos de 3 o más tickets del mismo problema (IA-5).",
  },

  first_response_time: {
    label: "Tiempo de primera respuesta",
    family: "time",
    unit: "hours",
    perspectives: BOTH,
    aggregations: TIME_AGGREGATIONS,
    higherIsBetter: false,
    hint: "Horas laborales hasta el primer mensaje público del área, sin las pausas.",
  },
  resolution_time: {
    label: "Tiempo de resolución",
    family: "time",
    unit: "hours",
    perspectives: BOTH,
    aggregations: TIME_AGGREGATIONS,
    higherIsBetter: false,
    hint: "Horas laborales hasta resolver, descontando En espera.",
  },
  hold_time: {
    label: "Tiempo en espera",
    family: "time",
    unit: "hours",
    perspectives: BOTH,
    aggregations: TIME_AGGREGATIONS,
    higherIsBetter: false,
    hint: "Lo que el ticket esperó una respuesta del solicitante.",
  },
  backlog_age: {
    label: "Antigüedad del backlog",
    family: "time",
    unit: "hours",
    perspectives: AGENT,
    aggregations: TIME_AGGREGATIONS,
    higherIsBetter: false,
    areaOnly: true,
    hint: "Edad media de lo que sigue sin resolver.",
  },

  sla_response_rate: {
    label: "Cumplimiento de SLA de respuesta",
    family: "sla",
    unit: "percent",
    perspectives: BOTH,
    higherIsBetter: true,
  },
  sla_resolution_rate: {
    label: "Cumplimiento de SLA de resolución",
    family: "sla",
    unit: "percent",
    perspectives: BOTH,
    higherIsBetter: true,
  },
  sla_breached: {
    label: "Tickets con SLA vencido",
    family: "sla",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: false,
  },
  sla_at_risk: {
    label: "Tickets con SLA en riesgo",
    family: "sla",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: false,
  },

  csat_average: {
    label: "CSAT medio",
    family: "quality",
    unit: "rating",
    perspectives: BOTH,
    higherIsBetter: true,
    hint: "Promedio de las calificaciones de 1 a 5 del período.",
  },
  csat_responses: {
    label: "Encuestas respondidas",
    family: "quality",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: true,
  },
  csat_response_rate: {
    label: "Tasa de respuesta a la encuesta",
    family: "quality",
    unit: "percent",
    perspectives: AGENT,
    higherIsBetter: true,
  },
  reopen_rate: {
    label: "Tasa de reapertura",
    family: "quality",
    unit: "percent",
    perspectives: AGENT,
    higherIsBetter: false,
  },

  ai_area_accuracy: {
    label: "Precisión de la IA en el área",
    family: "ai",
    unit: "percent",
    perspectives: AGENT,
    higherIsBetter: true,
    hint: "Área sugerida = área final.",
  },
  ai_category_accuracy: {
    label: "Precisión de la IA en la categoría",
    family: "ai",
    unit: "percent",
    perspectives: AGENT,
    higherIsBetter: true,
  },
  priority_corrected_rate: {
    label: "Prioridades corregidas",
    family: "ai",
    unit: "percent",
    perspectives: AGENT,
    higherIsBetter: false,
    hint: "Prioridad final distinta de la que propuso la IA.",
  },
  ai_classification_failed: {
    label: "Clasificación pendiente o fallida",
    family: "ai",
    unit: "count",
    perspectives: AGENT,
    higherIsBetter: false,
    hint: "Salud del servicio de IA.",
  },
  incident_precision: {
    label: "Precisión de la detección de incidentes",
    family: "ai",
    unit: "percent",
    perspectives: AGENT,
    higherIsBetter: true,
    areaOnly: true,
    hint: "Incidentes confirmados frente a descartados.",
  },

  open_assigned: {
    label: "Carga: abiertos asignados",
    family: "load",
    unit: "count",
    perspectives: AGENT,
    higherIsBetter: false,
  },
  multi_assignee_rate: {
    label: "Tickets con varios responsables",
    family: "load",
    unit: "percent",
    perspectives: AGENT,
    higherIsBetter: true,
    hint: "Señal de colaboración.",
  },
  public_messages: {
    label: "Mensajes públicos por ticket",
    family: "load",
    unit: "count",
    perspectives: AGENT,
    higherIsBetter: false,
  },
  internal_messages: {
    label: "Notas internas por ticket",
    family: "load",
    unit: "count",
    perspectives: AGENT,
    higherIsBetter: false,
    hint: "Solo el número de notas; su texto nunca sale en un reporte.",
  },
  attachments_per_ticket: {
    label: "Adjuntos por ticket",
    family: "load",
    unit: "count",
    perspectives: BOTH,
    higherIsBetter: true,
  },
  join_requests: {
    label: "Solicitudes de «Unirme»",
    family: "load",
    unit: "count",
    perspectives: AGENT,
    higherIsBetter: true,
  },

  away_days: {
    label: "Días de ausencia",
    family: "people",
    unit: "days",
    perspectives: AGENT,
    higherIsBetter: false,
    supervisorOnly: true,
    onlyDimensions: ["assignee"],
    hint: "Días laborables en estado Ausente; útil para cruzar con la carga.",
  },
  on_behalf_rate: {
    label: "Creados en nombre de otros",
    family: "people",
    unit: "percent",
    perspectives: REQUESTER,
    higherIsBetter: true,
  },
};

// ── Dimensiones (spec §7.8.5) ─────────────────────────────────

export const DIMENSION_KEYS = [
  "time",
  "weekday_hour",
  "category",
  "priority",
  "status",
  "sla_state",
  "area",
  "assignee",
  "requester",
  "created_on_behalf",
  "ai_result",
  "csat",
  "availability",
] as const;
export const dimensionKey = z.enum(DIMENSION_KEYS);
export type DimensionKey = z.infer<typeof dimensionKey>;

export interface DimensionMeta {
  label: string;
  /** Agrupa por fecha: las gráficas de línea y área la exigen. */
  isTime?: boolean;
  /** Solo tiene sentido en un mapa de calor. */
  heatmapOnly?: boolean;
  /** Habla de otras personas: un empleado no la ve (spec §7.8.5). */
  supervisorOnly?: boolean;
  /** En el alcance de un área todas las filas serían la misma; se oculta. */
  hiddenInAreaScope?: boolean;
}

export const DIMENSION_META: Record<DimensionKey, DimensionMeta> = {
  time: { label: "Tiempo", isTime: true },
  weekday_hour: { label: "Día de la semana × hora", heatmapOnly: true },
  category: { label: "Categoría" },
  priority: { label: "Prioridad" },
  status: { label: "Estado" },
  sla_state: { label: "Estado de SLA" },
  area: { label: "Área", hiddenInAreaScope: true },
  assignee: { label: "Responsable", supervisorOnly: true },
  requester: { label: "Solicitante", supervisorOnly: true },
  created_on_behalf: { label: "Creado por / en nombre de" },
  ai_result: { label: "Resultado de la IA", supervisorOnly: true },
  csat: { label: "Calificación CSAT" },
  availability: { label: "Disponibilidad", supervisorOnly: true },
};

// ── Tipos de gráfica (spec §7.8.6) ────────────────────────────

export const CHART_TYPES = [
  "kpi",
  "bar",
  "hbar",
  "stacked",
  "line",
  "area",
  "donut",
  "semidonut",
  "segmented",
  "radar",
  "heatmap",
  "table",
] as const;
export const chartType = z.enum(CHART_TYPES);
export type ChartType = z.infer<typeof chartType>;

export interface ChartMeta {
  label: string;
  /** Cuántas medidas admite, de mínimo a máximo. */
  measures: readonly [number, number];
  /** Cuántas dimensiones (`groupBy` + `splitBy`). */
  dimensions: readonly [number, number];
  /** `required`: la dimensión debe ser de tiempo; `forbidden`: no puede serlo. */
  time?: "required" | "forbidden";
  /** Dimensión obligatoria y única (el mapa de calor). */
  fixedDimension?: DimensionKey;
  /** Porciones visibles antes de agrupar el resto en «Otros». */
  maxSlices?: number;
  /** Las medidas de varias unidades solo caben donde cada una lleva su columna. */
  mixedUnits?: boolean;
}

export const CHART_META: Record<ChartType, ChartMeta> = {
  kpi: { label: "Tarjeta KPI", measures: [1, 1], dimensions: [0, 0] },
  bar: { label: "Barras", measures: [1, 4], dimensions: [1, 1] },
  hbar: { label: "Barras horizontales (ranking)", measures: [1, 1], dimensions: [1, 1] },
  stacked: { label: "Barras apiladas", measures: [1, 1], dimensions: [2, 2], maxSlices: 6 },
  line: { label: "Línea", measures: [1, 4], dimensions: [1, 1], time: "required" },
  area: { label: "Área con degradado", measures: [1, 4], dimensions: [1, 1], time: "required" },
  donut: { label: "Dona", measures: [1, 1], dimensions: [1, 1], time: "forbidden", maxSlices: 6 },
  semidonut: {
    label: "Semidona (medidor)",
    measures: [1, 1],
    dimensions: [1, 1],
    time: "forbidden",
    maxSlices: 6,
  },
  segmented: {
    label: "Barra segmentada",
    measures: [1, 1],
    dimensions: [1, 1],
    time: "forbidden",
    maxSlices: 6,
  },
  radar: { label: "Radar de desempeño", measures: [3, 6], dimensions: [0, 0], mixedUnits: true },
  heatmap: { label: "Mapa de calor", measures: [1, 1], dimensions: [1, 1], fixedDimension: "weekday_hour" },
  table: { label: "Tabla", measures: [1, 4], dimensions: [0, 2], mixedUnits: true },
};

// ── Definición de una gráfica (spec §7.8.3) ───────────────────

export const widgetFilters = z
  .object({
    areaId: objectId.optional(),
    categoryIds: z.array(objectId).max(20).optional(),
    priorities: z.array(priority).optional(),
    statuses: z.array(ticketStatus).optional(),
    assigneeId: objectId.optional(),
    requesterId: objectId.optional(),
    slaState: slaState.optional(),
    createdOnBehalf: z.boolean().optional(),
  })
  .default({});
export type WidgetFilters = z.infer<typeof widgetFilters>;

export const WIDGET_SORTS = ["value_desc", "value_asc", "label", "chronological"] as const;
export const widgetSort = z.enum(WIDGET_SORTS);
export type WidgetSort = z.infer<typeof widgetSort>;

export const WIDGET_SORT_LABEL: Record<WidgetSort, string> = {
  value_desc: "De mayor a menor",
  value_asc: "De menor a mayor",
  label: "Alfabético",
  chronological: "Cronológico",
};

/** Comparación del paso 8: contra el período anterior o contra otra persona o área. */
export const widgetComparison = z.union([
  z.object({ kind: z.literal("previous_period") }),
  z.object({ kind: z.literal("area"), areaId: objectId }),
  z.object({ kind: z.literal("user"), userId: objectId }),
]);
export type WidgetComparison = z.infer<typeof widgetComparison>;

export const widgetMeasure = z.object({
  key: measureKey,
  aggregation: aggregation.optional(),
});
export type WidgetMeasure = z.infer<typeof widgetMeasure>;

export const reportWidget = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1, "Ponle un título").max(80),
  chart: chartType,
  measures: z.array(widgetMeasure).min(1, "Elige al menos una medida").max(6),
  /** Solo lo usa el alcance personal; en un área el reporte es siempre de agente. */
  perspective: perspective.optional(),
  groupBy: dimensionKey.optional(),
  splitBy: dimensionKey.optional(),
  filters: widgetFilters,
  sort: widgetSort.default("value_desc"),
  limit: z.number().int().min(3).max(50).optional(),
  compareWith: widgetComparison.optional(),
  /** Ajustes del paso 9; son de presentación y no cambian la consulta. */
  showValues: z.boolean().default(true),
  showLegend: z.boolean().default(true),
  /** Línea de referencia con la meta de SLA (100 %). */
  showTarget: z.boolean().default(false),
  layout: z
    .object({
      /** Ancho en tercios: 1 = un tercio, 2 = media, 3 = ancho completo. */
      w: z.number().int().min(1).max(3).default(1),
    })
    .default({ w: 1 }),
});
export type ReportWidget = z.infer<typeof reportWidget>;

/**
 * Comprueba que la combinación tenga sentido. El panel lo usa para deshabilitar
 * opciones antes de pedir nada (spec §7.8.3) y el servidor para rechazar con 422 lo
 * que llegue de todas formas: la interfaz puede equivocarse, el contrato no.
 *
 * Devuelve el motivo en castellano, o `null` si la gráfica es válida.
 */
export function validateWidget(widget: ReportWidget): string | null {
  const meta = CHART_META[widget.chart];
  const [minMeasures, maxMeasures] = meta.measures;
  const [minDims, maxDims] = meta.dimensions;
  const dims = [widget.groupBy, widget.splitBy].filter(Boolean) as DimensionKey[];

  if (widget.measures.length < minMeasures || widget.measures.length > maxMeasures) {
    return minMeasures === maxMeasures
      ? `«${meta.label}» necesita exactamente ${minMeasures} medida${minMeasures === 1 ? "" : "s"}`
      : `«${meta.label}» admite entre ${minMeasures} y ${maxMeasures} medidas`;
  }

  if (dims.length < minDims || dims.length > maxDims) {
    return minDims === 0 && maxDims === 0
      ? `«${meta.label}» no se agrupa por ninguna dimensión`
      : `«${meta.label}» necesita ${minDims === maxDims ? minDims : `entre ${minDims} y ${maxDims}`} dimensión(es)`;
  }

  if (widget.splitBy && widget.splitBy === widget.groupBy) {
    return "La segmentación tiene que ser una dimensión distinta de la agrupación";
  }

  if (meta.fixedDimension && widget.groupBy !== meta.fixedDimension) {
    return `«${meta.label}» se agrupa por ${DIMENSION_META[meta.fixedDimension].label.toLowerCase()}`;
  }

  if (!meta.fixedDimension && dims.some((key) => DIMENSION_META[key].heatmapOnly)) {
    return `«${DIMENSION_META.weekday_hour.label}» solo se dibuja en un mapa de calor`;
  }

  const groupIsTime = widget.groupBy ? Boolean(DIMENSION_META[widget.groupBy].isTime) : false;
  if (meta.time === "required" && !groupIsTime) {
    return `«${meta.label}» necesita agrupar por tiempo`;
  }
  if (meta.time === "forbidden" && groupIsTime) {
    return `«${meta.label}» no puede agrupar por tiempo; usa una línea o un área`;
  }

  // El radar lleva todos los ejes a una escala común donde "más lejos del centro"
  // significa siempre "mejor" (spec §7.8.6). Eso solo se puede hacer sin inventar
  // nada con porcentajes y con el CSAT: un recuento de tickets no tiene techo contra
  // el que normalizarse.
  if (widget.chart === "radar") {
    const offender = widget.measures.find((item) => {
      const unit = MEASURE_META[item.key].unit;
      return unit !== "percent" && unit !== "rating";
    });
    if (offender) {
      return `«${MEASURE_META[offender.key].label}» no se puede normalizar: el radar solo admite porcentajes y el CSAT`;
    }
  }

  if (!meta.mixedUnits && widget.measures.length > 1) {
    const units = new Set(widget.measures.map((item) => MEASURE_META[item.key].unit));
    if (units.size > 1) {
      return "Varias medidas en la misma gráfica tienen que compartir unidad";
    }
  }

  for (const item of widget.measures) {
    const meta_ = MEASURE_META[item.key];
    if (item.aggregation && !meta_.aggregations?.includes(item.aggregation)) {
      return `«${meta_.label}» no admite ${AGGREGATION_LABEL[item.aggregation].toLowerCase()}`;
    }
    const only = meta_.onlyDimensions;
    if (only && dims.some((key) => !only.includes(key))) {
      const names = only.map((key) => DIMENSION_META[key].label.toLowerCase()).join(" o ");
      return `«${meta_.label}» solo se agrupa por ${names}`;
    }
  }

  return null;
}

/** Medidas que este alcance puede ofrecer; el servidor las vuelve a filtrar. */
export function measuresForScope(scope: z.infer<typeof statsScope>): MeasureKey[] {
  const personal = scope === "me" || scope === "user";
  return MEASURE_KEYS.filter((key) => {
    const meta = MEASURE_META[key];
    if (personal && meta.areaOnly) return false;
    if (personal && scope === "me" && meta.supervisorOnly) return false;
    return true;
  });
}

export function dimensionsForScope(
  scope: z.infer<typeof statsScope>,
  isSupervisor: boolean,
): DimensionKey[] {
  return DIMENSION_KEYS.filter((key) => {
    const meta = DIMENSION_META[key];
    if (meta.supervisorOnly && !isSupervisor) return false;
    if (meta.hiddenInAreaScope && scope === "area") return false;
    return true;
  });
}

// ── Consulta de una gráfica: `POST /reports/query` ─────────────

export const reportQueryInput = statsQueryFields
  .extend({ widget: reportWidget })
  .superRefine(scopeRangeRules);
export type ReportQueryInput = z.infer<typeof reportQueryInput>;

export const reportRow = z.object({
  /** Clave cruda del grupo (identificador, fecha ISO, enumerado); ausente sin dimensión. */
  key: z.string().optional(),
  label: z.string(),
  /** Segmento de `splitBy`, cuando lo hay. */
  split: z.string().optional(),
  /** Un valor por medida, en el mismo orden que `measures`. `null` = sin datos. */
  values: z.array(z.number().nullable()),
});
export type ReportRow = z.infer<typeof reportRow>;

export const reportSeriesMeta = z.object({
  key: measureKey,
  label: z.string(),
  unit: measureUnit,
  aggregation: aggregation.optional(),
  higherIsBetter: z.boolean(),
});
export type ReportSeriesMeta = z.infer<typeof reportSeriesMeta>;

export const reportQueryResult = z.object({
  widgetId: z.string(),
  chart: chartType,
  /** Alcance concedido; puede ser más estrecho que el pedido. */
  scope: statsScope,
  areaName: z.string().optional(),
  range: statsRange,
  measures: z.array(reportSeriesMeta),
  rows: z.array(reportRow),
  /** Mismas filas del término de comparación, si se pidió (spec §7.8.3, paso 8). */
  comparison: z
    .object({
      label: z.string(),
      rows: z.array(reportRow),
      /** Totales por medida, para la insignia de variación de la tarjeta KPI. */
      totals: z.array(z.number().nullable()),
    })
    .optional(),
  /** Totales por medida de la gráfica principal. */
  totals: z.array(z.number().nullable()),
  /** Hubo más grupos que el límite y el resto se juntó en «Otros». */
  grouped: z.boolean(),
});
export type ReportQueryResult = z.infer<typeof reportQueryResult>;

// ── Lista de tickets del período (spec §7.8.9) ─────────────────

export const REPORT_COLUMNS = [
  // El mismo orden que la lista de tickets: ID, estado, título, solicitante,
  // área/categoría, responsables, creado, SLA y prioridad. Lo demás va detrás.
  "number",
  "status",
  "title",
  "requester",
  "area",
  "category",
  "assignees",
  "createdAt",
  "slaState",
  "priority",
  "createdBy",
  "firstResponse",
  "resolvedAt",
  "resolutionTime",
  "csat",
  "reopened",
  "incident",
  "mergedWith",
] as const;
export const reportColumn = z.enum(REPORT_COLUMNS);
export type ReportColumn = z.infer<typeof reportColumn>;

export const REPORT_COLUMN_LABEL: Record<ReportColumn, string> = {
  number: "ID",
  title: "Título",
  requester: "Solicitante",
  createdBy: "Creado por",
  area: "Área",
  category: "Categoría",
  priority: "Prioridad",
  status: "Estado",
  assignees: "Responsables",
  createdAt: "Creado",
  firstResponse: "1.ª respuesta",
  resolvedAt: "Resuelto",
  resolutionTime: "T. resolución",
  slaState: "SLA",
  csat: "CSAT",
  reopened: "Reabierto",
  incident: "Incidente",
  mergedWith: "Fusionado con",
};

export const DEFAULT_REPORT_COLUMNS: ReportColumn[] = [
  "number",
  "status",
  "title",
  "requester",
  "area",
  "category",
  "assignees",
  "createdAt",
  "slaState",
  "priority",
];

/**
 * Columnas por las que la lista del período sabe ordenar. Faltan a propósito las
 * que no son un campo del ticket — solicitante, área, categoría, encargados —:
 * son nombres que viven en otras colecciones, y ordenarlos obligaría a cruzar
 * tablas sobre el histórico entero, que es justo lo que esta pantalla no puede
 * permitirse. Para esas, el camino es filtrar por ellas.
 */
export const REPORT_TICKET_SORTS = [
  "createdAt",
  "number",
  "title",
  "priority",
  "status",
  "firstResponse",
  "resolvedAt",
  "resolutionTime",
  "csat",
  "reopened",
] as const;
export const reportTicketSort = z.enum(REPORT_TICKET_SORTS);
export type ReportTicketSort = z.infer<typeof reportTicketSort>;

/** `?statuses=open,closed` → `["open","closed"]`; también acepta un array. */
function csv<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : value,
    z.array(item).min(1),
  );
}

const boolFlag = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean(),
);

export const COMPARATORS = ["gt", "lt"] as const;
export const comparator = z.enum(COMPARATORS);
export type Comparator = z.infer<typeof comparator>;

/**
 * Filtros de la lista del período. Son muchos a propósito: esta tabla no sirve para
 * trabajar, sirve para responder preguntas concretas sobre el histórico (spec §7.8.9).
 */
export const reportTicketFilters = z.object({
  /** `TK-000123`, `123` o varios separados por coma. */
  numbers: z.string().trim().max(200).optional(),
  q: z.string().trim().max(120).optional(),

  assigneeIds: csv(objectId).optional(),
  unassigned: boolFlag.optional(),
  requesterId: objectId.optional(),
  createdById: objectId.optional(),
  /** Atajo «Solo los míos»: como solicitante o como responsable. */
  mine: boolFlag.optional(),

  areaIds: csv(objectId).optional(),
  categoryIds: csv(objectId).optional(),
  priorities: csv(priority).optional(),
  statuses: csv(ticketStatus).optional(),
  slaStates: csv(slaState).optional(),

  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  resolvedFrom: z.iso.date().optional(),
  resolvedTo: z.iso.date().optional(),
  closedFrom: z.iso.date().optional(),
  closedTo: z.iso.date().optional(),

  /** Horas laborales; se comparan con el motor de SLA, no con el reloj de pared. */
  responseHoursOp: comparator.optional(),
  responseHours: z.coerce.number().min(0).max(10_000).optional(),
  resolutionHoursOp: comparator.optional(),
  resolutionHours: z.coerce.number().min(0).max(10_000).optional(),
  ageDaysMin: z.coerce.number().min(0).max(3650).optional(),

  /** `1`…`5`, o `none` para los que nadie calificó. */
  csatRatings: csv(z.enum(["1", "2", "3", "4", "5", "none"])).optional(),
  reopened: boolFlag.optional(),
  responseBreached: boolFlag.optional(),
  resolutionBreached: boolFlag.optional(),

  hasAttachments: boolFlag.optional(),
  onBehalf: boolFlag.optional(),
  multiAssignee: boolFlag.optional(),
  transferred: boolFlag.optional(),
  /** `duplicate` = absorbido por otro; `principal` = absorbió duplicados. */
  merged: z.enum(["duplicate", "principal"]).optional(),
  incident: boolFlag.optional(),
  aiPending: boolFlag.optional(),
  priorityCorrected: boolFlag.optional(),
});
export type ReportTicketFilters = z.infer<typeof reportTicketFilters>;

export const reportTicketsQuery = statsQueryFields
  .extend(paginationQuery.shape)
  .extend(reportTicketFilters.shape)
  .extend({
    sort: reportTicketSort.default("createdAt"),
    dir: z.enum(["asc", "desc"]).default("desc"),
    columns: csv(reportColumn).optional(),
  })
  .superRefine(scopeRangeRules);
export type ReportTicketsQuery = z.infer<typeof reportTicketsQuery>;

export const reportTicketRow = z.object({
  id: objectId,
  number: z.number().int().positive(),
  title: z.string(),
  requester: userSummary,
  createdBy: userSummary,
  area: areaRef,
  categoryName: z.string().optional(),
  priority,
  status: ticketStatus,
  assignees: z.array(userSummary),
  createdAt: isoDateTime,
  firstResponseAt: isoDateTime.optional(),
  resolvedAt: isoDateTime.optional(),
  closedAt: isoDateTime.optional(),
  /** Horas laborales, ya descontadas las pausas; `null` cuando aún no ocurrió. */
  firstResponseHours: z.number().nullable(),
  resolutionHours: z.number().nullable(),
  ageHours: z.number().nullable(),
  responseState: slaState,
  resolutionState: slaState,
  /** Los vencimientos, para que la columna de SLA muestre el margen y su línea
      de tiempo igual que en el listado de tickets. */
  responseDueAt: isoDateTime,
  resolutionDueAt: isoDateTime,
  csat: z.number().int().min(1).max(5).optional(),
  reopened: z.boolean(),
  transferred: z.boolean(),
  onBehalf: z.boolean(),
  /** Solo para quien atiende el ticket; el solicitante no lo ve (spec §6.2). */
  incidentLabel: z.string().optional(),
  mergedIntoNumber: z.number().int().positive().optional(),
  mergedCount: z.number().int().min(0),
  /**
   * ¿Se puede abrir la conversación? Las filas de áreas ajenas que RRHH ve en
   * global muestran solo la ficha (spec §7.8.9, supuesto 3 del §18).
   */
  readable: z.boolean(),
});
export type ReportTicketRow = z.infer<typeof reportTicketRow>;

export const reportTicketsResponse = z.object({
  items: z.array(reportTicketRow),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  range: statsRange,
  scope: statsScope,
  /**
   * Fila de totales de debajo de la tabla: cuántos hay en cada estado. Es un registro
   * **parcial** porque solo viajan los estados con tickets; `z.record` con una clave de
   * enumerado los exigiría todos, incluidos los que valen cero.
   */
  byStatus: z.partialRecord(ticketStatus, z.number().int().min(0)),
  /** Se alcanzó el techo de filas y los totales son del tramo analizado. */
  truncated: z.boolean(),
});
export type ReportTicketsResponse = z.infer<typeof reportTicketsResponse>;

/** Techo de filas por consulta y por descarga (spec §7.8.9). */
export const REPORT_ROW_CAP = 10_000;

// ── Reportes guardados (spec §7.8.8, §11) ─────────────────────

export const reportDefinition = z.object({
  scope: statsScope.default("area"),
  areaId: objectId.optional(),
  userId: objectId.optional(),
  period: statsPeriod.default("month"),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  perspective: perspective.optional(),
  widgets: z.array(reportWidget).max(12),
  /** Los filtros y columnas de la lista viajan con el reporte (spec §7.8.9). */
  ticketFilters: reportTicketFilters.optional(),
  columns: z.array(reportColumn).max(20).optional(),
});
export type ReportDefinition = z.infer<typeof reportDefinition>;

export const savedReport = reportDefinition.extend({
  id: objectId,
  title: z.string(),
  description: z.string().optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  /**
   * Alcance que el rol actual permite. Si quien guardó el reporte dejó de ser
   * supervisor, el reporte se abre recortado y la interfaz lo avisa, en vez de
   * fallar con un 403 por cada gráfica (spec §7.8.1).
   */
  effectiveScope: statsScope,
  scopeNarrowed: z.boolean(),
});
export type SavedReport = z.infer<typeof savedReport>;

export const createReportInput = reportDefinition.extend({
  title: z.string().trim().min(2, "Ponle un nombre").max(80),
  description: z.string().trim().max(280).optional(),
});
export type CreateReportInput = z.infer<typeof createReportInput>;

export const updateReportInput = createReportInput.partial();
export type UpdateReportInput = z.infer<typeof updateReportInput>;

export const savedReportList = z.object({ items: z.array(savedReport) });
export type SavedReportList = z.infer<typeof savedReportList>;

// ── Catálogo: `GET /reports/catalog` (spec §7.8.1) ─────────────

export const reportTemplate = reportDefinition.extend({
  /** Identificador estable de la plantilla, no de un reporte guardado. */
  templateId: z.string(),
  title: z.string(),
  description: z.string(),
});
export type ReportTemplate = z.infer<typeof reportTemplate>;

export const reportCatalog = z.object({
  /** Opciones del selector de alcance, ya recortadas por el rol. */
  scopes: z.array(z.object({ id: statsScope, label: z.string() })),
  maxScope: statsScope,
  /** ¿Puede elegir sobre quién reporta? Decide si se pinta el selector de persona. */
  canPickPerson: z.boolean(),
  measures: z.array(
    z.object({
      key: measureKey,
      label: z.string(),
      family: measureFamily,
      unit: measureUnit,
      perspectives: z.array(perspective),
      aggregations: z.array(aggregation).optional(),
      higherIsBetter: z.boolean(),
      hint: z.string().optional(),
    }),
  ),
  dimensions: z.array(z.object({ key: dimensionKey, label: z.string() })),
  charts: z.array(z.object({ type: chartType, label: z.string() })),
  templates: z.array(reportTemplate),
  limits: z.object({
    maxSavedReports: z.number().int().positive(),
    maxWidgetsPerReport: z.number().int().positive(),
  }),
});
export type ReportCatalog = z.infer<typeof reportCatalog>;
