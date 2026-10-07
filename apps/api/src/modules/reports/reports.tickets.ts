import {
  businessMinutesBetween,
  canViewTicket,
  isAdmin,
  PRIORITIES,
  REPORT_ROW_CAP,
  TICKET_STATUSES,
  type Actor,
  type BusinessCalendar,
  type Perspective,
  type ReportTicketRow,
  type ReportTicketsQuery,
  type ReportTicketsResponse,
  type StatsRange,
  type TicketStatus,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { Ticket } from "../../models/ticket.model";
import { getCalendar } from "../settings/settings.service";
import { refOf, visibilityFilter, type LeanTicket } from "../tickets/ticket.access";
import { hydrate, slaStatesOf, type Hydration } from "../tickets/ticket.view";
import { windowOf } from "../stats/stats.period";
import { canReportOnOthers, slaStateFilter, type ResolvedScope } from "./reports.scope";

type Filter = Record<string, unknown>;

const oid = (value: string): Types.ObjectId => new Types.ObjectId(value);

/**
 * Qué tickets entran en la lista del período (spec §7.8.9). No es el mismo criterio
 * que la lista de Tickets: aquí el **empleado ve todos los de su área** —puede leer
 * sus conversaciones por la regla del §7.5— aunque sus gráficas sigan siendo solo de
 * sus datos. Lo que se amplía es la tabla, no el alcance de las medidas.
 *
 * RRHH y el administrador ven todas las áreas. La diferencia es que RRHH no puede
 * abrir la conversación de un área ajena: eso lo marca `readable` fila a fila, y la
 * API de detalle lo vuelve a comprobar.
 */
function listVisibility(actor: Actor): Filter {
  if (isAdmin(actor) || actor.hasGlobalReadAccess) return {};
  return visibilityFilter(actor);
}

/** Igual que en las gráficas: la perspectiva solo acota en el alcance personal. */
function scopeNarrowing(scope: ResolvedScope, perspective: Perspective | undefined): Filter {
  if (scope.scope === "global") return {};
  if (scope.scope === "area") return { areaId: oid(scope.areaId!) };
  const userId = oid(scope.userId!);
  if (perspective === "requester") {
    return {
      $or: [{ requesterId: userId }, { createdById: userId }, { additionalRequesterIds: userId }],
    };
  }
  return {
    $or: [
      { assigneeIds: userId },
      { "sla.resolvedByIds": userId },
      { "sla.firstResponderId": userId },
      { requesterId: userId },
      { createdById: userId },
    ],
  };
}

/** `"TK-000512, 7"` → `[512, 7]`. El número se escribe como se lee en pantalla. */
function parseNumbers(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((part) => Number(part.replace(/^tk-?/i, "")))
    .filter((value) => Number.isInteger(value) && value > 0);
}

function dayRange(from?: string, to?: string): Filter | undefined {
  if (!from && !to) return undefined;
  const filter: Filter = {};
  if (from) filter["$gte"] = new Date(`${from}T00:00:00.000Z`);
  // El día final entra completo: quien filtra "hasta el 7" espera el 7 incluido.
  if (to) filter["$lt"] = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000);
  return filter;
}

/**
 * Los filtros del §7.8.9 traducidos a Mongo. Los de tiempo (primera respuesta,
 * resolución, antigüedad) **no** están aquí: se miden en horas laborales, que Mongo
 * no sabe calcular, y se aplican arriba sobre el resultado.
 */
function refine(query: ReportTicketsQuery, actor: Actor, now: Date): Filter {
  const parts: Filter[] = [];

  if (query.numbers) {
    const numbers = parseNumbers(query.numbers);
    parts.push({ number: numbers.length ? { $in: numbers } : -1 });
  }
  if (query.q) {
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    parts.push({
      $or: [
        { title: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ],
    });
  }

  if (query.unassigned) parts.push({ assigneeIds: { $size: 0 } });
  else if (query.assigneeIds?.length) parts.push({ assigneeIds: { $in: query.assigneeIds.map(oid) } });
  if (query.requesterId) parts.push({ requesterId: oid(query.requesterId) });
  if (query.createdById) parts.push({ createdById: oid(query.createdById) });
  if (query.mine) {
    const me = oid(actor.id);
    parts.push({
      $or: [
        { requesterId: me },
        { createdById: me },
        { additionalRequesterIds: me },
        { assigneeIds: me },
      ],
    });
  }

  if (query.areaIds?.length) parts.push({ areaId: { $in: query.areaIds.map(oid) } });
  if (query.categoryIds?.length) parts.push({ categoryId: { $in: query.categoryIds.map(oid) } });
  if (query.priorities?.length) parts.push({ priority: { $in: query.priorities } });
  if (query.statuses?.length) parts.push({ status: { $in: query.statuses } });
  if (query.slaStates?.length) {
    parts.push({ $or: query.slaStates.map((state) => slaStateFilter(state, now)) });
  }

  const created = dayRange(query.createdFrom, query.createdTo);
  if (created) parts.push({ createdAt: created });
  const resolved = dayRange(query.resolvedFrom, query.resolvedTo);
  if (resolved) parts.push({ "sla.resolvedAt": resolved });
  const closed = dayRange(query.closedFrom, query.closedTo);
  if (closed) parts.push({ "sla.closedAt": closed });

  if (query.csatRatings?.length) {
    const numbers = query.csatRatings.filter((value) => value !== "none").map(Number);
    const or: Filter[] = [];
    if (numbers.length) or.push({ "csat.rating": { $in: numbers } });
    if (query.csatRatings.includes("none")) or.push({ "csat.rating": { $exists: false } });
    parts.push({ $or: or });
  }
  if (query.reopened !== undefined) {
    parts.push({ "stats.reopenCount": query.reopened ? { $gt: 0 } : { $in: [0, null] } });
  }
  if (query.responseBreached !== undefined) {
    parts.push({ "sla.responseBreached": query.responseBreached ? true : { $ne: true } });
  }
  if (query.resolutionBreached !== undefined) {
    parts.push({ "sla.resolutionBreached": query.resolutionBreached ? true : { $ne: true } });
  }

  if (query.hasAttachments !== undefined) {
    parts.push({ attachmentsCount: query.hasAttachments ? { $gt: 0 } : { $in: [0, null] } });
  }
  if (query.onBehalf !== undefined) {
    parts.push({
      $expr: query.onBehalf
        ? { $ne: ["$createdById", "$requesterId"] }
        : { $eq: ["$createdById", "$requesterId"] },
    });
  }
  if (query.multiAssignee !== undefined) {
    parts.push({
      $expr: {
        [query.multiAssignee ? "$gte" : "$lt"]: [{ $size: { $ifNull: ["$assigneeIds", []] } }, 2],
      },
    });
  }
  if (query.transferred !== undefined) {
    parts.push({ "stats.transferCount": query.transferred ? { $gt: 0 } : { $in: [0, null] } });
  }
  if (query.merged === "duplicate") parts.push({ status: "merged" });
  if (query.merged === "principal") parts.push({ "mergedTicketIds.0": { $exists: true } });
  if (query.incident !== undefined) {
    parts.push(
      query.incident
        ? { "ai.incident.groupId": { $exists: true, $ne: null } }
        : { "ai.incident.groupId": { $in: [null, undefined] } },
    );
  }
  if (query.aiPending !== undefined && query.aiPending) {
    parts.push({ "ai.classificationStatus": { $in: ["pending", "failed"] } });
  }
  if (query.priorityCorrected !== undefined && query.priorityCorrected) {
    parts.push({ "stats.priorityChangedByHuman": true });
  }

  return parts.length ? { $and: parts } : {};
}

/**
 * La prioridad y el estado se ordenan por su posición en el ciclo de vida y no
 * por su texto: alfabéticamente, "high" iría antes que "urgent" y "closed" antes
 * que "open", que no es lo que nadie espera al pulsar la cabecera. Los dos
 * rangos se calculan en la consulta, igual que en la lista de trabajo.
 */
const SORT_FIELD: Record<ReportTicketsQuery["sort"], string> = {
  createdAt: "createdAt",
  number: "number",
  title: "title",
  priority: "priorityRank",
  status: "statusRank",
  firstResponse: "sla.firstResponseAt",
  resolvedAt: "sla.resolvedAt",
  resolutionTime: "sla.resolvedAt",
  csat: "csat.rating",
  reopened: "stats.reopenCount",
};

/** Los rangos que `SORT_FIELD` necesita; cuestan nada y simplifican el $sort. */
const RANK_FIELDS = {
  priorityRank: { $indexOfArray: [[...PRIORITIES], "$priority"] },
  statusRank: { $indexOfArray: [[...TICKET_STATUSES], "$status"] },
};

/**
 * Orden en memoria para el camino exacto, que no pasa por el `$addFields` del
 * agregado porque `find()` no sabe calcular campos.
 */
const ROW_SORT_KEY: Partial<Record<ReportTicketsQuery["sort"], (row: ReportTicketRow) => number>> = {
  priority: (row) => PRIORITIES.indexOf(row.priority),
  status: (row) => TICKET_STATUSES.indexOf(row.status),
  resolutionTime: (row) => row.resolutionHours ?? -1,
};

/** ¿Hace falta calcular horas laborales antes de poder filtrar u ordenar? */
function needsHours(query: ReportTicketsQuery): boolean {
  return (
    (query.responseHoursOp !== undefined && query.responseHours !== undefined) ||
    (query.resolutionHoursOp !== undefined && query.resolutionHours !== undefined) ||
    query.ageDaysMin !== undefined ||
    query.sort === "resolutionTime"
  );
}

export interface TicketListResult {
  items: ReportTicketRow[];
  total: number;
  byStatus: Record<string, number>;
  truncated: boolean;
}

export async function listTicketsOfPeriod(
  query: ReportTicketsQuery,
  scope: ResolvedScope,
  perspective: Perspective | undefined,
  actor: Actor,
  range: StatsRange,
  now: Date,
  /** El CSV se lleva todas las filas; la tabla solo la página que se ve. */
  options: { all?: boolean } = {},
): Promise<TicketListResult> {
  const window = windowOf(range);
  const filter: Filter = {
    $and: [
      listVisibility(actor),
      scopeNarrowing(scope, perspective),
      // La lista incluye **todos los estados**, también Cerrado, Cancelado y
      // Fusionado, que la lista de trabajo oculta: aquí se consulta el histórico.
      { createdAt: { $gte: window.from, $lt: window.to } },
      refine(query, actor, now),
    ],
  };

  const calendar = await getCalendar();
  const direction = query.dir === "asc" ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [SORT_FIELD[query.sort]]: direction, _id: direction };

  // ── Camino rápido: la base puede ordenar y paginar sola ──
  if (!needsHours(query)) {
    const [page, byStatus] = await Promise.all([
      Ticket.aggregate<{ items: LeanTicket[]; total: { value: number }[] }>([
        { $match: filter },
        { $addFields: RANK_FIELDS },
        { $sort: sort },
        {
          $facet: {
            items: options.all
              ? [{ $limit: REPORT_ROW_CAP }]
              : [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
            total: [{ $count: "value" }],
          },
        },
      ]),
      statusTotals(filter),
    ]);

    const found = page[0]?.items ?? [];
    const total = page[0]?.total[0]?.value ?? 0;
    return {
      items: await toRows(found, actor, calendar, now),
      total,
      byStatus,
      truncated: Boolean(options.all) && total > REPORT_ROW_CAP,
    };
  }

  // ── Camino exacto: los filtros de tiempo se miden en horas laborales ──
  // Mongo no puede calcularlas, así que se traen hasta el techo de filas del §7.8.9,
  // se calculan con el motor de F1 y se pagina arriba. Es más caro y es lo correcto:
  // un "más de 8 horas" medido con reloj de pared contaría las noches.
  // `find()` no calcula los rangos, así que para esas columnas se pide el orden
  // natural y se reordena abajo sobre las filas ya construidas.
  const mongoSort: Record<string, 1 | -1> = ROW_SORT_KEY[query.sort]
    ? { createdAt: direction, _id: direction }
    : sort;
  const found = (await Ticket.find(filter).sort(mongoSort).limit(REPORT_ROW_CAP).lean()) as LeanTicket[];
  const rows = await toRows(found, actor, calendar, now);

  const filtered = rows.filter((row) => matchesHours(row, query));
  const key = ROW_SORT_KEY[query.sort];
  if (key) filtered.sort((a, b) => (key(a) - key(b)) * direction);

  const byStatus: Record<string, number> = {};
  for (const row of filtered) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

  const start = (query.page - 1) * query.limit;
  return {
    items: options.all ? filtered : filtered.slice(start, start + query.limit),
    total: filtered.length,
    byStatus,
    truncated: found.length >= REPORT_ROW_CAP,
  };
}

function matchesHours(row: ReportTicketRow, query: ReportTicketsQuery): boolean {
  if (query.responseHoursOp && query.responseHours !== undefined) {
    const value = row.firstResponseHours;
    if (value === null) return false;
    if (query.responseHoursOp === "gt" ? value <= query.responseHours : value >= query.responseHours) {
      return false;
    }
  }
  if (query.resolutionHoursOp && query.resolutionHours !== undefined) {
    const value = row.resolutionHours;
    if (value === null) return false;
    if (
      query.resolutionHoursOp === "gt"
        ? value <= query.resolutionHours
        : value >= query.resolutionHours
    ) {
      return false;
    }
  }
  if (query.ageDaysMin !== undefined) {
    // La antigüedad se cuenta en días naturales: es lo que significa "lleva abierto
    // tres días" para quien espera una respuesta.
    const days = (Date.now() - new Date(row.createdAt).getTime()) / 86_400_000;
    if (days < query.ageDaysMin) return false;
  }
  return true;
}

async function statusTotals(filter: Filter): Promise<Record<string, number>> {
  const rows = await Ticket.aggregate<{ _id: TicketStatus; count: number }>([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const totals: Record<string, number> = {};
  for (const row of rows) totals[row._id] = row.count;
  return totals;
}

// ── Filas ─────────────────────────────────────────────────────

async function toRows(
  tickets: LeanTicket[],
  actor: Actor,
  calendar: BusinessCalendar,
  now: Date,
): Promise<ReportTicketRow[]> {
  if (!tickets.length) return [];
  const hydration = await hydrate(tickets);
  const principals = await mergedNumbers(tickets);
  return tickets.map((ticket) => toRow(ticket, hydration, principals, actor, calendar, now));
}

/** Número del principal en el que se fusionó cada duplicado, para la columna «Fusionado con». */
async function mergedNumbers(tickets: LeanTicket[]): Promise<Map<string, number>> {
  const ids = tickets
    .map((ticket) => ticket["mergedIntoId"])
    .filter(Boolean)
    .map((id) => new Types.ObjectId(String(id)));
  if (!ids.length) return new Map();
  const found = await Ticket.find({ _id: { $in: ids } })
    .select("number")
    .lean();
  return new Map(found.map((ticket) => [String(ticket._id), ticket.number as number]));
}

function workingHours(
  from: Date,
  to: Date | undefined,
  pausedMs: number,
  calendar: BusinessCalendar,
): number | null {
  if (!to) return null;
  const minutes = businessMinutesBetween(from, to, calendar) - Math.round(pausedMs / 60_000);
  return Math.round((Math.max(0, minutes) / 60) * 10) / 10;
}

function toRow(
  ticket: LeanTicket,
  hydration: Hydration,
  principals: Map<string, number>,
  actor: Actor,
  calendar: BusinessCalendar,
  now: Date,
): ReportTicketRow {
  const sla = ticket["sla"] ?? {};
  const createdAt = ticket["createdAt"] as Date;
  const paused = (sla.pausedMs as number | undefined) ?? 0;
  const states = slaStatesOf(ticket, now);
  const ref = refOf(ticket);
  const readable = canViewTicket(actor, ref);
  const categoryId = ticket["categoryId"] ? String(ticket["categoryId"]) : undefined;
  const incident = ticket["ai"]?.incident;

  const user = (id: unknown) =>
    hydration.users.get(String(id)) ?? {
      id: String(id),
      name: "Usuario dado de baja",
      areaId: String(id),
      availability: { state: "available" as const },
    };

  return {
    id: String(ticket["_id"]),
    number: ticket["number"] as number,
    title: ticket["title"] as string,
    requester: user(ticket["requesterId"]),
    createdBy: user(ticket["createdById"]),
    area: hydration.areas.get(String(ticket["areaId"])) ?? {
      id: String(ticket["areaId"]),
      name: "Área",
      color: "#7C8CAE",
    },
    ...(categoryId && hydration.categories.get(categoryId)
      ? { categoryName: hydration.categories.get(categoryId)! }
      : {}),
    priority: ticket["priority"],
    status: ticket["status"] as TicketStatus,
    assignees: ((ticket["assigneeIds"] as unknown[] | undefined) ?? []).map(user),
    createdAt: createdAt.toISOString(),
    ...(sla.firstResponseAt ? { firstResponseAt: (sla.firstResponseAt as Date).toISOString() } : {}),
    ...(sla.resolvedAt ? { resolvedAt: (sla.resolvedAt as Date).toISOString() } : {}),
    ...(sla.closedAt ? { closedAt: (sla.closedAt as Date).toISOString() } : {}),
    firstResponseHours: workingHours(createdAt, sla.firstResponseAt as Date | undefined, paused, calendar),
    resolutionHours: workingHours(createdAt, sla.resolvedAt as Date | undefined, paused, calendar),
    ageHours: sla.resolvedAt ? null : workingHours(createdAt, now, paused, calendar),
    responseState: states.response,
    resolutionState: states.resolution,
    responseDueAt: (sla.responseDueAt as Date).toISOString(),
    resolutionDueAt: (sla.resolutionDueAt as Date).toISOString(),
    ...(ticket["csat"]?.rating ? { csat: ticket["csat"].rating as number } : {}),
    reopened: ((ticket["stats"]?.reopenCount as number | undefined) ?? 0) > 0,
    transferred: ((ticket["stats"]?.transferCount as number | undefined) ?? 0) > 0,
    onBehalf: String(ticket["createdById"]) !== String(ticket["requesterId"]),
    // La etiqueta del incidente es de quien atiende; el solicitante no ve que su
    // problema es uno de veinte (spec §6.2, IA-5), y en esta tabla tampoco.
    ...(incident?.label && incident.status !== "dismissed" && canReportOnOthers(actor) && readable
      ? { incidentLabel: incident.label as string }
      : {}),
    ...(ticket["mergedIntoId"] && principals.has(String(ticket["mergedIntoId"]))
      ? { mergedIntoNumber: principals.get(String(ticket["mergedIntoId"]))! }
      : {}),
    mergedCount: ((ticket["mergedTicketIds"] as unknown[] | undefined) ?? []).length,
    readable,
  };
}

export function buildResponse(
  result: TicketListResult,
  query: ReportTicketsQuery,
  scope: ResolvedScope,
  range: StatsRange,
): ReportTicketsResponse {
  return {
    items: result.items,
    total: result.total,
    page: query.page,
    limit: query.limit,
    range,
    scope: scope.scope,
    byStatus: result.byStatus as ReportTicketsResponse["byStatus"],
    truncated: result.truncated,
  };
}
