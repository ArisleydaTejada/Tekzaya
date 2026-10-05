import {
  CHART_META,
  CHART_TYPES,
  DIMENSION_META,
  dimensionsForScope,
  maxReportScope,
  MEASURE_META,
  measuresForScope,
  type Actor,
  type ReportCatalog,
  type ReportTemplate,
  type ReportWidget,
  type StatsScope,
} from "@tekzaya/shared";
import { getSettings } from "../settings/settings.service";
import { canReportOnOthers, scopeOptionsFor } from "./reports.scope";

/**
 * Catálogo de lo que este usuario puede construir (spec §7.8.1). Es la lista que el
 * panel de configuración ofrece, y se recorta por rol: ocultar una opción no es la
 * seguridad —esa la pone `POST /reports/query` revalidando el alcance— pero sí es lo
 * que evita ofrecer botones que solo devolverían 403.
 */
export async function catalogFor(actor: Actor): Promise<ReportCatalog> {
  const settings = await getSettings();
  const allowed = maxReportScope(actor);
  const scope: StatsScope = allowed.type === "global" ? "global" : allowed.type === "area" ? "area" : "me";
  const supervisor = canReportOnOthers(actor);

  return {
    scopes: scopeOptionsFor(actor),
    maxScope: scope,
    canPickPerson: supervisor,
    measures: measuresForScope(scope).map((key) => {
      const meta = MEASURE_META[key];
      return {
        key,
        label: meta.label,
        family: meta.family,
        unit: meta.unit,
        perspectives: [...meta.perspectives],
        ...(meta.aggregations ? { aggregations: [...meta.aggregations] } : {}),
        higherIsBetter: meta.higherIsBetter,
        ...(meta.hint ? { hint: meta.hint } : {}),
      };
    }),
    dimensions: dimensionsForScope(scope, supervisor).map((key) => ({
      key,
      label: DIMENSION_META[key].label,
    })),
    charts: CHART_TYPES.map((type) => ({ type, label: CHART_META[type].label })),
    templates: templatesFor(scope),
    limits: settings.reportLimits,
  };
}

// ── Plantillas prediseñadas (spec §7.8.7) ─────────────────────

let widgetSeq = 0;

/** Una gráfica de plantilla, con los ajustes de presentación por defecto. */
function widget(partial: {
  title: string;
  chart: ReportWidget["chart"];
  measures: ReportWidget["measures"];
  groupBy?: ReportWidget["groupBy"];
  splitBy?: ReportWidget["splitBy"];
  sort?: ReportWidget["sort"];
  limit?: number;
  compareWith?: ReportWidget["compareWith"];
  showTarget?: boolean;
  w?: 1 | 2 | 3;
}): ReportWidget {
  widgetSeq += 1;
  return {
    id: `w${widgetSeq}`,
    title: partial.title,
    chart: partial.chart,
    measures: partial.measures,
    ...(partial.groupBy ? { groupBy: partial.groupBy } : {}),
    ...(partial.splitBy ? { splitBy: partial.splitBy } : {}),
    filters: {},
    sort: partial.sort ?? "value_desc",
    ...(partial.limit ? { limit: partial.limit } : {}),
    ...(partial.compareWith ? { compareWith: partial.compareWith } : {}),
    showValues: true,
    showLegend: true,
    showTarget: partial.showTarget ?? false,
    layout: { w: partial.w ?? 1 },
  };
}

const m = (key: ReportWidget["measures"][number]["key"], aggregation?: "avg" | "median" | "p90") =>
  aggregation ? { key, aggregation } : { key };

/**
 * Las plantillas son reportes editables, no vistas cerradas: se abren, se cambian y
 * se guardan como propias (spec §7.8.7). La que un rol no puede pedir no se le
 * ofrece, porque sus gráficas devolverían 403 una a una.
 */
function templatesFor(scope: StatsScope): ReportTemplate[] {
  widgetSeq = 0;
  const personal: ReportTemplate[] = [
    {
      templateId: "my-agent-activity",
      title: "Mi actividad como agente",
      description: "Lo que atendí: resueltos en el tiempo, tiempos de respuesta y satisfacción.",
      scope: "me",
      period: "month",
      perspective: "agent",
      widgets: [
        widget({ title: "Resueltos", chart: "kpi", measures: [m("resolved")], compareWith: { kind: "previous_period" } }),
        widget({ title: "CSAT medio", chart: "kpi", measures: [m("csat_average")], compareWith: { kind: "previous_period" } }),
        widget({
          title: "Cumplimiento de SLA",
          chart: "kpi",
          measures: [m("sla_resolution_rate")],
          compareWith: { kind: "previous_period" },
        }),
        widget({
          title: "Resueltos en el tiempo",
          chart: "area",
          measures: [m("created"), m("resolved")],
          groupBy: "time",
          sort: "chronological",
          w: 3,
        }),
        widget({
          title: "Tiempo de respuesta y resolución",
          chart: "bar",
          measures: [m("first_response_time", "median"), m("resolution_time", "median")],
          groupBy: "priority",
          w: 2,
        }),
        widget({ title: "Por categoría", chart: "donut", measures: [m("resolved")], groupBy: "category" }),
      ],
    },
    {
      templateId: "my-requests",
      title: "Mis solicitudes",
      description: "Lo que pedí: en qué estado está, a qué áreas y cuánto tardaron en resolverlo.",
      scope: "me",
      period: "month",
      perspective: "requester",
      widgets: [
        widget({ title: "Tickets creados", chart: "kpi", measures: [m("created")], compareWith: { kind: "previous_period" } }),
        widget({ title: "Pendientes", chart: "kpi", measures: [m("backlog")] }),
        widget({
          title: "Tiempo hasta que me resolvieron",
          chart: "kpi",
          measures: [m("resolution_time", "median")],
          compareWith: { kind: "previous_period" },
        }),
        widget({ title: "Por estado", chart: "donut", measures: [m("created")], groupBy: "status", w: 2 }),
        widget({ title: "Por área destino", chart: "hbar", measures: [m("created")], groupBy: "area" }),
      ],
    },
    {
      templateId: "my-performance",
      title: "Mi desempeño",
      description: "Radar contra mi período anterior: SLA, satisfacción, reaperturas.",
      scope: "me",
      period: "month",
      perspective: "agent",
      widgets: [
        widget({
          title: "Perfil de desempeño",
          chart: "radar",
          measures: [
            m("sla_response_rate"),
            m("sla_resolution_rate"),
            m("csat_average"),
            m("reopen_rate"),
          ],
          compareWith: { kind: "previous_period" },
          w: 2,
        }),
        widget({
          title: "Satisfacción recibida",
          chart: "segmented",
          measures: [m("csat_responses")],
          groupBy: "csat",
        }),
      ],
    },
  ];

  if (scope === "me") return personal;

  const areaTemplates: ReportTemplate[] = [
    {
      templateId: "team-performance",
      title: "Rendimiento del equipo",
      description: "Resueltos y tiempos por persona; es la plantilla a la que enlaza el tablero.",
      scope: "area",
      period: "month",
      widgets: [
        widget({ title: "Resueltos", chart: "kpi", measures: [m("resolved")], compareWith: { kind: "previous_period" } }),
        widget({ title: "1.ª respuesta (mediana)", chart: "kpi", measures: [m("first_response_time", "median")], compareWith: { kind: "previous_period" } }),
        widget({ title: "Cumplimiento de SLA", chart: "kpi", measures: [m("sla_resolution_rate")], showTarget: true }),
        widget({ title: "CSAT medio", chart: "kpi", measures: [m("csat_average")] }),
        widget({
          title: "Recibidos frente a resueltos",
          chart: "area",
          measures: [m("created"), m("resolved")],
          groupBy: "time",
          sort: "chronological",
          w: 2,
        }),
        widget({ title: "Resueltos por persona", chart: "hbar", measures: [m("resolved")], groupBy: "assignee" }),
        widget({
          title: "Tiempo de respuesta por persona",
          chart: "hbar",
          measures: [m("first_response_time", "median")],
          groupBy: "assignee",
          sort: "value_asc",
        }),
        widget({ title: "Solicitudes por categoría", chart: "donut", measures: [m("created")], groupBy: "category" }),
      ],
    },
    {
      templateId: "sla-compliance",
      title: "Cumplimiento de SLA",
      description: "Dónde se incumple el plazo y con qué prioridades.",
      scope: "area",
      period: "month",
      widgets: [
        widget({ title: "SLA de respuesta", chart: "kpi", measures: [m("sla_response_rate")], showTarget: true }),
        widget({ title: "SLA de resolución", chart: "kpi", measures: [m("sla_resolution_rate")], showTarget: true }),
        widget({ title: "Vencidos ahora", chart: "kpi", measures: [m("sla_breached")] }),
        widget({ title: "En riesgo ahora", chart: "kpi", measures: [m("sla_at_risk")] }),
        widget({
          title: "Cumplimiento por prioridad",
          chart: "bar",
          measures: [m("sla_resolution_rate")],
          groupBy: "priority",
          showTarget: true,
          w: 2,
        }),
        widget({ title: "Estado de SLA por categoría", chart: "stacked", measures: [m("created")], groupBy: "category", splitBy: "sla_state", w: 2 }),
        widget({
          title: "Percentil 90 de resolución",
          chart: "hbar",
          measures: [m("resolution_time", "p90")],
          groupBy: "category",
        }),
      ],
    },
    {
      templateId: "load-backlog",
      title: "Carga y backlog",
      description: "Qué tiene encima cada persona y cuánto lleva esperando lo que no se cierra.",
      scope: "area",
      period: "month",
      widgets: [
        widget({ title: "Pendientes", chart: "kpi", measures: [m("backlog")] }),
        widget({ title: "Sin asignar", chart: "kpi", measures: [m("unassigned")] }),
        widget({ title: "Antigüedad del backlog", chart: "kpi", measures: [m("backlog_age", "avg")] }),
        widget({ title: "Tiempo en espera", chart: "kpi", measures: [m("hold_time", "median")] }),
        widget({ title: "Abiertos por responsable", chart: "hbar", measures: [m("open_assigned")], groupBy: "assignee", w: 2 }),
        widget({ title: "Backlog por prioridad", chart: "donut", measures: [m("backlog")], groupBy: "priority" }),
        widget({ title: "Carga frente a disponibilidad", chart: "bar", measures: [m("open_assigned")], groupBy: "availability" }),
      ],
    },
    {
      templateId: "quality",
      title: "Calidad y satisfacción",
      description: "CSAT, tasa de respuesta a la encuesta y reaperturas.",
      scope: "area",
      period: "month",
      widgets: [
        widget({ title: "CSAT medio", chart: "kpi", measures: [m("csat_average")], compareWith: { kind: "previous_period" } }),
        widget({ title: "Tasa de respuesta", chart: "kpi", measures: [m("csat_response_rate")] }),
        widget({ title: "Tasa de reapertura", chart: "kpi", measures: [m("reopen_rate")], compareWith: { kind: "previous_period" } }),
        widget({ title: "Reabiertos", chart: "kpi", measures: [m("reopened")] }),
        widget({ title: "Distribución de calificaciones", chart: "bar", measures: [m("csat_responses")], groupBy: "csat", sort: "label", w: 2 }),
        widget({ title: "CSAT por persona", chart: "hbar", measures: [m("csat_average")], groupBy: "assignee" }),
        widget({ title: "Reaperturas por categoría", chart: "hbar", measures: [m("reopened")], groupBy: "category" }),
      ],
    },
    {
      templateId: "demand",
      title: "Demanda",
      description: "Cuándo y de qué llega el trabajo: categorías y momentos de mayor carga.",
      scope: "area",
      period: "month",
      widgets: [
        widget({ title: "Tickets creados", chart: "kpi", measures: [m("created")], compareWith: { kind: "previous_period" } }),
        widget({ title: "Duplicados fusionados", chart: "kpi", measures: [m("merged_duplicates")] }),
        widget({ title: "Incidentes detectados", chart: "kpi", measures: [m("incidents_detected")] }),
        widget({ title: "Transferidos", chart: "kpi", measures: [m("transferred")] }),
        widget({ title: "Día de la semana × hora", chart: "heatmap", measures: [m("created")], groupBy: "weekday_hour", sort: "chronological", w: 3 }),
        widget({ title: "Categorías", chart: "hbar", measures: [m("created")], groupBy: "category", w: 2 }),
        widget({ title: "Prioridades", chart: "donut", measures: [m("created")], groupBy: "priority" }),
      ],
    },
    {
      templateId: "ai-accuracy",
      title: "Precisión de la IA",
      description: "Si la clasificación acierta y cuántas prioridades hay que corregir.",
      scope: "area",
      period: "month",
      widgets: [
        widget({ title: "Acierto de área", chart: "kpi", measures: [m("ai_area_accuracy")] }),
        widget({ title: "Acierto de categoría", chart: "kpi", measures: [m("ai_category_accuracy")] }),
        widget({ title: "Prioridades corregidas", chart: "kpi", measures: [m("priority_corrected_rate")] }),
        widget({ title: "Clasificación pendiente o fallida", chart: "kpi", measures: [m("ai_classification_failed")] }),
        widget({ title: "Resultado de la IA", chart: "donut", measures: [m("created")], groupBy: "ai_result", w: 2 }),
        widget({ title: "Acierto por categoría", chart: "hbar", measures: [m("ai_category_accuracy")], groupBy: "category" }),
      ],
    },
  ];

  if (scope === "area") return [...areaTemplates, ...personal];

  const globalTemplates: ReportTemplate[] = [
    {
      templateId: "areas-comparison",
      title: "Comparativa entre áreas",
      description: "Volumen, cumplimiento y satisfacción de cada área, una al lado de la otra.",
      scope: "global",
      period: "month",
      widgets: [
        widget({ title: "Tickets creados", chart: "kpi", measures: [m("created")], compareWith: { kind: "previous_period" } }),
        widget({ title: "Resueltos", chart: "kpi", measures: [m("resolved")], compareWith: { kind: "previous_period" } }),
        widget({ title: "Cumplimiento de SLA", chart: "kpi", measures: [m("sla_resolution_rate")], showTarget: true }),
        widget({ title: "CSAT medio", chart: "kpi", measures: [m("csat_average")] }),
        widget({ title: "Volumen por área", chart: "bar", measures: [m("created"), m("resolved")], groupBy: "area", w: 2 }),
        widget({ title: "SLA por área", chart: "hbar", measures: [m("sla_resolution_rate")], groupBy: "area", showTarget: true }),
        widget({ title: "CSAT por área", chart: "hbar", measures: [m("csat_average")], groupBy: "area" }),
        widget({ title: "Backlog por área", chart: "hbar", measures: [m("backlog")], groupBy: "area" }),
      ],
    },
    {
      templateId: "people-performance",
      title: "Desempeño por persona",
      description: "Resueltos, tiempos y satisfacción de cada persona, en todas las áreas.",
      scope: "global",
      period: "month",
      widgets: [
        widget({ title: "Resueltos por persona", chart: "hbar", measures: [m("resolved")], groupBy: "assignee", limit: 20, w: 2 }),
        widget({ title: "1.ª respuesta por persona", chart: "hbar", measures: [m("first_response_time", "median")], groupBy: "assignee", sort: "value_asc" }),
        widget({ title: "CSAT por persona", chart: "hbar", measures: [m("csat_average")], groupBy: "assignee" }),
        widget({ title: "Detalle", chart: "table", measures: [m("resolved"), m("first_response_time", "median"), m("sla_resolution_rate"), m("csat_average")], groupBy: "assignee", w: 3 }),
      ],
    },
    {
      templateId: "absence-vs-load",
      title: "Ausencias frente a carga de trabajo",
      description: "Quién estuvo ausente y qué carga tenía encima mientras tanto.",
      scope: "global",
      period: "month",
      widgets: [
        widget({ title: "Días de ausencia por persona", chart: "hbar", measures: [m("away_days")], groupBy: "assignee", w: 2 }),
        widget({ title: "Abiertos por responsable", chart: "hbar", measures: [m("open_assigned")], groupBy: "assignee" }),
        widget({ title: "Carga frente a disponibilidad", chart: "bar", measures: [m("open_assigned"), m("backlog")], groupBy: "availability", w: 2 }),
      ],
    },
    {
      templateId: "ai-health",
      title: "Salud del servicio de IA",
      description: "Si la clasificación funciona y si la detección de incidentes acierta.",
      scope: "global",
      period: "month",
      widgets: [
        widget({ title: "Clasificación pendiente o fallida", chart: "kpi", measures: [m("ai_classification_failed")] }),
        widget({ title: "Acierto de área", chart: "kpi", measures: [m("ai_area_accuracy")] }),
        widget({ title: "Incidentes detectados", chart: "kpi", measures: [m("incidents_detected")] }),
        widget({ title: "Precisión de la detección", chart: "kpi", measures: [m("incident_precision")] }),
        widget({ title: "Resultado de la IA por área", chart: "stacked", measures: [m("created")], groupBy: "area", splitBy: "ai_result", w: 3 }),
      ],
    },
  ];

  return [...globalTemplates, ...areaTemplates, ...personal];
}
