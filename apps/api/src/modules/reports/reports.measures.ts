import {
  ACTIVE_TICKET_STATUSES,
  businessMinutesBetween,
  businessMinutesPerDay,
  MEASURE_META,
  type Aggregation,
  type BusinessCalendar,
  type TicketMeasureKey,
  type StatsRange,
  type TicketStatus,
} from "@tekzaya/shared";
import { Types, type PipelineStage } from "mongoose";
import { AvailabilityLog } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";
import { keyOf, preStages, type DimensionPlan } from "./reports.dimensions";

type Filter = Record<string, unknown>;
type Expr = unknown;

const ACTIVE = { $in: [...ACTIVE_TICKET_STATUSES] };

/**
 * Sobre qué conjunto de tickets se mide. No es un detalle: "resueltos este mes" son
 * los que **se resolvieron** dentro de la ventana, y "creados este mes" los que
 * entraron; el mismo ticket puede contar en enero para uno y en marzo para otro
 * (spec §9). Cada medida declara su ancla y la ventana se aplica sobre ella.
 */
export type Anchor =
  | "createdAt"
  | "resolvedAt"
  | "closedAt"
  | "respondedAt"
  | "csatAt"
  | "mergedAt"
  /** Lo que sigue sin resolver al final del período. */
  | "backlog"
  /** El estado de ahora mismo: carga, sin asignar, SLA vencido. No tiene ventana. */
  | "active"
  /** Un paso del historial dentro de la ventana (cancelado, reabierto). */
  | { history: TicketStatus };

const ANCHOR_FIELD: Record<string, string> = {
  createdAt: "createdAt",
  resolvedAt: "sla.resolvedAt",
  closedAt: "sla.closedAt",
  respondedAt: "sla.firstResponseAt",
  csatAt: "csat.answeredAt",
  mergedAt: "mergedAt",
};

/**
 * Fecha por la que se agrupa el eje de tiempo de esta medida, como **expresión**: un
 * paso del historial no es un campo, sino el último elemento de un array que cumple
 * una condición, y `$dateTrunc` sobre el array entero no es una fecha.
 */
export function anchorDateExpr(anchor: Anchor): unknown {
  if (typeof anchor === "object") {
    return {
      $let: {
        vars: {
          step: {
            $last: {
              $filter: {
                input: { $ifNull: ["$statusHistory", []] },
                as: "entry",
                cond: { $eq: ["$$entry.status", anchor.history] },
              },
            },
          },
        },
        in: "$$step.at",
      },
    };
  }
  return `$${ANCHOR_FIELD[anchor] ?? "createdAt"}`;
}

export function anchorMatch(anchor: Anchor, range: StatsRange): Filter {
  const window = { $gte: new Date(range.from), $lt: new Date(range.to) };
  const to = new Date(range.to);

  if (typeof anchor === "object") {
    return { statusHistory: { $elemMatch: { status: anchor.history, at: window } } };
  }

  if (anchor === "active") return { status: ACTIVE };

  if (anchor === "backlog") {
    // Atraso al final del período: creado antes del corte y sin desenlace antes del
    // corte. Se reconstruye con fechas, no con el estado actual, para que "pendientes
    // en marzo" siga siendo cierto consultado en junio (spec §9).
    //
    // La cancelación y la fusión no dejan fecha propia, así que se leen del
    // historial, que sí la tiene. Una reapertura borra `resolvedAt` (F3), de modo
    // que un ticket resuelto y reabierto cuenta como pendiente: es lo correcto hoy
    // y lo discutible solo para una ventana pasada.
    return {
      createdAt: { $lt: to },
      $nor: [
        { "sla.resolvedAt": { $lt: to } },
        { "sla.closedAt": { $lt: to } },
        {
          statusHistory: {
            $elemMatch: { status: { $in: ["cancelled", "merged"] }, at: { $lt: to } },
          },
        },
      ],
    };
  }

  return { [ANCHOR_FIELD[anchor]!]: window };
}

// ── Catálogo de cálculo ───────────────────────────────────────

type Formula =
  /** Cuántos tickets. */
  | { kind: "count" }
  /** Porcentaje: cuántos de los del denominador cumplen `of`. */
  | { kind: "rate"; of: Expr }
  /** Media de una expresión por ticket. */
  | { kind: "avg"; value: Expr }
  /** Suma de una expresión por ticket. */
  | { kind: "sum"; value: Expr }
  /** Horas laborales; se calculan en Node porque Mongo no sabe de jornada ni festivos. */
  | { kind: "duration"; of: "response" | "resolution" | "hold" | "age" }
  /** Grupos de incidente con tickets suficientes dentro de la ventana. */
  | { kind: "incidents" }
  /** Confirmados frente a descartados, por grupo de incidente. */
  | { kind: "incident_precision" }
  /** Sale de `availability_logs`, no de los tickets. */
  | { kind: "away_days" };

interface MeasureSpec {
  anchor: Anchor;
  formula: Formula;
  /** Acota el denominador de un porcentaje o el conjunto de una cuenta. */
  match?: Filter;
  /**
   * De qué campo salen las personas de esta medida. Un ticket resuelto cuenta para
   * **cada responsable al resolverlo** y la primera respuesta para **quien
   * respondió** (spec §9, atribución): no es el mismo campo según lo que se mida.
   */
  personField?: string;
  /** Los fusionados salen de toda métrica salvo la que existe para contarlos (spec §9). */
  includeMerged?: boolean;
}

const RESOLVED_BY = "sla.resolvedByIds";
const RESPONDER = "sla.firstResponderId";

const HAS_ASSIGNEE: Filter = { assigneeIds: { $not: { $size: 0 } } };

export const MEASURE_SPEC: Record<TicketMeasureKey, MeasureSpec> = {
  created: { anchor: "createdAt", formula: { kind: "count" } },
  resolved: { anchor: "resolvedAt", formula: { kind: "count" }, personField: RESOLVED_BY },
  closed: { anchor: "closedAt", formula: { kind: "count" } },
  cancelled: { anchor: { history: "cancelled" }, formula: { kind: "count" } },
  reopened: { anchor: { history: "reopened" }, formula: { kind: "count" } },
  backlog: { anchor: "backlog", formula: { kind: "count" } },
  unassigned: { anchor: "active", formula: { kind: "count" }, match: { assigneeIds: { $size: 0 } } },
  transferred: {
    anchor: "createdAt",
    formula: { kind: "count" },
    match: { "stats.transferCount": { $gt: 0 } },
  },
  merged_duplicates: {
    anchor: "mergedAt",
    formula: { kind: "count" },
    match: { status: "merged" },
    includeMerged: true,
  },
  incidents_detected: { anchor: "createdAt", formula: { kind: "incidents" } },

  first_response_time: {
    anchor: "respondedAt",
    formula: { kind: "duration", of: "response" },
    personField: RESPONDER,
  },
  resolution_time: {
    anchor: "resolvedAt",
    formula: { kind: "duration", of: "resolution" },
    personField: RESOLVED_BY,
  },
  hold_time: { anchor: "createdAt", formula: { kind: "duration", of: "hold" } },
  backlog_age: { anchor: "backlog", formula: { kind: "duration", of: "age" } },

  sla_response_rate: {
    anchor: "respondedAt",
    formula: { kind: "rate", of: { $ne: ["$sla.responseBreached", true] } },
    personField: RESPONDER,
  },
  sla_resolution_rate: {
    anchor: "resolvedAt",
    formula: { kind: "rate", of: { $ne: ["$sla.resolutionBreached", true] } },
    personField: RESOLVED_BY,
  },
  sla_breached: {
    anchor: "active",
    formula: { kind: "count" },
    match: { $expr: { $lt: ["$sla.resolutionDueAt", "$$NOW"] } },
  },
  sla_at_risk: {
    anchor: "active",
    formula: { kind: "count" },
    match: {
      $expr: {
        $and: [
          { $lt: ["$sla.resolutionRiskAt", "$$NOW"] },
          { $gte: ["$sla.resolutionDueAt", "$$NOW"] },
        ],
      },
    },
  },

  csat_average: { anchor: "csatAt", formula: { kind: "avg", value: "$csat.rating" } },
  csat_responses: { anchor: "csatAt", formula: { kind: "count" } },
  csat_response_rate: {
    anchor: "resolvedAt",
    formula: { kind: "rate", of: { $ne: [{ $ifNull: ["$csat.rating", null] }, null] } },
    personField: RESOLVED_BY,
  },
  reopen_rate: {
    anchor: "resolvedAt",
    formula: { kind: "rate", of: { $gt: [{ $ifNull: ["$stats.reopenCount", 0] }, 0] } },
    personField: RESOLVED_BY,
  },

  ai_area_accuracy: {
    anchor: "createdAt",
    formula: { kind: "rate", of: { $eq: ["$ai.suggestedAreaId", "$areaId"] } },
    match: { "ai.suggestedAreaId": { $ne: null } },
  },
  ai_category_accuracy: {
    anchor: "createdAt",
    formula: { kind: "rate", of: { $eq: ["$ai.suggestedCategoryId", "$categoryId"] } },
    match: { "ai.suggestedCategoryId": { $ne: null } },
  },
  priority_corrected_rate: {
    anchor: "createdAt",
    formula: { kind: "rate", of: { $ne: ["$ai.suggestedPriority", "$priority"] } },
    match: { "ai.suggestedPriority": { $ne: null } },
  },
  ai_classification_failed: {
    anchor: "createdAt",
    formula: { kind: "count" },
    match: { "ai.classificationStatus": { $in: ["pending", "failed"] } },
  },
  incident_precision: { anchor: "createdAt", formula: { kind: "incident_precision" } },

  open_assigned: { anchor: "active", formula: { kind: "count" }, match: HAS_ASSIGNEE },
  multi_assignee_rate: {
    anchor: "createdAt",
    formula: { kind: "rate", of: { $gte: ["$__assigneeCount", 2] } },
    match: HAS_ASSIGNEE,
  },
  public_messages: {
    anchor: "createdAt",
    formula: { kind: "avg", value: { $ifNull: ["$stats.publicMessageCount", 0] } },
  },
  internal_messages: {
    anchor: "createdAt",
    formula: { kind: "avg", value: { $ifNull: ["$stats.internalMessageCount", 0] } },
  },
  attachments_per_ticket: {
    anchor: "createdAt",
    formula: { kind: "avg", value: { $ifNull: ["$attachmentsCount", 0] } },
  },
  join_requests: {
    anchor: "createdAt",
    formula: { kind: "sum", value: { $ifNull: ["$stats.joinRequestCount", 0] } },
  },

  away_days: { anchor: "createdAt", formula: { kind: "away_days" } },
  on_behalf_rate: {
    anchor: "createdAt",
    formula: { kind: "rate", of: { $ne: ["$createdById", "$requesterId"] } },
  },
};

/** Campo de personas que usa la dimensión "responsable" para esta medida. */
export function personFieldOf(key: TicketMeasureKey): string {
  return MEASURE_SPEC[key].personField ?? "assigneeIds";
}

// ── Evaluación ────────────────────────────────────────────────

export interface MeasureContext {
  /** Alcance, perspectiva y filtros de la gráfica, ya resueltos. */
  base: Filter;
  range: StatsRange;
  calendar: BusinessCalendar;
  now: Date;
  /** Mínimo de tickets para que un grupo cuente como incidente (`settings`). */
  minIncidentTickets: number;
  /**
   * Personas del alcance. Solo lo necesitan las medidas que no salen de los tickets
   * (los días de ausencia): el resto ya viene acotado por `base`.
   */
  memberIds?: Types.ObjectId[];
  /** Dimensiones ya traducidas; `g` agrupa y `s` segmenta. */
  group?: DimensionPlan;
  split?: DimensionPlan;
}

/** Valor por grupo. La clave es `g` o `g\u0000s`; `""` cuando no hay dimensión. */
export type MeasureValues = Map<string, number | null>;

const and = (...parts: (Filter | undefined)[]): Filter => ({
  $and: parts.filter(Boolean) as Filter[],
});

const DELIM = "\u0000";

export function composeKey(group: unknown, split: unknown, hasSplit: boolean): string {
  return hasSplit ? `${keyOf(group)}${DELIM}${keyOf(split)}` : keyOf(group);
}

export function splitKey(key: string): { group: string; split?: string } {
  const index = key.indexOf(DELIM);
  if (index < 0) return { group: key };
  return { group: key.slice(0, index), split: key.slice(index + 1) };
}

/** `_id` del `$group`: un objeto con lo que haya, o `null` si no se agrupa. */
function groupId(ctx: MeasureContext): unknown {
  if (!ctx.group) return null;
  return ctx.split ? { g: ctx.group.expr, s: ctx.split.expr } : { g: ctx.group.expr };
}

/**
 * Lo que mide un ticket **entero** se calcula antes de desenrollar nada. Agrupar por
 * responsable parte cada ticket en una fila por persona, y a partir de ahí
 * `assigneeIds` ya no es la lista de responsables sino uno solo: preguntarle su tamaño
 * daría 0. Se guarda aparte y las medidas usan el valor guardado.
 */
const TICKET_SCOPED: PipelineStage = {
  $addFields: { __assigneeCount: { $size: { $ifNull: ["$assigneeIds", []] } } },
};

function stagesFor(ctx: MeasureContext): PipelineStage[] {
  return [TICKET_SCOPED, ...preStages([ctx.group, ctx.split].filter(Boolean) as DimensionPlan[])];
}

/**
 * Una etapa construida en tiempo de ejecución. Las expresiones de las dimensiones se
 * componen según lo que pidió la gráfica, así que no hay forma de que mongoose las
 * verifique: el cast se concentra aquí y no se repite por consulta.
 */
const stage = (value: Record<string, unknown>): PipelineStage => value as unknown as PipelineStage;

function rowKey(row: { _id: unknown }, ctx: MeasureContext): string {
  if (!ctx.group) return "";
  const id = row._id as { g: unknown; s?: unknown } | null;
  return composeKey(id?.g, id?.s, Boolean(ctx.split));
}

export async function evaluate(
  key: TicketMeasureKey,
  aggregationChoice: Aggregation | undefined,
  ctx: MeasureContext,
): Promise<MeasureValues> {
  const spec = MEASURE_SPEC[key];
  // Los duplicados fusionados quedan fuera de todo salvo de la medida que los
  // cuenta: el principal ya cuenta el problema una vez (spec §9).
  const merged = spec.includeMerged ? {} : { status: { $ne: "merged" } };
  const match = and(ctx.base, merged, anchorMatch(spec.anchor, ctx.range), spec.match);

  switch (spec.formula.kind) {
    case "count":
      return simpleGroup(ctx, match, { $sum: 1 });
    case "avg":
      return simpleGroup(ctx, match, { $avg: spec.formula.value });
    case "sum":
      return simpleGroup(ctx, match, { $sum: spec.formula.value });
    case "rate":
      return rate(ctx, match, spec.formula.of);
    case "duration":
      return duration(ctx, match, spec.formula.of, aggregationChoice ?? "avg");
    case "incidents":
      return incidents(ctx, match, false);
    case "incident_precision":
      return incidents(ctx, match, true);
    case "away_days":
      return awayDays(ctx);
  }
}

async function simpleGroup(
  ctx: MeasureContext,
  match: Filter,
  accumulator: unknown,
): Promise<MeasureValues> {
  const rows = await Ticket.aggregate<{ _id: unknown; value: number | null }>([
    stage({ $match: match }),
    ...stagesFor(ctx),
    stage({ $group: { _id: groupId(ctx), value: accumulator } }),
  ]);
  return new Map(rows.map((row) => [rowKey(row, ctx), round(row.value)]));
}

async function rate(ctx: MeasureContext, match: Filter, of: Expr): Promise<MeasureValues> {
  const rows = await Ticket.aggregate<{ _id: unknown; total: number; hits: number }>([
    stage({ $match: match }),
    ...stagesFor(ctx),
    stage({
      $group: {
        _id: groupId(ctx),
        total: { $sum: 1 },
        hits: { $sum: { $cond: [of, 1, 0] } },
      },
    }),
  ]);
  // Sin denominador el porcentaje no existe: `null`, no 0. Un área sin tickets
  // resueltos no "cumple el 0 % del SLA", simplemente no se puede decir nada.
  return new Map(
    rows.map((row) => [rowKey(row, ctx), row.total ? round((row.hits / row.total) * 100, 0) : null]),
  );
}

interface DurationRow {
  _id: unknown;
  from: Date;
  to?: Date;
  pausedMs?: number;
}

/**
 * Las horas laborales no caben en una agregación: hacen falta la jornada, los
 * festivos y la zona horaria, que Mongo no tiene. La consulta trae tres fechas por
 * ticket y el motor de F1 hace el resto aquí arriba (igual que en el tablero de F6).
 */
async function duration(
  ctx: MeasureContext,
  match: Filter,
  of: "response" | "resolution" | "hold" | "age",
  choice: Aggregation,
): Promise<MeasureValues> {
  const toField =
    of === "response" ? "$sla.firstResponseAt" : of === "resolution" ? "$sla.resolvedAt" : null;

  const rows = await Ticket.aggregate<DurationRow>([
    stage({ $match: match }),
    ...stagesFor(ctx),
    stage({
      $project: {
        _id: groupId(ctx),
        from: "$createdAt",
        ...(toField ? { to: toField } : {}),
        pausedMs: { $ifNull: ["$sla.pausedMs", 0] },
      },
    }),
  ]);

  const samples = new Map<string, number[]>();
  for (const row of rows) {
    const key = rowKey(row, ctx);
    const hours = hoursOf(row, of, ctx);
    if (hours === null) continue;
    const list = samples.get(key) ?? [];
    list.push(hours);
    samples.set(key, list);
  }

  const values: MeasureValues = new Map();
  for (const [key, list] of samples) values.set(key, round(aggregateSamples(list, choice)));
  return values;
}

function hoursOf(row: DurationRow, of: string, ctx: MeasureContext): number | null {
  const paused = row.pausedMs ?? 0;
  if (of === "hold") return paused / 3_600_000;

  const to = of === "age" ? ctx.now : row.to;
  if (!to || !row.from) return null;
  const minutes = businessMinutesBetween(row.from, to, ctx.calendar) - Math.round(paused / 60_000);
  return Math.max(0, minutes) / 60;
}

function aggregateSamples(values: number[], choice: Aggregation): number | null {
  if (!values.length) return null;
  if (choice === "avg") return values.reduce((sum, value) => sum + value, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  if (choice === "median") {
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  }
  // P90: el tiempo por debajo del cual se queda el 90 % (spec §9). Muestra los casos
  // lentos sin que uno solo distorsione la media.
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)]!;
}

/**
 * Incidentes: grupos de tickets, no tickets. Se agrupa dos veces — primero por grupo
 * de incidente para saber cuántos tickets tiene y si se descartó, y después por la
 * dimensión para contar grupos.
 */
async function incidents(
  ctx: MeasureContext,
  match: Filter,
  precision: boolean,
): Promise<MeasureValues> {
  const rows = await Ticket.aggregate<{
    _id: { key: unknown; groupId: string };
    tickets: number;
    dismissed: number;
  }>([
    stage({ $match: and(match, { "ai.incident.groupId": { $exists: true, $ne: null } }) }),
    ...stagesFor(ctx),
    stage({
      $group: {
        _id: { key: groupId(ctx), groupId: "$ai.incident.groupId" },
        tickets: { $sum: 1 },
        dismissed: { $max: { $cond: [{ $eq: ["$ai.incident.status", "dismissed"] }, 1, 0] } },
      },
    }),
  ]);

  const confirmed = new Map<string, number>();
  const discarded = new Map<string, number>();
  for (const row of rows) {
    if (row.tickets < ctx.minIncidentTickets) continue;
    const key = rowKey({ _id: row._id.key }, ctx);
    const bucket = row.dismissed ? discarded : confirmed;
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }

  if (!precision) return new Map([...confirmed].map(([key, value]) => [key, value]));

  // Un incidente se considera confirmado si el supervisor no lo descartó (spec §9).
  const values: MeasureValues = new Map();
  for (const key of new Set([...confirmed.keys(), ...discarded.keys()])) {
    const hits = confirmed.get(key) ?? 0;
    const total = hits + (discarded.get(key) ?? 0);
    values.set(key, total ? round((hits / total) * 100, 0) : null);
  }
  return values;
}

/**
 * Días de ausencia (spec §9): días **laborables** en los que la persona estuvo
 * Ausente dentro de la ventana. Sale de `availability_logs`, no de los tickets, así
 * que solo se agrupa por responsable o sin dimensión (`onlyDimensions` lo fija en el
 * contrato, de modo que el panel tampoco ofrece otra cosa).
 */
async function awayDays(ctx: MeasureContext): Promise<MeasureValues> {
  const from = new Date(ctx.range.from);
  const to = new Date(ctx.range.to);

  const logs = await AvailabilityLog.find({
    state: "away",
    from: { $lt: to },
    // Un tramo abierto (`to` ausente) sigue contando hasta el final de la ventana.
    $or: [{ to: { $exists: false } }, { to: null }, { to: { $gt: from } }],
    ...(ctx.memberIds ? { userId: { $in: ctx.memberIds } } : {}),
  })
    .select("userId from to")
    .lean();

  const perDay = businessMinutesPerDay(ctx.calendar.hours);
  const days = new Map<string, number>();
  for (const log of logs) {
    const start = new Date(Math.max(from.getTime(), (log.from as Date).getTime()));
    const end = new Date(Math.min(to.getTime(), ((log.to as Date | null) ?? to).getTime()));
    if (end <= start || perDay <= 0) continue;
    // Una ausencia de fin de semana no es un día de ausencia: se mide en jornadas,
    // igual que los plazos de cierre automático de F4.
    const value = businessMinutesBetween(start, end, ctx.calendar) / perDay;
    const key = ctx.group ? String(log.userId) : "";
    days.set(key, (days.get(key) ?? 0) + value);
  }

  return new Map([...days].map(([key, value]) => [key, round(value)]));
}

function round(value: number | null | undefined, decimals = 1): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export const measureLabel = (key: TicketMeasureKey): string => MEASURE_META[key].label;

export const asObjectId = (value: string): Types.ObjectId => new Types.ObjectId(value);
