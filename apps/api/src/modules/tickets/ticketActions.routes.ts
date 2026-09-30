import {
  canRequestJoin,
  canTransfer,
  FINAL_TICKET_STATUSES,
  formatTicketNumber,
  joinRequestInput,
  mergeTicketsInput,
  transferTicketInput,
  unmergeTicketInput,
  type JoinRequestInput,
  type MergeTicketsInput,
  type TransferTicketInput,
  type UnmergeTicketInput,
} from "@tekzaya/shared";
import { Router } from "express";
import { AppError } from "../../middleware/errors";
import { validateBody } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { User } from "../../models/user.model";
import { notify, supervisorsOf } from "../notifications/notifications.service";
import {
  idOf,
  loadVisibleTicket,
  refOf,
  routeParam,
  type LeanTicket,
  type TicketDoc,
} from "./ticket.access";
import { applyStatusChange, recordSystemEvent } from "./ticket.lifecycle";
import { findDuplicateCandidates, mergeTickets, unmergeTicket } from "./ticket.merge";
import { hydrate, toDetail } from "./ticket.view";

const router = Router();

const plainOf = (ticket: TicketDoc): LeanTicket => ticket.toObject() as LeanTicket;

async function detailOf(ticket: TicketDoc, actor: Parameters<typeof canTransfer>[0]) {
  const plain = plainOf(ticket);
  const hydration = await hydrate([plain]);
  return toDetail(plain, hydration, actor);
}

// ── Transferir a otra área (spec §7.5) ────────────────────────

router.post("/tickets/:id/transfer", validateBody(transferTicketInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as TransferTicketInput;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const ref = refOf(plainOf(ticket));

  if (!canTransfer(actor, ref)) {
    throw new AppError(403, "forbidden", "Solo sus responsables o el supervisor pueden transferirlo");
  }
  if (FINAL_TICKET_STATUSES.includes(ref.status as never)) {
    throw new AppError(409, "ticket_closed", "Un ticket cerrado ya no se transfiere");
  }
  if (input.areaId === ref.areaId) {
    throw new AppError(422, "validation_error", "El ticket ya está en esa área");
  }

  const [target, origin] = await Promise.all([
    Area.findById(input.areaId).select("name isActive").lean(),
    Area.findById(ref.areaId).select("name").lean(),
  ]);
  if (!target || target.isActive === false) {
    throw new AppError(422, "validation_error", "Esa área no existe o está desactivada");
  }

  const at = new Date();

  // Vuelve a "Abierto" sin responsables: en el área nueva nadie lo ha visto aún,
  // y la categoría pertenecía al catálogo del área anterior (spec §5.2).
  for (const entry of ticket.get("assigneeHistory") as { to?: Date }[]) {
    if (!entry.to) entry.to = at;
  }
  ticket.set("areaId", input.areaId);
  ticket.set("categoryId", undefined);
  ticket.set("assigneeIds", []);
  ticket.set("stats.transferCount", (ticket.get("stats")?.transferCount ?? 0) + 1);
  await applyStatusChange(ticket, "open", actor, at);
  ticket.set("lastActivityAt", at);
  await ticket.save();

  // El reloj del SLA NO se reinicia: mide lo que lleva esperando el solicitante,
  // y él no tiene la culpa de que el ticket llegara al área equivocada.
  await recordSystemEvent(
    idOf(ticket),
    { kind: "transferred", from: origin?.name ?? "", to: target.name ?? "", reason: input.reason },
    at,
  );

  await notify(await supervisorsOf(input.areaId), {
    type: "ticket_transferred",
    title: "Un ticket llegó a tu área",
    body: `${formatTicketNumber(ticket.get("number"))} · ${ticket.get("title")}`,
    ticketId: idOf(ticket),
  });

  res.json(await detailOf(ticket, actor));
});

// ── Fusión de duplicados (spec §7.5.1) ────────────────────────

router.get("/tickets/:id/duplicate-candidates", async (req, res) => {
  const actor = res.locals.actor;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);

  // Los candidatos son tickets del área: quien no los podría abrir tampoco los lista.
  const ref = refOf(plainOf(ticket));
  if (actor.role !== "admin" && actor.areaId !== ref.areaId) {
    throw new AppError(403, "forbidden", "Solo el área que atiende el ticket busca duplicados");
  }

  res.json({ items: await findDuplicateCandidates(ticket) });
});

router.post("/tickets/:id/merge", validateBody(mergeTicketsInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as MergeTicketsInput;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);

  await mergeTickets(ticket, input.duplicateIds, actor, {
    reason: input.reason,
    addAssignees: input.addAssignees,
    notifyRequesters: input.notifyRequesters,
  });

  res.json(await detailOf(ticket, actor));
});

router.post("/tickets/:id/unmerge", validateBody(unmergeTicketInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as UnmergeTicketInput;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);

  await unmergeTicket(ticket, input.duplicateId, actor);

  res.json(await detailOf(ticket, actor));
});

// ── "Unirme" (spec §7.5) ──────────────────────────────────────

router.post("/tickets/:id/join-request", validateBody(joinRequestInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as JoinRequestInput;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const ref = refOf(plainOf(ticket));

  if (!canRequestJoin(actor, ref)) {
    throw new AppError(
      403,
      "forbidden",
      ref.assigneeIds.length === 0
        ? "Este ticket no tiene responsables: tómalo en vez de pedir unirte"
        : "Solo el área que atiende el ticket puede pedir unirse",
    );
  }

  const at = new Date();
  ticket.set("stats.joinRequestCount", (ticket.get("stats")?.joinRequestCount ?? 0) + 1);
  ticket.set("lastActivityAt", at);
  await ticket.save();

  const person = await User.findById(actor.id).select("name").lean();

  // Queda en el hilo, no solo en una notificación: el equipo ve quién se ofreció
  // aunque el supervisor tarde en decidir.
  await recordSystemEvent(
    idOf(ticket),
    {
      kind: "join_requested",
      to: person?.name ?? "Alguien del área",
      ...(input.message ? { reason: input.message } : {}),
    },
    at,
  );

  await notify(await supervisorsOf(ref.areaId), {
    type: "join_request",
    title: "Alguien quiere unirse a un ticket",
    body: `${person?.name ?? "Un compañero"} pidió unirse a ${formatTicketNumber(ticket.get("number"))}.`,
    ticketId: idOf(ticket),
  });

  res.json(await detailOf(ticket, actor));
});

export default router;
