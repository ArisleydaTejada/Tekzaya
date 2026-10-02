import {
  ACTIVE_TICKET_STATUSES,
  businessMinutesBetween,
  type AreaKpis,
  type AvailabilityEntry,
  type BusinessCalendar,
  type CategoryRow,
  type PersonalKpis,
  type PersonRow,
  type StatsIncident,
  type StatsRange,
  type TimeseriesPoint,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { Area } from "../../models/area.model";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { getCalendar, getSettings } from "../settings/settings.service";
import { bucketFor, windowOf } from "./stats.period";
import { scopeTicketFilter, type ResolvedScope } from "./stats.scope";

type Filter = Record<string, unknown>;

const ACTIVE = { $in: [...ACTIVE_TICKET_STATUSES] };
const oid = (value: string): Types.ObjectId => new Types.ObjectId(value);

function and(...parts: Filter[]): Filter {
  return { $and: parts };
}

/** Minutos laborables consumidos, descontando lo que el ticket estuvo en pausa (spec §9). */
function workingHoursBetween(
  from: Date,
  to: Date,
  pausedMs: number,
  calendar: BusinessCalendar,
): number {
  const minutes = businessMinutesBetween(from, to, calendar) - Math.round(pausedMs / 60_000);
  return Math.max(0, minutes) / 60;
}

function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

const round = (value: number | null, decimals = 1): number | null =>
  value === null ? null : Math.round(value * 10 ** decimals) / 10 ** decimals;

// ── Tiempos de primera respuesta ──────────────────────────────

interface ResponseSample {
  responderId: string | null;
  hours: number;
}

/**
 * Las horas laborales no se pueden calcular dentro de una agregación de Mongo: hace
 * falta la jornada, los festivos y la zona horaria. Así que la consulta trae lo
 * mínimo (tres fechas por ticket) y el motor de F1 hace el resto aquí.
 *
 * Se mide sobre los tickets **que recibieron respuesta dentro del período**, no
 * sobre los resueltos: el tiempo de respuesta se cuenta cuando ocurre la respuesta,
 * y un ticket puede responderse en enero y resolverse en marzo.
 */
async function responseSamples(
  base: Filter,
  range: StatsRange,
  calendar: BusinessCalendar,
): Promise<ResponseSample[]> {
  const window = windowOf(range);
  const tickets = await Ticket.find(
    and(base, { "sla.firstResponseAt": { $gte: window.from, $lt: window.to } }),
  )
    .select("createdAt sla.firstResponseAt sla.firstResponderId sla.pausedMs")
    .lean();

  return tickets.map((ticket) => ({
    responderId: ticket.sla?.firstResponderId ? String(ticket.sla.firstResponderId) : null,
    hours: workingHoursBetween(
      ticket.createdAt!,
      ticket.sla!.firstResponseAt as Date,
      ticket.sla?.pausedMs ?? 0,
      calendar,
    ),
  }));
}

// ── KPI ───────────────────────────────────────────────────────

export async function areaKpisFor(scope: ResolvedScope, range: StatsRange): Promise<AreaKpis> {
  const base = scopeTicketFilter(scope);
  const window = windowOf(range);
  const resolvedInPeriod = and(base, {
    "sla.resolvedAt": { $gte: window.from, $lt: window.to },
  });

  const [calendar, pending, unassigned, resolvedRows, csatRows] = await Promise.all([
    getCalendar(),
    Ticket.countDocuments(and(base, { status: ACTIVE })),
    Ticket.countDocuments(and(base, { status: ACTIVE, assigneeIds: { $size: 0 } })),
    Ticket.aggregate<{ _id: null; total: number; onTime: number }>([
      { $match: resolvedInPeriod },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          onTime: { $sum: { $cond: [{ $eq: ["$sla.resolutionBreached", true] }, 0, 1] } },
        },
      },
    ]),
    Ticket.aggregate<{ _id: null; total: number; sum: number }>([
      { $match: and(base, { "csat.answeredAt": { $gte: window.from, $lt: window.to } }) },
      { $group: { _id: null, total: { $sum: 1 }, sum: { $sum: "$csat.rating" } } },
    ]),
  ]);

  const samples = await responseSamples(base, range, calendar);
  const hours = samples.map((sample) => sample.hours);
  const resolved = resolvedRows[0]?.total ?? 0;
  const csat = csatRows[0];

  return {
    kind: "area",
    pending,
    unassigned,
    resolved,
    firstResponseHours: round(average(hours)),
    firstResponseMedianHours: round(median(hours)),
    slaCompliance: resolved ? Math.round((resolvedRows[0]!.onTime / resolved) * 100) : null,
    csatAverage: csat?.total ? round(csat.sum / csat.total) : null,
    csatResponses: csat?.total ?? 0,
  };
}

export async function personalKpisFor(
  scope: ResolvedScope,
  range: StatsRange,
): Promise<PersonalKpis> {
  const base = scopeTicketFilter(scope);
  const window = windowOf(range);
  const userId = oid(scope.userId!);
  const areaId = oid(scope.areaId!);

  const [areaPending, resolvedByMe, pendingForMe, urgent] = await Promise.all([
    Ticket.countDocuments(and(base, { areaId, status: ACTIVE })),
    Ticket.countDocuments(
      and(base, {
        "sla.resolvedByIds": userId,
        "sla.resolvedAt": { $gte: window.from, $lt: window.to },
      }),
    ),
    Ticket.countDocuments(and(base, { assigneeIds: userId, status: ACTIVE })),
    // "Urgentes" es lo que esta persona puede atender ya: lo suyo, más lo que
    // nadie ha tomado todavía en su área (spec §7.2.1).
    Ticket.countDocuments(
      and(base, {
        areaId,
        status: ACTIVE,
        priority: "urgent",
        $or: [{ assigneeIds: userId }, { assigneeIds: { $size: 0 } }],
      }),
    ),
  ]);

  return { kind: "personal", areaPending, resolvedByMe, pendingForMe, urgent };
}

/**
 * Incidente abierto con más tickets dentro del alcance. Alimenta la franja de aviso
 * del tablero; si el supervisor lo descartó, su estado queda en `dismissed` y deja
 * de aparecer (spec §6.2, IA-5).
 *
 * **Solo en la vista de área o global.** La franja dice "tu problema es uno de
 * veinte", y eso es información de quien atiende, no de quien reporta: en la vista
 * personal se calla, igual que `incidentLabel` se omite para el solicitante (F5).
 */
export async function activeIncidentFor(scope: ResolvedScope): Promise<StatsIncident | undefined> {
  if (scope.scope !== "area" && scope.scope !== "global") return undefined;

  const rows = await Ticket.aggregate<{ _id: string; label: string; count: number }>([
    {
      $match: and(scopeTicketFilter(scope), {
        status: ACTIVE,
        "ai.incident.status": "detected",
      }),
    },
    {
      $group: {
        _id: "$ai.incident.groupId",
        label: { $first: "$ai.incident.label" },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  const top = rows[0];
  if (!top || top.count < 2) return undefined;
  return { groupId: top._id, label: top.label, ticketCount: top.count };
}

// ── Disponibilidad del equipo (spec §7.2.2) ───────────────────

export async function availabilityFor(scope: ResolvedScope): Promise<AvailabilityEntry[]> {
  const filter: Filter = { status: "active" };
  if (scope.scope !== "global") filter["areaId"] = oid(scope.areaId!);

  const members = await User.find(filter)
    .select("name avatarUrl areaId availability")
    .sort({ name: 1 })
    .lean();
  if (!members.length) return [];

  const [areas, load] = await Promise.all([
    Area.find({ _id: { $in: [...new Set(members.map((member) => String(member.areaId)))] } })
      .select("name")
      .lean(),
    Ticket.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { assigneeIds: { $in: members.map((member) => member._id) }, status: ACTIVE } },
      { $unwind: "$assigneeIds" },
      { $group: { _id: "$assigneeIds", count: { $sum: 1 } } },
    ]),
  ]);

  const areaNames = new Map(areas.map((area) => [String(area._id), area.name ?? "Área"]));
  const openByUser = new Map(load.map((row) => [String(row._id), row.count]));

  const items: AvailabilityEntry[] = members.map((member) => ({
    id: String(member._id),
    name: member.name!,
    ...(member.avatarUrl ? { avatarUrl: member.avatarUrl } : {}),
    areaId: String(member.areaId),
    areaName: areaNames.get(String(member.areaId)) ?? "Área",
    availability: {
      state: (member.availability?.state ?? "available") as "available" | "away",
      ...(member.availability?.reason ? { reason: member.availability.reason } : {}),
      ...(member.availability?.awayUntil
        ? { awayUntil: member.availability.awayUntil.toISOString() }
        : {}),
    },
    openTickets: openByUser.get(String(member._id)) ?? 0,
  }));

  // Quien está ausente va primero: es la información por la que se mira el panel.
  return items.sort((a, b) => {
    const away = Number(b.availability.state === "away") - Number(a.availability.state === "away");
    return away !== 0 ? away : a.name.localeCompare(b.name, "es");
  });
}

// ── Series para las gráficas de Reportes (spec §7.8) ──────────

export async function timeseriesFor(
  scope: ResolvedScope,
  range: StatsRange,
): Promise<{ bucket: ReturnType<typeof bucketFor>; points: TimeseriesPoint[] }> {
  const base = scopeTicketFilter(scope);
  const window = windowOf(range);
  const bucket = bucketFor(range);
  const settings = await getSettings();
  const timezone = settings.businessHours.timezone;

  // `$dateTrunc` agrupa en la zona de la empresa: truncando en UTC, los tickets de
  // la tarde caerían en el día siguiente y la gráfica mentiría por unas horas.
  const seriesOf = (dateField: string) =>
    Ticket.aggregate<{ _id: Date; count: number }>([
      { $match: and(base, { [dateField]: { $gte: window.from, $lt: window.to } }) },
      {
        $group: {
          _id: { $dateTrunc: { date: `$${dateField}`, unit: bucket, timezone } },
          count: { $sum: 1 },
        },
      },
    ]);

  const [created, resolved] = await Promise.all([
    seriesOf("createdAt"),
    seriesOf("sla.resolvedAt"),
  ]);

  const byDate = new Map<string, TimeseriesPoint>();
  const keyOf = (date: Date): string => date.toISOString().slice(0, 10);
  for (const row of created) {
    const key = keyOf(row._id);
    byDate.set(key, { date: key, created: row.count, resolved: 0 });
  }
  for (const row of resolved) {
    const key = keyOf(row._id);
    const point = byDate.get(key) ?? { date: key, created: 0, resolved: 0 };
    point.resolved = row.count;
    byDate.set(key, point);
  }

  return { bucket, points: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

export async function byPersonFor(scope: ResolvedScope, range: StatsRange): Promise<PersonRow[]> {
  const base = scopeTicketFilter(scope);
  const window = windowOf(range);
  const calendar = await getCalendar();

  const memberFilter: Filter = { status: "active" };
  if (scope.scope !== "global") memberFilter["areaId"] = oid(scope.areaId!);
  const members = await User.find(memberFilter).select("name").sort({ name: 1 }).lean();
  if (!members.length) return [];

  const memberIds = members.map((member) => member._id);

  const [resolvedRows, samples] = await Promise.all([
    // Un ticket resuelto cuenta para CADA responsable en el momento de resolverlo,
    // así que la suma por persona puede pasar del total del área (spec §9).
    Ticket.aggregate<{
      _id: Types.ObjectId;
      resolved: number;
      csatSum: number;
      csatCount: number;
    }>([
      {
        $match: and(base, {
          "sla.resolvedByIds": { $in: memberIds },
          "sla.resolvedAt": { $gte: window.from, $lt: window.to },
        }),
      },
      { $unwind: "$sla.resolvedByIds" },
      {
        $group: {
          _id: "$sla.resolvedByIds",
          resolved: { $sum: 1 },
          csatSum: { $sum: { $ifNull: ["$csat.rating", 0] } },
          csatCount: { $sum: { $cond: [{ $ifNull: ["$csat.rating", false] }, 1, 0] } },
        },
      },
    ]),
    responseSamples(base, range, calendar),
  ]);

  const resolvedByUser = new Map(resolvedRows.map((row) => [String(row._id), row]));
  const hoursByUser = new Map<string, number[]>();
  for (const sample of samples) {
    if (!sample.responderId) continue;
    const list = hoursByUser.get(sample.responderId) ?? [];
    list.push(sample.hours);
    hoursByUser.set(sample.responderId, list);
  }

  // Quien no resolvió ni respondió nada en el período no aparece en la gráfica:
  // una barra a cero por cada persona del área la haría ilegible.
  return members
    .map((member) => {
      const id = String(member._id);
      const row = resolvedByUser.get(id);
      return {
        userId: id,
        name: member.name!,
        resolved: row?.resolved ?? 0,
        firstResponseHours: round(average(hoursByUser.get(id) ?? [])),
        csatAverage: row?.csatCount ? round(row.csatSum / row.csatCount) : null,
      };
    })
    .filter((row) => row.resolved > 0 || row.firstResponseHours !== null);
}

export async function byCategoryFor(
  scope: ResolvedScope,
  range: StatsRange,
): Promise<CategoryRow[]> {
  const base = scopeTicketFilter(scope);
  const window = windowOf(range);

  const rows = await Ticket.aggregate<{ _id: Types.ObjectId | null; count: number }>([
    { $match: and(base, { createdAt: { $gte: window.from, $lt: window.to } }) },
    { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  if (!rows.length) return [];

  // Las categorías están embebidas en las áreas, así que el nombre se resuelve
  // recorriendo las áreas implicadas; no hay colección que se pueda unir.
  const areaFilter: Filter = scope.scope === "global" ? {} : { _id: oid(scope.areaId!) };
  const areas = await Area.find(areaFilter).select("categories").lean();
  const names = new Map<string, string>();
  for (const area of areas) {
    for (const category of area.categories ?? []) {
      names.set(String(category._id), category.name ?? "Categoría");
    }
  }

  return rows.map((row) => ({
    ...(row._id ? { categoryId: String(row._id) } : {}),
    name: row._id ? (names.get(String(row._id)) ?? "Categoría retirada") : "Sin clasificar",
    count: row.count,
  }));
}
