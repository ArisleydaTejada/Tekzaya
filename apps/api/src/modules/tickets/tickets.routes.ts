import {
  ACTIVE_TICKET_STATUSES,
  addBusinessMinutes,
  canChangeCategory,
  canChangePriority,
  canCreateOnBehalfOf,
  canManageAssignees,
  canReadInternalNotes,
  canReplyPublicly,
  canSelfAssign,
  canWriteInternalNote,
  computeTicketSla,
  createMessageInput,
  createTicketInput,
  FINAL_TICKET_STATUSES,
  isOwnTicket,
  PRIORITIES,
  setAssigneesInput,
  ticketListQuery,
  updateTicketInput,
  type Actor,
  type CreateMessageInput,
  type CreateTicketInput,
  type SetAssigneesInput,
  type SystemEvent,
  type TicketListQuery,
  type TicketStatus,
  type UpdateTicketInput,
} from "@tekzaya/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { validateBody, validateQuery } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { nextTicketNumber } from "../../models/counter.model";
import { Message } from "../../models/message.model";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { bindAttachments } from "../attachments/attachments.service";
import { getCalendar, slaPolicyFor } from "../settings/settings.service";
import {
  listFilter,
  idOf,
  loadVisibleTicket,
  refOf,
  routeParam,
  type LeanTicket,
  type TicketDoc,
} from "./ticket.access";
import { applyStatusChange, assertTransition, canApplyStatus, recordSystemEvent } from "./ticket.lifecycle";
import { hydrate, hydrateAuthors, toDetail, toListItem, toMessageViews } from "./ticket.view";

const router = Router();

/**
 * Orden por defecto: primero lo que sigue vivo, y dentro de eso lo que vence
 * antes. `activeRank` y `priorityRank` se calculan en la consulta en vez de
 * guardarse en el documento, para no tener que mantenerlos sincronizados.
 */
const SORTS: Record<TicketListQuery["sort"], Record<string, 1 | -1>> = {
  sla: { activeRank: 1, "sla.resolutionDueAt": 1, priorityRank: 1, createdAt: 1, _id: 1 },
  recent: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
};

const plainOf = (ticket: TicketDoc): LeanTicket => ticket.toObject() as LeanTicket;

async function detailOf(ticket: LeanTicket, actor: Actor) {
  const hydration = await hydrate([ticket]);
  return toDetail(ticket, hydration, actor);
}

// ── Listado ───────────────────────────────────────────────────

router.get("/tickets", validateQuery(ticketListQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as TicketListQuery;

  const [page] = await Ticket.aggregate<{
    items: LeanTicket[];
    total: { value: number }[];
  }>([
    { $match: listFilter(actor, query) },
    {
      $addFields: {
        activeRank: { $cond: [{ $in: ["$status", [...ACTIVE_TICKET_STATUSES]] }, 0, 1] },
        priorityRank: { $indexOfArray: [[...PRIORITIES], "$priority"] },
      },
    },
    { $sort: SORTS[query.sort] },
    {
      $facet: {
        items: [{ $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
        total: [{ $count: "value" }],
      },
    },
  ]);

  const items = page?.items ?? [];
  const hydration = await hydrate(items);

  res.json({
    items: items.map((ticket) => toListItem(ticket, hydration)),
    total: page?.total[0]?.value ?? 0,
    page: query.page,
    limit: query.limit,
  });
});

// ── Creación ──────────────────────────────────────────────────

router.post("/tickets", validateBody(createTicketInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as CreateTicketInput;

  const area = await Area.findById(input.areaId).lean();
  if (!area || area.isActive === false) {
    throw new AppError(422, "validation_error", "Esa área no existe o está desactivada");
  }

  const category = input.categoryId
    ? area.categories?.find((item) => String(item._id) === input.categoryId)
    : undefined;
  if (input.categoryId && !category) {
    throw new AppError(422, "validation_error", "Esa categoría no pertenece al área elegida");
  }

  // ── En nombre de un compañero (spec §5.1) ──
  let requesterId = actor.id;
  if (input.requesterId && input.requesterId !== actor.id) {
    const target = await User.findById(input.requesterId).select("areaId status").lean();
    if (!target || target.status !== "active") {
      throw new AppError(422, "validation_error", "Esa persona no existe o no está activa");
    }
    if (!canCreateOnBehalfOf(actor, { id: input.requesterId, areaId: String(target.areaId) })) {
      throw new AppError(403, "forbidden", "Solo puedes crear tickets por compañeros de tu área");
    }
    requesterId = input.requesterId;
  }

  // La prioridad la propone la IA en F5; hasta entonces entra como "media" y la
  // ajusta el supervisor. El SLA se calcula igual: el ticket nace con plazo.
  const priority = "medium" as const;
  const [policy, calendar] = await Promise.all([slaPolicyFor(priority), getCalendar()]);
  const createdAt = new Date();
  const targets = computeTicketSla(createdAt, policy, calendar);

  const ticketId = new Types.ObjectId();
  const messageId = new Types.ObjectId();
  const attachments = await bindAttachments(input.attachmentIds, actor.id, ticketId, messageId);

  const ticket = await Ticket.create({
    _id: ticketId,
    number: await nextTicketNumber(),
    title: input.title,
    description: input.description,
    requesterId,
    createdById: actor.id,
    areaId: input.areaId,
    ...(category ? { categoryId: category._id } : {}),
    assigneeIds: [],
    status: "open",
    priority,
    ai: { classificationStatus: "pending" },
    sla: {
      responseDueAt: targets.response.dueAt,
      responseRiskAt: targets.response.riskAt,
      resolutionDueAt: targets.resolution.dueAt,
      resolutionRiskAt: targets.resolution.riskAt,
      pausedMs: 0,
    },
    attachmentsCount: attachments,
    lastActivityAt: createdAt,
    stats: { publicMessageCount: 1 },
    statusHistory: [{ status: "open", at: createdAt, byId: actor.id }],
    createdAt,
    updatedAt: createdAt,
  });

  // La descripción abre la conversación: así el hilo se lee entero de arriba abajo.
  await Message.create({
    _id: messageId,
    ticketId,
    authorId: requesterId,
    type: "public",
    body: input.description,
    attachments: input.attachmentIds,
    createdAt,
    updatedAt: createdAt,
  });

  res.status(201).json(await detailOf(plainOf(ticket), actor));
});

// ── Detalle ───────────────────────────────────────────────────

router.get("/tickets/:id", async (req, res) => {
  const actor = res.locals.actor;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  res.json(await detailOf(plainOf(ticket), actor));
});

/** Atajo para las rutas de la interfaz, que navegan por número (`/tickets/TK-000512`). */
router.get("/tickets/by-number/:number", async (req, res) => {
  const actor = res.locals.actor;
  const number = Number(routeParam(req.params["number"]).replace(/^tk-?/i, ""));
  if (!Number.isInteger(number) || number <= 0) {
    throw new AppError(404, "not_found", "Ese ticket no existe");
  }
  const found = await Ticket.findOne({ number }).select("_id").lean();
  if (!found) throw new AppError(404, "not_found", "Ese ticket no existe");

  const ticket = await loadVisibleTicket(String(found._id), actor);
  res.json(await detailOf(plainOf(ticket), actor));
});

// ── Cambios sobre el ticket ───────────────────────────────────

/** Nota pública escrita a raíz de un cambio (la solución al resolver, por ejemplo). */
async function recordPublicNote(
  ticket: TicketDoc,
  actor: Actor,
  body: string,
  at: Date,
): Promise<void> {
  await Message.create({
    ticketId: idOf(ticket),
    authorId: actor.id,
    type: "public",
    body,
    createdAt: at,
    updatedAt: at,
  });
  ticket.set("lastPublicReplyAt", at);
  ticket.set("stats.publicMessageCount", (ticket.get("stats")?.publicMessageCount ?? 0) + 1);
  if (!ticket.get("sla")?.firstResponseAt && !isOwnTicket(actor, refOf(plainOf(ticket)))) {
    ticket.set("sla.firstResponseAt", at);
    ticket.set("sla.firstResponderId", actor.id);
    ticket.set("sla.responseBreached", at > (ticket.get("sla").responseDueAt as Date));
  }
}

router.patch("/tickets/:id", validateBody(updateTicketInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as UpdateTicketInput;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const before = plainOf(ticket);
  const ref = refOf(before);
  const at = new Date();
  const events: SystemEvent[] = [];

  // ── Prioridad ──
  if (input.priority && input.priority !== ticket.get("priority")) {
    if (!canChangePriority(actor, ref)) {
      throw new AppError(403, "forbidden", "Solo el supervisor del área cambia la prioridad");
    }
    const [policy, calendar] = await Promise.all([slaPolicyFor(input.priority), getCalendar()]);
    const targets = computeTicketSla(ticket.get("createdAt") as Date, policy, calendar);
    // El plazo se recalcula con la nueva política desde el origen, y se le vuelve
    // a sumar el tiempo que el ticket ya estuvo en pausa.
    const pausedMinutes = Math.round((ticket.get("sla")?.pausedMs ?? 0) / 60_000);
    const shift = (date: Date) =>
      pausedMinutes > 0 ? addBusinessMinutes(date, pausedMinutes, calendar) : date;

    ticket.set("sla.responseDueAt", shift(targets.response.dueAt));
    ticket.set("sla.responseRiskAt", shift(targets.response.riskAt));
    ticket.set("sla.resolutionDueAt", shift(targets.resolution.dueAt));
    ticket.set("sla.resolutionRiskAt", shift(targets.resolution.riskAt));
    ticket.set("stats.priorityChangedByHuman", true);

    events.push({
      kind: "priority_changed",
      from: ticket.get("priority"),
      to: input.priority,
      reason: input.reason!,
    });
    ticket.set("priority", input.priority);
  }

  // ── Categoría ──
  if (input.categoryId && input.categoryId !== String(ticket.get("categoryId") ?? "")) {
    if (!canChangeCategory(actor, ref)) {
      throw new AppError(403, "forbidden", "No puedes cambiar la categoría de este ticket");
    }
    const area = await Area.findById(ticket.get("areaId")).select("categories").lean();
    const category = area?.categories?.find((item) => String(item._id) === input.categoryId);
    if (!category) {
      throw new AppError(422, "validation_error", "Esa categoría no pertenece al área del ticket");
    }
    events.push({ kind: "category_changed", to: category.name ?? "" });
    ticket.set("categoryId", category._id);
  }

  // ── Estado ──
  if (input.status && input.status !== ticket.get("status")) {
    if (!canApplyStatus(actor, before, input.status)) {
      throw new AppError(403, "forbidden", "No puedes mover este ticket a ese estado");
    }
    assertTransition(ticket.get("status") as TicketStatus, input.status);

    const from = ticket.get("status") as TicketStatus;
    await applyStatusChange(ticket, input.status, actor, at);
    events.push({
      kind: "status_changed",
      from,
      to: input.status,
      ...(input.note ? { reason: input.note } : {}),
    });
    if (input.note) await recordPublicNote(ticket, actor, input.note, at);
  }

  if (!events.length) {
    res.json(await detailOf(before, actor));
    return;
  }

  ticket.set("lastActivityAt", at);
  await ticket.save();
  for (const event of events) await recordSystemEvent(idOf(ticket), event, at);

  res.json(await detailOf(plainOf(ticket), actor));
});

// ── Responsables ──────────────────────────────────────────────

/** Cierra el tramo anterior del historial y abre uno por cada responsable nuevo. */
function updateAssigneeHistory(ticket: TicketDoc, next: string[], at: Date): void {
  const history = ticket.get("assigneeHistory") as { userId: unknown; from: Date; to?: Date }[];
  for (const entry of history) {
    if (!entry.to && !next.includes(String(entry.userId))) entry.to = at;
  }
  const current = new Set(history.filter((entry) => !entry.to).map((entry) => String(entry.userId)));
  for (const id of next) {
    if (!current.has(id)) history.push({ userId: new Types.ObjectId(id), from: at });
  }
}

async function saveAssignees(
  ticket: TicketDoc,
  next: string[],
  actor: Actor,
  at: Date,
): Promise<void> {
  const previous = (ticket.get("assigneeIds") as unknown[]).map(String);
  ticket.set("assigneeIds", next.map((id) => new Types.ObjectId(id)));
  updateAssigneeHistory(ticket, next, at);

  // El estado sigue a los responsables: asignar saca del limbo "Abierto" y
  // quitarlos a todos lo devuelve ahí.
  const status = ticket.get("status") as TicketStatus;
  if (next.length && (status === "open" || status === "reopened")) {
    await applyStatusChange(ticket, "assigned", actor, at);
  } else if (!next.length && status === "assigned") {
    await applyStatusChange(ticket, "open", actor, at);
  }

  ticket.set("lastActivityAt", at);
  await ticket.save();

  const names = await User.find({ _id: { $in: next } })
    .select("name")
    .lean();
  await recordSystemEvent(
    idOf(ticket),
    {
      kind: "assignees_changed",
      from: String(previous.length),
      to: names.map((user) => user.name).join(", ") || "sin responsables",
    },
    at,
  );
}

router.put("/tickets/:id/assignees", validateBody(setAssigneesInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as SetAssigneesInput;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);

  if (!canManageAssignees(actor, refOf(plainOf(ticket)))) {
    throw new AppError(403, "forbidden", "Solo el supervisor del área asigna responsables");
  }

  const unique = [...new Set(input.assigneeIds)];
  if (unique.length) {
    const members = await User.countDocuments({
      _id: { $in: unique },
      areaId: ticket.get("areaId"),
      status: "active",
    });
    if (members !== unique.length) {
      throw new AppError(422, "validation_error", "Solo puedes asignar a personas activas del área");
    }
  }

  await saveAssignees(ticket, unique, actor, new Date());
  res.json(await detailOf(plainOf(ticket), actor));
});

router.post("/tickets/:id/take", async (req, res) => {
  const actor = res.locals.actor;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const ref = refOf(plainOf(ticket));

  if (!canSelfAssign(actor, ref)) {
    throw new AppError(403, "forbidden", "Solo el área que atiende el ticket puede tomarlo");
  }
  if (FINAL_TICKET_STATUSES.includes(ref.status as never)) {
    throw new AppError(409, "invalid_transition", "Este ticket ya está cerrado");
  }
  if (ref.assigneeIds.includes(actor.id)) {
    res.json(await detailOf(plainOf(ticket), actor));
    return;
  }

  await saveAssignees(ticket, [...ref.assigneeIds, actor.id], actor, new Date());
  res.json(await detailOf(plainOf(ticket), actor));
});

// ── Conversación ──────────────────────────────────────────────

router.get("/tickets/:id/messages", async (req, res) => {
  const actor = res.locals.actor;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const plain = plainOf(ticket);

  // La conversación del principal incluye la de los duplicados que absorbió: no
  // se copian mensajes, se leen donde están (spec §7.5.1).
  const mergedIds = (ticket.get("mergedTicketIds") as unknown[]) ?? [];
  const origins = new Map<string, { id: string; number: number }>();
  if (mergedIds.length) {
    const merged = await Ticket.find({ _id: { $in: mergedIds } })
      .select("number")
      .lean();
    for (const item of merged) {
      origins.set(String(item._id), { id: String(item._id), number: item.number! });
    }
  }

  // El filtro va en la consulta, no en el cliente: una nota interna que el
  // solicitante no puede leer nunca llega a salir de la base (spec §10.4).
  const filter: Record<string, unknown> = {
    ticketId: { $in: [idOf(ticket), ...mergedIds] },
  };
  if (!canReadInternalNotes(actor, refOf(plain))) filter["type"] = { $ne: "internal" };

  const messages = (await Message.find(filter).sort({ createdAt: 1, _id: 1 }).lean()) as LeanTicket[];
  const hydration = await hydrate([plain]);
  await hydrateAuthors(messages, hydration);

  res.json({ items: await toMessageViews(messages, hydration, origins) });
});

router.post("/tickets/:id/messages", validateBody(createMessageInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as CreateMessageInput;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const ref = refOf(plainOf(ticket));

  if (FINAL_TICKET_STATUSES.includes(ref.status as never)) {
    throw new AppError(409, "ticket_closed", "Este ticket ya está cerrado; reábrelo para continuar");
  }

  const allowed =
    input.type === "internal" ? canWriteInternalNote(actor, ref) : canReplyPublicly(actor, ref);
  if (!allowed) {
    throw new AppError(
      403,
      "forbidden",
      input.type === "internal"
        ? "Las notas internas son del área que atiende el ticket"
        : "No puedes responder en este ticket",
    );
  }

  const at = new Date();
  const messageId = new Types.ObjectId();
  const attachments = await bindAttachments(input.attachmentIds, actor.id, idOf(ticket), messageId);

  await Message.create({
    _id: messageId,
    ticketId: idOf(ticket),
    authorId: actor.id,
    type: input.type,
    body: input.body,
    attachments: input.attachmentIds,
    createdAt: at,
    updatedAt: at,
  });

  const fromRequester = isOwnTicket(actor, ref);
  const stats = ticket.get("stats") ?? {};

  if (input.type === "public") {
    ticket.set("lastPublicReplyAt", at);
    ticket.set("stats.publicMessageCount", (stats.publicMessageCount ?? 0) + 1);

    // La primera respuesta del área es la que cierra el reloj de respuesta; que
    // el solicitante añada detalles no cuenta como atención (spec §5.3).
    if (!fromRequester && !ticket.get("sla")?.firstResponseAt) {
      ticket.set("sla.firstResponseAt", at);
      ticket.set("sla.firstResponderId", actor.id);
      ticket.set("sla.responseBreached", at > (ticket.get("sla").responseDueAt as Date));
    }

    // "En espera" significa que se espera al solicitante: en cuanto contesta, el
    // ticket vuelve a estar en manos del área y el reloj se reanuda.
    if (ref.status === "on_hold" && fromRequester) {
      await applyStatusChange(ticket, "in_progress", actor, at);
      await recordSystemEvent(
        idOf(ticket),
        { kind: "status_changed", from: "on_hold", to: "in_progress", reason: "El solicitante respondió" },
        at,
      );
    }
  } else {
    ticket.set("stats.internalMessageCount", (stats.internalMessageCount ?? 0) + 1);
  }

  if (attachments) {
    ticket.set("attachmentsCount", (ticket.get("attachmentsCount") ?? 0) + attachments);
  }
  ticket.set("lastActivityAt", at);
  await ticket.save();

  const hydration = await hydrate([plainOf(ticket)]);
  const created = (await Message.findById(messageId).lean()) as LeanTicket;
  await hydrateAuthors([created], hydration);
  const [view] = await toMessageViews([created], hydration);

  res.status(201).json(view);
});

export default router;
