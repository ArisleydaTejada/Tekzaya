import {
  CHART_META,
  MEASURE_META,
  validateWidget,
  type Actor,
  type BusinessCalendar,
  type DimensionKey,
  type MeasureKey,
  type Perspective,
  type ReportQueryResult,
  type ReportRow,
  type ReportWidget,
  type StatsRange,
  type WidgetComparison,
} from "@tekzaya/shared";
import type { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { bucketFor, previousRange } from "../stats/stats.period";
import { getCalendar, getSettings } from "../settings/settings.service";
import {
  labelResolver,
  planFor,
  type DimensionPlan,
  type LabelKind,
} from "./reports.dimensions";
import {
  anchorDateExpr,
  evaluate,
  MEASURE_SPEC,
  personFieldOf,
  splitKey,
  type MeasureValues,
} from "./reports.measures";
import {
  effectivePerspective,
  memberIdsOf,
  resolveScope,
  scopeFilterFor,
  slaStateFilter,
  widgetFilterFor,
  type ResolvedScope,
} from "./reports.scope";

/** Grupos visibles antes de juntar el resto en «Otros» (spec §7.8.3, paso 7). */
const DEFAULT_LIMIT = 12;

type Filter = Record<string, unknown>;

export interface QueryOptions {
  actor: Actor;
  widget: ReportWidget;
  scope: ResolvedScope;
  perspective: Perspective | undefined;
  range: StatsRange;
  now: Date;
}

/**
 * Una gráfica, una consulta. Cada medida se mide sobre **su** conjunto de tickets
 * (los resueltos del período no son los creados del período) y las filas se juntan
 * después por la clave del grupo: eso es lo que permite dibujar "recibidos frente a
 * resueltos" en la misma gráfica sin que ninguna de las dos serie mienta.
 */
export async function runWidget(options: QueryOptions): Promise<ReportQueryResult> {
  const { widget, scope, range, now } = options;

  const invalid = validateWidget(widget);
  if (invalid) throw new AppError(422, "validation_error", invalid);

  const [settings, calendar] = await Promise.all([getSettings(), getCalendar()]);
  const base = baseFilterFor(options, now);
  const memberIds = await memberIdsOf(scope);

  const shared = {
    base,
    calendar,
    now,
    minIncidentTickets: settings.incidentDetection.minTickets,
    ...(memberIds ? { memberIds } : {}),
    timezone: settings.businessHours.timezone,
  };

  const main = await measureAll(widget, shared, range);
  const rows = assemble(widget, main, Boolean(widget.splitBy));
  const totals = await totalsFor(widget, shared, range, main);

  const comparison = widget.compareWith
    ? await compare(widget, shared, options, widget.compareWith, settings.businessHours)
    : undefined;

  // Las etiquetas se resuelven una sola vez para la gráfica y su comparación.
  const resolve = await labelResolver(labelsNeeded(widget, [...rows, ...(comparison?.rows ?? [])]));
  const bucket = bucketFor(range);
  const labelled = rows.map((row) => withLabels(row, widget, resolve, bucket));

  const limited = applyOrderAndLimit(widget, labelled);

  return {
    widgetId: widget.id,
    chart: widget.chart,
    scope: scope.scope,
    ...(scope.areaName ? { areaName: scope.areaName } : {}),
    range,
    measures: widget.measures.map((item) => ({
      key: item.key,
      label: MEASURE_META[item.key].label,
      unit: MEASURE_META[item.key].unit,
      ...(item.aggregation ? { aggregation: item.aggregation } : {}),
      higherIsBetter: MEASURE_META[item.key].higherIsBetter,
    })),
    rows: widget.chart === "radar" ? normalizeRadar(widget, limited.rows) : limited.rows,
    ...(comparison
      ? {
          comparison: {
            label: comparison.label,
            rows: comparison.rows.map((row) => withLabels(row, widget, resolve, bucket)),
            totals: comparison.totals,
          },
        }
      : {}),
    totals,
    grouped: limited.grouped,
  };
}

// ── Filtro base ───────────────────────────────────────────────

function baseFilterFor(options: QueryOptions, now: Date): Filter {
  const { widget, scope, perspective } = options;
  const parts: Filter[] = [
    scopeFilterFor(scope, perspective),
    widgetFilterFor(widget.filters, scope),
  ];
  if (widget.filters.slaState) parts.push(slaStateFilter(widget.filters.slaState, now));

  // En el alcance global sin filtros no queda ninguna condición, y un `$and` vacío es
  // un error de Mongo, no un "todo": se devuelve el filtro vacío.
  const used = parts.filter((part) => Object.keys(part).length > 0);
  return used.length ? { $and: used } : {};
}

// ── Medición ──────────────────────────────────────────────────

interface Shared {
  base: Filter;
  calendar: BusinessCalendar;
  now: Date;
  minIncidentTickets: number;
  memberIds?: Types.ObjectId[];
  timezone: string;
}

/**
 * Plan de dimensiones **por medida**: el eje de tiempo de "creados" es la fecha de
 * creación y el de "resueltos" la de resolución, y la dimensión "responsable" apunta
 * a quien resolvió cuando se miden resoluciones (spec §9, atribución).
 */
function plansFor(
  key: MeasureKey,
  widget: ReportWidget,
  shared: Shared,
  range: StatsRange,
): { group?: DimensionPlan; split?: DimensionPlan } {
  const ctx = {
    anchorDate: anchorDateExpr(MEASURE_SPEC[key].anchor),
    bucket: bucketFor(range),
    timezone: shared.timezone,
    personField: personFieldOf(key),
    now: shared.now,
  };
  return {
    ...(widget.groupBy ? { group: planFor(widget.groupBy, ctx) } : {}),
    ...(widget.splitBy ? { split: planFor(widget.splitBy, ctx) } : {}),
  };
}

async function measureAll(
  widget: ReportWidget,
  shared: Shared,
  range: StatsRange,
): Promise<MeasureValues[]> {
  // Las medidas van en paralelo: son consultas independientes y un fallo en una no
  // debería retrasar las demás (spec §7.8.8, rendimiento).
  return Promise.all(
    widget.measures.map((item) =>
      evaluate(item.key, item.aggregation, {
        ...shared,
        range,
        ...plansFor(item.key, widget, shared, range),
      }),
    ),
  );
}

/**
 * Totales por medida. No se suman las filas: una media de medias no es la media, y un
 * porcentaje por persona no se promedia. Se vuelve a medir sin dimensión, que es la
 * única cuenta que cuadra con una consulta a mano.
 */
async function totalsFor(
  widget: ReportWidget,
  shared: Shared,
  range: StatsRange,
  main: MeasureValues[],
): Promise<(number | null)[]> {
  if (!widget.groupBy) return main.map((values) => values.get("") ?? null);

  const flat = await Promise.all(
    widget.measures.map((item) =>
      evaluate(item.key, item.aggregation, { ...shared, range }),
    ),
  );
  return flat.map((values) => values.get("") ?? null);
}

// ── Filas ─────────────────────────────────────────────────────

/** Fila antes de resolver etiquetas: solo la clave del grupo y sus valores. */
interface RawRow {
  key: string;
  values: (number | null)[];
}

function assemble(widget: ReportWidget, values: MeasureValues[], hasSplit: boolean): RawRow[] {
  if (!widget.groupBy) {
    return [{ key: "", values: values.map((map) => map.get("") ?? null) }];
  }

  const keys = new Set<string>();
  for (const map of values) for (const key of map.keys()) keys.add(key);

  const rows = [...keys].map((key) => ({
    key,
    values: values.map((map) => map.get(key) ?? null),
  }));

  // Una fila sin ningún valor no es información, es una clave que sobrevivió a un
  // `$unwind`. Un cero sí lo es —"cumplimiento del 0 %" dice mucho—, así que solo se
  // descarta lo que está entero en blanco.
  return rows.filter((row) => hasSplit || row.values.some((value) => value !== null));
}

function labelsNeeded(
  widget: ReportWidget,
  rows: RawRow[],
): { kind: LabelKind; keys: Set<string> }[] {
  if (!widget.groupBy) return [];
  const groupKind = kindOf(widget.groupBy);
  const splitKind = widget.splitBy ? kindOf(widget.splitBy) : undefined;

  const groupKeys = new Set<string>();
  const splitKeys = new Set<string>();
  for (const row of rows) {
    const parts = splitKey(row.key);
    groupKeys.add(parts.group);
    if (parts.split !== undefined) splitKeys.add(parts.split);
  }

  return [
    { kind: groupKind, keys: groupKeys },
    ...(splitKind ? [{ kind: splitKind, keys: splitKeys }] : []),
  ];
}

/** Qué clase de etiqueta produce esta dimensión; lo sabe el planificador. */
function kindOf(dimension: DimensionKey): LabelKind {
  return planFor(dimension, {
    anchorDate: "$createdAt",
    bucket: "day",
    timezone: "UTC",
    personField: "assigneeIds",
    now: new Date(),
  }).labels;
}

function withLabels(
  row: RawRow,
  widget: ReportWidget,
  resolve: Awaited<ReturnType<typeof labelResolver>>,
  bucket: ReturnType<typeof bucketFor>,
): ReportRow {
  if (!widget.groupBy) return { label: "Total", values: row.values };

  const parts = splitKey(row.key);
  return {
    key: parts.group,
    label: resolve(kindOf(widget.groupBy), parts.group, bucket),
    ...(parts.split !== undefined && widget.splitBy
      ? { split: resolve(kindOf(widget.splitBy), parts.split, bucket) }
      : {}),
    values: row.values,
  };
}

/**
 * Orden y techo de grupos. Lo que se pase del techo se junta en «Otros» en vez de
 * desaparecer: una dona que suma el 60 % del total engaña más que una con seis
 * porciones y una séptima agrupada (spec §7.8.6).
 */
function applyOrderAndLimit(
  widget: ReportWidget,
  rows: ReportRow[],
): { rows: ReportRow[]; grouped: boolean } {
  if (!widget.groupBy) return { rows, grouped: false };

  const chronological =
    widget.sort === "chronological" || widget.groupBy === "time" || widget.groupBy === "weekday_hour";

  const sorted = [...rows].sort((a, b) => {
    if (chronological) return (a.key ?? "").localeCompare(b.key ?? "", undefined, { numeric: true });
    if (widget.sort === "label") return a.label.localeCompare(b.label, "es");
    const left = a.values[0] ?? 0;
    const right = b.values[0] ?? 0;
    return widget.sort === "value_asc" ? left - right : right - left;
  });

  const cap = widget.limit ?? CHART_META[widget.chart].maxSlices ?? DEFAULT_LIMIT;
  // El eje de tiempo no se recorta: faltarían días en medio de la serie.
  if (chronological || sorted.length <= cap) return { rows: sorted, grouped: false };

  // Con segmentación el techo se aplica a los grupos, no a las filas: recortar filas
  // partiría una barra apilada por la mitad.
  if (widget.splitBy) {
    const order = [...new Set(sorted.map((row) => row.key))].slice(0, cap);
    const keep = new Set(order);
    return { rows: sorted.filter((row) => keep.has(row.key)), grouped: sorted.length > keep.size };
  }

  const head = sorted.slice(0, cap);
  const tail = sorted.slice(cap);
  const others: ReportRow = {
    key: "__others",
    label: "Otros",
    values: head[0]!.values.map((_, index) =>
      // Solo se pueden sumar recuentos. Promediar los porcentajes de la cola daría un
      // número que no corresponde a nada, así que «Otros» se queda sin valor.
      MEASURE_META[widget.measures[index]!.key].unit === "count"
        ? tail.reduce((sum, row) => sum + (row.values[index] ?? 0), 0)
        : null,
    ),
  };
  return { rows: [...head, others], grouped: true };
}

/**
 * Radar: todos los ejes a 0–100 con "más lejos del centro = mejor" (spec §7.8.6). El
 * contrato ya garantiza que solo llegan porcentajes y CSAT, así que la normalización
 * es exacta y no hay que inventar un techo.
 */
function normalizeRadar(widget: ReportWidget, rows: ReportRow[]): ReportRow[] {
  return rows.map((row) => ({
    ...row,
    values: row.values.map((value, index) => {
      if (value === null) return null;
      const meta = MEASURE_META[widget.measures[index]!.key];
      const scaled = meta.unit === "rating" ? (value / 5) * 100 : value;
      return Math.round(meta.higherIsBetter ? scaled : 100 - scaled);
    }),
  }));
}

// ── Comparación (spec §7.8.3, paso 8) ─────────────────────────

async function compare(
  widget: ReportWidget,
  shared: Shared,
  options: QueryOptions,
  comparison: WidgetComparison,
  hours: Parameters<typeof previousRange>[1],
): Promise<{ label: string; rows: RawRow[]; totals: (number | null)[] }> {
  if (comparison.kind === "previous_period") {
    const range = previousRange(options.range, hours);
    const values = await measureAll(widget, shared, range);
    return {
      label: "Período anterior",
      rows: assemble(widget, values, Boolean(widget.splitBy)),
      totals: await totalsFor(widget, shared, range, values),
    };
  }

  // Comparar con otra persona o área es cambiar de alcance, así que **se vuelve a
  // validar**: un empleado que pida comparar con su supervisor recibe 403 (spec §7.8.1).
  const actor = options.actor;
  const scope = await resolveScope(
    comparison.kind === "area"
      ? { scope: "area", areaId: comparison.areaId, period: options.range.period }
      : { scope: "user", userId: comparison.userId, period: options.range.period },
    actor,
  );

  const perspective = effectivePerspective(scope, widget.perspective);
  const members = await memberIdsOf(scope);
  const other: Shared = {
    ...shared,
    base: baseFilterFor({ ...options, scope, perspective }, shared.now),
    ...(members ? { memberIds: members } : {}),
  };

  const values = await measureAll(widget, other, options.range);
  return {
    label: scope.areaName ?? "Comparación",
    rows: assemble(widget, values, Boolean(widget.splitBy)),
    totals: await totalsFor(widget, other, options.range, values),
  };
}
