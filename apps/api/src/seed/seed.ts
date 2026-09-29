import {
  computeSlaTargets,
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_SETTINGS,
  formatTicketNumber,
  slaStateAt,
  TICKET_STATUSES,
  type BusinessCalendar,
  type MessageType,
  type Priority,
  type SlaPolicy,
  type SlaState,
  type TicketStatus,
} from "@tekzaya/shared";
import bcrypt from "bcryptjs";
import mongoose, { Types } from "mongoose";
import { env } from "../config/env";
import { Area } from "../models/area.model";
import { Counter } from "../models/counter.model";
import { Message } from "../models/message.model";
import { AvailabilityLog, Notification, Settings, SETTINGS_ID } from "../models/support.models";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { AREAS, INCIDENT_TICKETS, TICKET_TEMPLATES, USERS } from "./catalog";

/** Contraseña común de los datos de demostración. Cambiar antes de cualquier uso real. */
const DEMO_PASSWORD = "Tekzaya2026!";
const TOTAL_TICKETS = 100;
const DAYS_OF_HISTORY = 90;

/** Generador con semilla fija: dos ejecuciones producen exactamente los mismos datos. */
function createRandom(seed: number) {
  let state = seed;
  return function random(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(20260929);
const now = new Date();

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}

function pickWeighted<T extends string>(weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let threshold = random() * total;
  for (const [value, weight] of entries) {
    threshold -= weight;
    if (threshold <= 0) return value;
  }
  return entries[0]![0];
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

interface SeededCategory {
  _id: Types.ObjectId;
  name: string;
  isActive: boolean;
}

interface SeededArea {
  _id: Types.ObjectId;
  name: string;
  description: string;
  color: string;
  isActive: boolean;
  categories: SeededCategory[];
}

interface SeededUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  areaId: Types.ObjectId;
  role: "employee" | "admin";
  isAreaSupervisor: boolean;
  hasGlobalReadAccess: boolean;
  status: "active";
  availability: {
    state: "available" | "away";
    reason?: string;
    awayUntil?: Date;
  };
  lastLoginAt: Date;
}

interface SeededMessage {
  ticketId: Types.ObjectId;
  authorId: Types.ObjectId;
  type: MessageType;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

interface BuiltTicket {
  doc: Record<string, unknown>;
  id: Types.ObjectId;
  messages: SeededMessage[];
}

/** Busca un momento de creación tal que el SLA esté HOY en el estado pedido. */
function createdAtForState(
  target: SlaState,
  policy: SlaPolicy,
  calendar: BusinessCalendar,
): Date | null {
  for (let minutesAgo = 20; minutesAgo <= 60 * 24 * 12; minutesAgo += 20) {
    const candidate = new Date(now.getTime() - minutesAgo * 60_000);
    const targets = computeSlaTargets(candidate, policy.resolutionMinutes, calendar);
    if (slaStateAt(now, targets) === target) return candidate;
  }
  return null;
}

async function main(): Promise<void> {
  console.log(`Conectando a ${env.MONGODB_URI}`);
  await mongoose.connect(env.MONGODB_URI);

  console.log("Limpiando colecciones…");
  await Promise.all([
    Area.deleteMany({}),
    User.deleteMany({}),
    Ticket.deleteMany({}),
    Message.deleteMany({}),
    Notification.deleteMany({}),
    AvailabilityLog.deleteMany({}),
    Settings.deleteMany({}),
    Counter.deleteMany({}),
  ]);

  // ── Ajustes ────────────────────────────────────────────────
  const businessHours = { ...DEFAULT_BUSINESS_HOURS, timezone: env.COMPANY_TIMEZONE };
  await Settings.create({ ...DEFAULT_SETTINGS, _id: SETTINGS_ID, businessHours });
  const calendar: BusinessCalendar = { hours: businessHours, holidays: [] };
  const policies = DEFAULT_SETTINGS.slaPolicies;

  // ── Áreas ──────────────────────────────────────────────────
  const areas: SeededArea[] = AREAS.map((area) => ({
    _id: new Types.ObjectId(),
    name: area.name,
    description: area.description,
    color: area.color,
    isActive: true,
    categories: area.categories.map((name) => ({
      _id: new Types.ObjectId(),
      name,
      isActive: true,
    })),
  }));
  await Area.insertMany(areas);
  const areaByName = new Map(areas.map((area) => [area.name, area]));

  // ── Usuarios ───────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users: SeededUser[] = USERS.map((seedUser) => {
    const area = areaByName.get(seedUser.areaName)!;
    const away = seedUser.away;
    return {
      _id: new Types.ObjectId(),
      name: seedUser.name,
      email: seedUser.email,
      passwordHash,
      areaId: area._id,
      role: seedUser.role,
      isAreaSupervisor: seedUser.isAreaSupervisor ?? false,
      hasGlobalReadAccess: seedUser.hasGlobalReadAccess ?? false,
      status: "active" as const,
      availability: away
        ? {
            state: "away" as const,
            reason: away.reason,
            awayUntil: new Date(now.getTime() + away.days * 86_400_000),
          }
        : { state: "available" as const },
      lastLoginAt: new Date(now.getTime() - randomInt(1, 72) * 3_600_000),
    };
  });
  await User.insertMany(users);

  const membersByArea = new Map<string, SeededUser[]>();
  for (const user of users) {
    const key = String(user.areaId);
    membersByArea.set(key, [...(membersByArea.get(key) ?? []), user]);
  }

  await AvailabilityLog.insertMany(
    users
      .filter((user) => user.availability.state === "away")
      .map((user) => ({
        userId: user._id,
        state: "away",
        reason: user.availability.reason,
        from: new Date(now.getTime() - 2 * 86_400_000),
        changedById: user._id,
      })),
  );

  // ── Tickets ────────────────────────────────────────────────
  const built: BuiltTicket[] = [];
  let sequence = 0;

  function buildTicket(options: {
    createdAt: Date;
    status: TicketStatus;
    priority?: Priority;
    template?: (typeof TICKET_TEMPLATES)[number];
    titleOverride?: string;
    incidentGroup?: string;
  }): BuiltTicket {
    const template = options.template ?? pick(TICKET_TEMPLATES);
    const area = areaByName.get(template.areaName)!;
    const areaMembers = membersByArea.get(String(area._id)) ?? [];
    const priority = options.priority ?? template.priority;
    const policy = policies[priority];
    const { createdAt, status } = options;

    // El solicitante suele ser de otra área: pide ayuda al área que corresponde.
    const outsiders = users.filter((user) => !user.areaId.equals(area._id));
    const requester = random() < 0.75 ? pick(outsiders) : pick(areaMembers);
    const category = area.categories.find((c) => c.name === template.category);

    const response = computeSlaTargets(createdAt, policy.responseMinutes, calendar);
    const resolution = computeSlaTargets(createdAt, policy.resolutionMinutes, calendar);

    const assignees: SeededUser[] = [];
    if (status !== "open") {
      const candidates = areaMembers.filter((member) => !member._id.equals(requester._id));
      if (candidates.length) assignees.push(pick(candidates));
      // Algunos tickets se trabajan entre dos personas (spec §7.5).
      if (assignees.length && random() < 0.2) {
        const second = pick(candidates);
        if (!assignees.some((a) => a._id.equals(second._id))) assignees.push(second);
      }
    }

    const hasResponse = status !== "open" && status !== "assigned";
    // Un 15 % incumple el plazo de respuesta: la demo necesita rojos reales.
    const respondsLate = random() < 0.15;
    const firstResponseAt =
      hasResponse && assignees.length
        ? new Date(
            respondsLate
              ? response.dueAt.getTime() + randomInt(20, 180) * 60_000
              : createdAt.getTime() +
                randomInt(5, Math.max(6, policy.responseMinutes - 2)) * 60_000,
          )
        : undefined;

    const isResolved = status === "resolved" || status === "closed";
    const resolvesLate = random() < 0.12;
    const resolvedAt =
      isResolved && firstResponseAt
        ? new Date(
            resolvesLate
              ? resolution.dueAt.getTime() + randomInt(60, 600) * 60_000
              : firstResponseAt.getTime() + randomInt(30, 400) * 60_000,
          )
        : undefined;

    const closedAt =
      status === "closed" && resolvedAt ? new Date(resolvedAt.getTime() + 86_400_000) : undefined;

    const id = new Types.ObjectId();
    sequence += 1;

    const statusHistory: { status: TicketStatus; at: Date }[] = [{ status: "open", at: createdAt }];
    if (assignees.length) {
      statusHistory.push({ status: "assigned", at: new Date(createdAt.getTime() + 600_000) });
    }
    if (firstResponseAt) statusHistory.push({ status: "in_progress", at: firstResponseAt });
    if (resolvedAt) statusHistory.push({ status: "resolved", at: resolvedAt });
    if (closedAt) statusHistory.push({ status: "closed", at: closedAt });
    if (status === "cancelled") {
      statusHistory.push({ status: "cancelled", at: new Date(createdAt.getTime() + 3_600_000) });
    }
    if (status === "reopened") {
      statusHistory.push({ status: "reopened", at: resolvedAt ?? createdAt });
    }

    // ── Conversación ────────────────────────────────────────
    const messages: SeededMessage[] = [
      {
        ticketId: id,
        authorId: requester._id,
        type: "public",
        body: template.description,
        createdAt,
        updatedAt: createdAt,
      },
    ];

    const owner = assignees[0];
    if (firstResponseAt && owner && template.replies[0]) {
      messages.push({
        ticketId: id,
        authorId: owner._id,
        type: "public",
        body: template.replies[0],
        createdAt: firstResponseAt,
        updatedAt: firstResponseAt,
      });
    }
    if (template.internalNotes?.[0] && owner && random() < 0.6) {
      const at = new Date((firstResponseAt ?? createdAt).getTime() + 900_000);
      messages.push({
        ticketId: id,
        authorId: owner._id,
        type: "internal",
        body: template.internalNotes[0],
        createdAt: at,
        updatedAt: at,
      });
    }
    if (resolvedAt && owner && template.replies[1]) {
      messages.push({
        ticketId: id,
        authorId: owner._id,
        type: "public",
        body: template.replies[1],
        createdAt: resolvedAt,
        updatedAt: resolvedAt,
      });
    }

    const lastActivityAt = new Date(
      Math.max(...messages.map((message) => message.createdAt.getTime())),
    );
    const answeredCsat = status === "closed" && closedAt !== undefined && random() < 0.65;

    const doc: Record<string, unknown> = {
      _id: id,
      number: sequence,
      title: options.titleOverride ?? template.title,
      description: template.description,
      requesterId: requester._id,
      createdById: requester._id,
      areaId: area._id,
      categoryId: category?._id,
      assigneeIds: assignees.map((a) => a._id),
      status,
      priority,
      ai: {
        suggestedAreaId: area._id,
        areaConfidence: Number((0.72 + random() * 0.27).toFixed(2)),
        suggestedPriority: priority,
        suggestedCategoryId: category?._id,
        classificationStatus: "done",
        ...(options.incidentGroup
          ? {
              incident: {
                groupId: options.incidentGroup,
                label: "Caída de red en Ventas",
                confidence: 0.86,
                status: "detected",
              },
            }
          : {}),
      },
      sla: {
        responseDueAt: response.dueAt,
        responseRiskAt: response.riskAt,
        resolutionDueAt: resolution.dueAt,
        resolutionRiskAt: resolution.riskAt,
        firstResponseAt,
        firstResponderId: firstResponseAt ? owner?._id : undefined,
        resolvedAt,
        resolvedByIds: resolvedAt ? assignees.map((a) => a._id) : [],
        closedAt,
        onHoldSince: status === "on_hold" ? new Date(now.getTime() - 6 * 3_600_000) : undefined,
        pausedMs: 0,
        responseBreached: firstResponseAt ? firstResponseAt > response.dueAt : false,
        resolutionBreached: resolvedAt ? resolvedAt > resolution.dueAt : false,
      },
      ...(answeredCsat
        ? {
            csat: {
              rating: Number(pickWeighted({ "5": 45, "4": 30, "3": 15, "2": 7, "1": 3 })),
              answeredAt: new Date(closedAt.getTime() + 3_600_000),
            },
          }
        : {}),
      attachmentsCount: 0,
      lastActivityAt,
      lastPublicReplyAt: firstResponseAt,
      stats: {
        reopenCount: status === "reopened" ? 1 : 0,
        transferCount: 0,
        publicMessageCount: messages.filter((m) => m.type === "public").length,
        internalMessageCount: messages.filter((m) => m.type === "internal").length,
        priorityChangedByHuman: false,
        joinRequestCount: 0,
      },
      statusHistory,
      assigneeHistory: assignees.map((a) => ({ userId: a._id, from: createdAt })),
      createdAt,
      updatedAt: lastActivityAt,
    };

    const result: BuiltTicket = { doc, id, messages };
    built.push(result);
    return result;
  }

  // La antigüedad se deriva del estado y de la prioridad, no de un rango fijo: un
  // ticket urgente vence en 4 h, así que "lleva dos días abierto" ya significa
  // vencido. Para los tickets vivos se busca la fecha que produce el estado de SLA
  // deseado, de modo que el tablero muestre una mezcla creíble y no todo en rojo.
  const FINAL_AGE_HOURS: Record<string, [number, number]> = {
    resolved: [48, 20 * 24],
    closed: [10 * 24, DAYS_OF_HISTORY * 24],
    cancelled: [10 * 24, DAYS_OF_HISTORY * 24],
  };

  for (let i = 0; i < TOTAL_TICKETS - 12; i++) {
    const status = pickWeighted<TicketStatus>({
      closed: 40,
      resolved: 22,
      cancelled: 4,
      in_progress: 12,
      open: 8,
      assigned: 6,
      on_hold: 5,
      reopened: 3,
    });
    const template = pick(TICKET_TEMPLATES);
    const policy = policies[template.priority];

    let createdAt: Date;
    if (status === "open" || status === "assigned") {
      // Sin primera respuesta todavía: el reloj de respuesta manda y es corto.
      createdAt = new Date(now.getTime() - randomInt(5, 120) * 60_000);
    } else if (status in FINAL_AGE_HOURS) {
      const [minHours, maxHours] = FINAL_AGE_HOURS[status]!;
      createdAt = new Date(now.getTime() - randomInt(minHours, maxHours) * 3_600_000);
    } else {
      const target = pickWeighted<SlaState>({ on_time: 60, at_risk: 25, breached: 15 });
      createdAt =
        createdAtForState(target, policy, calendar) ??
        new Date(now.getTime() - randomInt(2, 10) * 3_600_000);
    }

    buildTicket({ createdAt, status, template });
  }

  // El reparto aleatorio puede dejar algún estado sin representar; la demo los
  // necesita todos (spec §5.2). "merged" se crea aparte, con su ticket principal.
  const presentStatuses = new Set(built.map((ticket) => ticket.doc["status"] as TicketStatus));
  for (const status of TICKET_STATUSES) {
    if (status === "merged" || presentStatuses.has(status)) continue;
    buildTicket({
      createdAt: new Date(now.getTime() - randomInt(4, 100) * 3_600_000),
      status,
    });
  }

  // Tickets vivos en cada estado de SLA, para que el tablero no salga plano.
  for (const [state, count] of [
    ["at_risk", 4],
    ["breached", 3],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const priority = pick<Priority>(["high", "medium", "low"]);
      const createdAt = createdAtForState(state, policies[priority], calendar);
      if (createdAt) {
        buildTicket({
          createdAt,
          status: pick<TicketStatus>(["assigned", "in_progress"]),
          priority,
        });
      }
    }
  }

  // Incidente: tres tickets del mismo síntoma dentro de 48 h (spec §6.2, IA-5).
  const incidentGroup = `inc-${now.getTime()}`;
  const wifiTemplate = TICKET_TEMPLATES.find((t) => t.title.includes("wifi en el segundo piso"))!;
  for (const [index, title] of INCIDENT_TICKETS.entries()) {
    buildTicket({
      createdAt: new Date(now.getTime() - (30 - index * 9) * 3_600_000),
      status: index === 0 ? "in_progress" : "open",
      template: wifiTemplate,
      titleOverride: title,
      incidentGroup,
    });
  }

  // Fusión de duplicados: dos tickets absorbidos por un principal (spec §7.5.1).
  const principal = buildTicket({
    createdAt: new Date(now.getTime() - 40 * 3_600_000),
    status: "in_progress",
    template: wifiTemplate,
    titleOverride: "Caída general de red en el edificio",
  });
  const duplicates = [0, 1].map((offset) =>
    buildTicket({
      createdAt: new Date(now.getTime() - (38 - offset * 3) * 3_600_000),
      status: "merged",
      template: wifiTemplate,
      titleOverride: offset === 0 ? "No carga ninguna página web" : "Internet caído en mi piso",
    }),
  );
  for (const duplicate of duplicates) {
    duplicate.doc["mergedIntoId"] = principal.id;
    duplicate.doc["mergedAt"] = new Date(now.getTime() - 20 * 3_600_000);
  }
  principal.doc["mergedTicketIds"] = duplicates.map((d) => d.id);
  principal.doc["additionalRequesterIds"] = duplicates.map((d) => d.doc["requesterId"]);

  await Ticket.insertMany(built.map((ticket) => ticket.doc));
  await Message.insertMany(built.flatMap((ticket) => ticket.messages));
  await Counter.create({ _id: "ticket", seq: sequence });

  // ── Resumen ────────────────────────────────────────────────
  const byStatus = await Ticket.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log("\nDatos semilla creados:");
  console.log(`  ${areas.length} áreas · ${users.length} usuarios · ${built.length} tickets`);
  console.log(`  Último ticket: ${formatTicketNumber(sequence)}`);
  console.log(`  Zona horaria de la empresa: ${businessHours.timezone}`);

  console.log("\n  Tickets por estado:");
  for (const row of byStatus) console.log(`    ${row._id.padEnd(14)} ${row.count}`);

  console.log(`\n  Contraseña de todas las cuentas: ${DEMO_PASSWORD}`);
  console.log("  Cuentas destacadas:");
  console.log("    arisleyda.tejada@tekzaya.com   administradora (IT y Sistemas)");
  console.log("    daury.guzman@tekzaya.com       supervisor de área (IT y Sistemas)");
  console.log("    elena.paredes@tekzaya.com      supervisora de RRHH, lectura global");
  console.log("    luis.fernandez@tekzaya.com     empleado");

  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error("La semilla falló:", error);
  process.exit(1);
});
