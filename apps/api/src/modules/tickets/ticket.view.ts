import {
  canAnswerCsat,
  canCancel,
  canChangeCategory,
  canChangePriority,
  canChangeStatus,
  canManageAssignees,
  canMerge,
  canReadInternalNotes,
  canRequestJoin,
  canReplyPublicly,
  canSelfAssign,
  canTransfer,
  canUnmerge,
  canWriteInternalNote,
  businessDaysAfter,
  slaStateAt,
  type Actor,
  type Attachment,
  type BusinessCalendar,
  type MergedTicketRef,
  type MessageView,
  type SlaState,
  type TicketDetail,
  type TicketListItem,
  type TicketStatus,
  type UserSummary,
} from "@tekzaya/shared";
import { Area } from "../../models/area.model";
import { Attachment as AttachmentModel } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { maintenanceOfTicket } from "../assets/asset.ticket";
import { getSettings } from "../settings/settings.service";
import { refOf, type LeanTicket } from "./ticket.access";

/** Estados en los que el ticket ya no admite fusiones (spec §7.5.1). */
const FINAL: readonly TicketStatus[] = ["resolved", "closed", "cancelled", "merged"];

/** Catálogos resueltos de una tacada para toda la página de resultados. */
export interface Hydration {
  users: Map<string, UserSummary>;
  areas: Map<string, { id: string; name: string; color: string }>;
  categories: Map<string, string>;
  /**
   * La jornada y el plazo de abandono, leídos una vez por página. Son ajustes
   * de la empresa, no del ticket, pero la fila los necesita para decir cuándo
   * se cierra solo un ticket en espera, y van aquí por el mismo motivo que los
   * nombres y los colores: para no consultarlos una vez por fila.
   */
  calendar: BusinessCalendar;
  onHoldAutoCloseDays: number;
}

const UNKNOWN_USER = (id: string): UserSummary => ({
  id,
  name: "Usuario dado de baja",
  areaId: id,
  availability: { state: "available" },
});

function summaryOf(user: Record<string, any>): UserSummary {
  return {
    id: String(user["_id"]),
    name: user["name"] as string,
    areaId: String(user["areaId"]),
    availability: {
      state: (user["availability"]?.state ?? "available") as "available" | "away",
      ...(user["availability"]?.reason ? { reason: user["availability"].reason } : {}),
      ...(user["availability"]?.awayUntil
        ? { awayUntil: (user["availability"].awayUntil as Date).toISOString() }
        : {}),
    },
    ...(user["avatarUrl"] ? { avatarUrl: user["avatarUrl"] as string } : {}),
  };
}

function collectUserIds(ticket: LeanTicket, into: Set<string>): void {
  into.add(String(ticket["requesterId"]));
  into.add(String(ticket["createdById"]));
  for (const id of (ticket["assigneeIds"] as unknown[] | undefined) ?? []) into.add(String(id));
  for (const id of (ticket["additionalRequesterIds"] as unknown[] | undefined) ?? []) {
    into.add(String(id));
  }
  for (const entry of (ticket["statusHistory"] as { byId?: unknown }[] | undefined) ?? []) {
    if (entry.byId) into.add(String(entry.byId));
  }
}

/**
 * Dos consultas para toda la página, en vez de una por fila: el listado devuelve
 * nombres y colores ya resueltos, que es lo que la tabla necesita pintar.
 */
export async function hydrate(tickets: LeanTicket[]): Promise<Hydration> {
  const userIds = new Set<string>();
  const areaIds = new Set<string>();
  for (const ticket of tickets) {
    collectUserIds(ticket, userIds);
    areaIds.add(String(ticket["areaId"]));
  }

  const [users, areas, settings] = await Promise.all([
    User.find({ _id: { $in: [...userIds] } })
      .select("name avatarUrl areaId availability")
      .lean(),
    Area.find({ _id: { $in: [...areaIds] } })
      .select("name color categories")
      .lean(),
    getSettings(),
  ]);

  const hydration: Hydration = {
    users: new Map(),
    areas: new Map(),
    categories: new Map(),
    calendar: { hours: settings.businessHours, holidays: settings.holidays },
    onHoldAutoCloseDays: settings.onHoldAutoCloseDays,
  };
  for (const user of users) hydration.users.set(String(user._id), summaryOf(user));
  for (const area of areas) {
    hydration.areas.set(String(area._id), {
      id: String(area._id),
      name: area.name ?? "Área",
      color: area.color ?? "#7C8CAE",
    });
    for (const category of area.categories ?? []) {
      hydration.categories.set(String(category._id), category.name ?? "");
    }
  }
  return hydration;
}

function userOf(h: Hydration, id: unknown): UserSummary {
  const key = String(id);
  return h.users.get(key) ?? UNKNOWN_USER(key);
}

/**
 * Instante en que el ticket dejó de consumir SLA. Sin él, un ticket cancelado
 * seguiría "venciendo" cada vez que alguien abre la lista.
 */
export function settledAt(ticket: LeanTicket): Date | undefined {
  const sla = ticket["sla"] ?? {};
  if (sla.resolvedAt) return sla.resolvedAt as Date;
  if (sla.closedAt) return sla.closedAt as Date;
  const status = ticket["status"] as TicketStatus;
  if (status === "cancelled" || status === "merged") {
    const history = (ticket["statusHistory"] as { status: string; at: Date }[] | undefined) ?? [];
    return [...history].reverse().find((entry) => entry.status === status)?.at;
  }
  return undefined;
}

export function slaStatesOf(ticket: LeanTicket, now = new Date()): {
  response: SlaState;
  resolution: SlaState;
} {
  const sla = ticket["sla"] ?? {};
  const settled = settledAt(ticket);
  return {
    response: slaStateAt(now, {
      dueAt: sla.responseDueAt as Date,
      riskAt: sla.responseRiskAt as Date,
      completedAt: (sla.firstResponseAt as Date | undefined) ?? settled,
    }),
    resolution: slaStateAt(now, {
      dueAt: sla.resolutionDueAt as Date,
      riskAt: sla.resolutionRiskAt as Date,
      completedAt: settled,
    }),
  };
}

/**
 * La espera del solicitante, si el ticket está parado ahora mismo: desde cuándo
 * y hasta cuándo. El "hasta" es el mismo umbral que dispara el cierre automático
 * en `runLifecycleJobs`, calculado con el mismo calendario y los mismos días,
 * para que lo que se enseña y lo que ocurre no puedan discrepar.
 *
 * Solo lo recibe quien atiende el ticket: al solicitante no se le enseña una
 * cuenta atrás para que su propio ticket se cierre. Ya se le avisa con el
 * recordatorio de los `onHoldReminderDays`, que es el aviso que le toca.
 */
function requesterWaitOf(
  ticket: LeanTicket,
  h: Hydration,
  actor?: Actor,
): { onHoldSince?: string; requesterWaitDueAt?: string } {
  if (ticket["status"] !== "on_hold") return {};
  const since = ticket["sla"]?.onHoldSince as Date | undefined;
  if (!since) return {};
  if (!actor || !canReadInternalNotes(actor, refOf(ticket))) return {};

  const dueAt = businessDaysAfter(since, h.onHoldAutoCloseDays, h.calendar);
  return {
    onHoldSince: since.toISOString(),
    ...(dueAt ? { requesterWaitDueAt: dueAt.toISOString() } : {}),
  };
}

/** La etiqueta de incidente es información del área, no del solicitante. */
function incidentLabelFor(ticket: LeanTicket, actor?: Actor): string | undefined {
  const incident = ticket["ai"]?.incident;
  if (!incident?.label || incident.status === "dismissed") return undefined;
  if (!actor || !canReadInternalNotes(actor, refOf(ticket))) return undefined;
  return incident.label as string;
}

export function toListItem(ticket: LeanTicket, h: Hydration, actor?: Actor): TicketListItem {
  const area = h.areas.get(String(ticket["areaId"])) ?? {
    id: String(ticket["areaId"]),
    name: "Área",
    color: "#7C8CAE",
  };
  const states = slaStatesOf(ticket);
  const categoryId = ticket["categoryId"] ? String(ticket["categoryId"]) : undefined;

  return {
    id: String(ticket["_id"]),
    number: ticket["number"] as number,
    title: ticket["title"] as string,
    status: ticket["status"] as TicketStatus,
    priority: ticket["priority"],
    area,
    ...(categoryId ? { categoryId } : {}),
    ...(categoryId && h.categories.get(categoryId)
      ? { categoryName: h.categories.get(categoryId)! }
      : {}),
    requester: userOf(h, ticket["requesterId"]),
    assignees: ((ticket["assigneeIds"] as unknown[] | undefined) ?? []).map((id) => userOf(h, id)),
    responseState: states.response,
    resolutionState: states.resolution,
    responseDueAt: (ticket["sla"].responseDueAt as Date).toISOString(),
    resolutionDueAt: (ticket["sla"].resolutionDueAt as Date).toISOString(),
    ...(ticket["sla"].firstResponseAt
      ? { firstResponseAt: (ticket["sla"].firstResponseAt as Date).toISOString() }
      : {}),
    ...requesterWaitOf(ticket, h, actor),
    attachmentsCount: (ticket["attachmentsCount"] as number | undefined) ?? 0,
    ...(incidentLabelFor(ticket, actor) ? { incidentLabel: incidentLabelFor(ticket, actor)! } : {}),
    createdAt: (ticket["createdAt"] as Date).toISOString(),
    lastActivityAt: (ticket["lastActivityAt"] as Date).toISOString(),
  };
}

function permissionsOf(
  actor: Actor,
  ticket: LeanTicket,
): Omit<TicketDetail["permissions"], "linkAsset" | "createWorkOrder"> {
  const ref = refOf(ticket);
  return {
    viewInternalNotes: canReadInternalNotes(actor, ref),
    replyPublicly: canReplyPublicly(actor, ref),
    writeInternalNote: canWriteInternalNote(actor, ref),
    changeStatus: canChangeStatus(actor, ref),
    changeCategory: canChangeCategory(actor, ref),
    changePriority: canChangePriority(actor, ref),
    manageAssignees: canManageAssignees(actor, ref),
    selfAssign: canSelfAssign(actor, ref),
    cancel: canCancel(actor, ref),
    transfer: canTransfer(actor, ref),
    // Fusionar exige dos tickets; aquí solo se sabe del principal, así que se
    // comprueba contra sí mismo: quien no pase este filtro no pasará ninguno.
    merge: canMerge(actor, ref, ref) && !FINAL.includes(ref.status),
    unmerge: canUnmerge(actor, ref),
    requestJoin: canRequestJoin(actor, ref),
    // Una sola respuesta por ticket: con la encuesta ya contestada, el banner no
    // vuelve a ofrecerse aunque el ticket siga resuelto (spec §7.6).
    answerCsat: canAnswerCsat(actor, ref) && !ticket["csat"]?.rating,
  };
}

export async function toDetail(
  ticket: LeanTicket,
  h: Hydration,
  actor: Actor,
): Promise<TicketDetail> {
  const base = toListItem(ticket, h, actor);
  const sla = ticket["sla"] ?? {};
  // El equipo afectado y sus OT (plan A2) traen sus propios dos permisos.
  const { linkAsset, createWorkOrder, ...maintenance } = await maintenanceOfTicket(ticket, actor);
  const permissions = { ...permissionsOf(actor, ticket), linkAsset, createWorkOrder };

  // Los tickets enlazados se resuelven aquí y no en el listado: solo el detalle
  // muestra "fusionado con TK-…".
  const linkedIds = [
    ...((ticket["mergedTicketIds"] as unknown[] | undefined) ?? []),
    ...(ticket["mergedIntoId"] ? [ticket["mergedIntoId"]] : []),
  ];
  const linked = linkedIds.length
    ? await Ticket.find({ _id: { $in: linkedIds } })
        .select("number title description status requesterId createdAt mergedAt")
        .lean()
    : [];
  const linkedById = new Map(linked.map((t) => [String(t._id), t]));
  const parent = ticket["mergedIntoId"]
    ? linkedById.get(String(ticket["mergedIntoId"]))
    : undefined;

  // El nombre del solicitante del otro extremo no está en la hidratación de este
  // ticket, pero es justo lo que hace útil la ficha del duplicado.
  const linkedRequesters = await User.find({
    _id: { $in: linked.map((t) => t.requesterId).filter(Boolean) },
  })
    .select("name")
    .lean();
  const linkedNameById = new Map(linkedRequesters.map((u) => [String(u._id), u.name ?? ""]));

  const mergedRefOf = (t: (typeof linked)[number]): MergedTicketRef => ({
    id: String(t._id),
    number: t.number!,
    title: t.title!,
    ...(t.description ? { description: t.description } : {}),
    ...(t.status ? { status: t.status as TicketStatus } : {}),
    ...(linkedNameById.get(String(t.requesterId))
      ? { requesterName: linkedNameById.get(String(t.requesterId))! }
      : {}),
    ...(t.createdAt ? { createdAt: (t.createdAt as Date).toISOString() } : {}),
    ...(t.mergedAt ? { mergedAt: (t.mergedAt as Date).toISOString() } : {}),
  });

  return {
    ...base,
    description: ticket["description"] as string,
    createdBy: userOf(h, ticket["createdById"]),
    additionalRequesters: ((ticket["additionalRequesterIds"] as unknown[] | undefined) ?? []).map(
      (id) => userOf(h, id),
    ),
    sla: {
      responseDueAt: (sla.responseDueAt as Date).toISOString(),
      resolutionDueAt: (sla.resolutionDueAt as Date).toISOString(),
      ...(sla.firstResponseAt
        ? { firstResponseAt: (sla.firstResponseAt as Date).toISOString() }
        : {}),
      ...(sla.resolvedAt ? { resolvedAt: (sla.resolvedAt as Date).toISOString() } : {}),
      ...(sla.closedAt ? { closedAt: (sla.closedAt as Date).toISOString() } : {}),
      ...(settledAt(ticket) ? { settledAt: settledAt(ticket)!.toISOString() } : {}),
      pausedMs: (sla.pausedMs as number | undefined) ?? 0,
      // Ya los filtró `toListItem` por permiso; aquí solo se copian.
      ...(base.onHoldSince ? { onHoldSince: base.onHoldSince } : {}),
      ...(base.requesterWaitDueAt ? { requesterWaitDueAt: base.requesterWaitDueAt } : {}),
      responseState: base.responseState,
      resolutionState: base.resolutionState,
    },
    // El rastro de la IA (confianza, categoría sugerida, incidente) es material de
    // trabajo del área; el solicitante ve el ticket, no cómo se clasificó.
    ...(permissions.viewInternalNotes && ticket["ai"]
      ? {
          ai: {
            ...(ticket["ai"].suggestedAreaId
              ? { suggestedAreaId: String(ticket["ai"].suggestedAreaId) }
              : {}),
            ...(typeof ticket["ai"].areaConfidence === "number"
              ? { areaConfidence: ticket["ai"].areaConfidence }
              : {}),
            classificationStatus: ticket["ai"].classificationStatus ?? "pending",
            ...(ticket["ai"].summary ? { summary: ticket["ai"].summary } : {}),
            ...(ticket["ai"].summaryUpdatedAt
              ? { summaryUpdatedAt: (ticket["ai"].summaryUpdatedAt as Date).toISOString() }
              : {}),
            ...(ticket["ai"].incident?.groupId
              ? {
                  incident: {
                    groupId: ticket["ai"].incident.groupId,
                    label: ticket["ai"].incident.label ?? "",
                    confidence: ticket["ai"].incident.confidence ?? 0,
                    status: ticket["ai"].incident.status ?? "detected",
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(ticket["csat"]?.rating
      ? {
          csat: {
            rating: ticket["csat"].rating,
            ...(ticket["csat"].comment ? { comment: ticket["csat"].comment } : {}),
            answeredAt: (ticket["csat"].answeredAt as Date).toISOString(),
          },
        }
      : {}),
    ...(parent ? { mergedInto: mergedRefOf(parent) } : {}),
    mergedTickets: ((ticket["mergedTicketIds"] as unknown[] | undefined) ?? [])
      .map((id) => linkedById.get(String(id)))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map(mergedRefOf),
    history: ((ticket["statusHistory"] as { status: TicketStatus; at: Date; byId?: unknown }[]) ?? [])
      .map((entry) => ({
        status: entry.status,
        at: entry.at.toISOString(),
        ...(entry.byId ? { by: userOf(h, entry.byId) } : {}),
      })),
    ...maintenance,
    permissions,
  };
}

// ── Mensajes ──────────────────────────────────────────────────

export async function toMessageViews(
  messages: LeanTicket[],
  h: Hydration,
  /** Duplicados absorbidos, por id: sus mensajes se marcan con su ticket de origen. */
  origins?: Map<string, { id: string; number: number }>,
): Promise<MessageView[]> {
  const attachmentIds = messages.flatMap(
    (message) => (message["attachments"] as unknown[] | undefined) ?? [],
  );
  const attachments = attachmentIds.length
    ? await AttachmentModel.find({ _id: { $in: attachmentIds } }).lean()
    : [];
  const byId = new Map<string, Attachment>(
    attachments.map((file) => [
      String(file._id),
      {
        id: String(file._id),
        fileName: file.fileName!,
        mimeType: file.mimeType!,
        sizeBytes: file.sizeBytes!,
      },
    ]),
  );

  return messages.map((message) => ({
    id: String(message["_id"]),
    type: message["type"],
    body: (message["body"] as string | undefined) ?? "",
    ...(message["authorId"] ? { author: userOf(h, message["authorId"]) } : {}),
    attachments: ((message["attachments"] as unknown[] | undefined) ?? [])
      .map((id) => byId.get(String(id)))
      .filter((file): file is Attachment => Boolean(file)),
    ...(message["systemEvent"]?.kind ? { systemEvent: message["systemEvent"] } : {}),
    ...(origins?.get(String(message["ticketId"]))
      ? { fromTicket: origins.get(String(message["ticketId"]))! }
      : {}),
    createdAt: (message["createdAt"] as Date).toISOString(),
  }));
}

/** Los autores de los mensajes pueden no estar en la hidratación del ticket. */
export async function hydrateAuthors(messages: LeanTicket[], h: Hydration): Promise<void> {
  const missing = new Set<string>();
  for (const message of messages) {
    const id = message["authorId"] ? String(message["authorId"]) : null;
    if (id && !h.users.has(id)) missing.add(id);
  }
  if (!missing.size) return;

  const users = await User.find({ _id: { $in: [...missing] } })
    .select("name avatarUrl areaId availability")
    .lean();
  for (const user of users) h.users.set(String(user._id), summaryOf(user));
}
