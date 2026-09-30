import {
  businessMinutesBetween,
  canCancel,
  canChangeStatus,
  computeSlaTargets,
  isOwnTicket,
  shiftTargets,
  type Actor,
  type SystemEvent,
  type TicketStatus,
} from "@tekzaya/shared";
import type { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Message } from "../../models/message.model";
import { getCalendar, slaPolicyFor } from "../settings/settings.service";
import { refOf, type LeanTicket, type TicketDoc } from "./ticket.access";

/**
 * Transiciones válidas del ciclo de vida (spec §5.2). Lo que no está aquí se
 * rechaza con 409: la máquina de estados vive en el servidor, no en el desplegable
 * de la interfaz ni en el arrastre del Kanban.
 *
 * `merged` solo se alcanza desde la fusión de duplicados, que tiene su propio
 * endpoint; por eso no figura como destino libre.
 */
export const ALLOWED_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ["assigned", "in_progress", "on_hold", "cancelled"],
  assigned: ["open", "in_progress", "on_hold", "resolved", "cancelled"],
  in_progress: ["assigned", "on_hold", "resolved", "cancelled"],
  // "closed" desde En espera es el abandono: el solicitante nunca contestó. Lo
  // usa el cierre automático a los 10 días hábiles y también el supervisor a mano.
  on_hold: ["assigned", "in_progress", "resolved", "cancelled", "closed"],
  resolved: ["closed", "reopened", "in_progress"],
  closed: ["reopened"],
  reopened: ["assigned", "in_progress", "on_hold", "resolved", "cancelled"],
  cancelled: [],
  merged: [],
};

/**
 * Quién puede mover el ticket. Además de responsables y supervisores, el
 * solicitante cierra o reabre su propio ticket cuando ya está resuelto: es él
 * quien confirma que el problema desapareció (spec §5.2).
 */
export function canApplyStatus(actor: Actor, ticket: LeanTicket, next: TicketStatus): boolean {
  const ref = refOf(ticket);
  if (next === "cancelled") return canCancel(actor, ref);
  if (isOwnTicket(actor, ref) && ref.status === "resolved" && (next === "closed" || next === "reopened")) {
    return true;
  }
  return canChangeStatus(actor, ref);
}

export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      409,
      "invalid_transition",
      `Un ticket ${from} no puede pasar a ${to}`,
    );
  }
}

/** Mensaje de sistema: el historial es requisito no funcional (spec §13). */
export async function recordSystemEvent(
  ticketId: Types.ObjectId,
  event: SystemEvent,
  at: Date,
): Promise<void> {
  await Message.create({
    ticketId,
    type: "system",
    body: "",
    systemEvent: event,
    createdAt: at,
    updatedAt: at,
  });
}

/**
 * Aplica el cambio de estado sobre el documento (sin guardarlo) y devuelve los
 * mensajes de sistema que hay que escribir. El reloj del SLA se ajusta aquí:
 * es el único sitio donde el ticket entra y sale de "En espera".
 */
export async function applyStatusChange(
  ticket: TicketDoc,
  next: TicketStatus,
  actor: Actor,
  at: Date,
): Promise<void> {
  const previous = ticket.get("status") as TicketStatus;
  if (previous === next) return;

  const calendar = await getCalendar();
  const sla = ticket.get("sla");

  // ── Salida de "En espera": el plazo se corre lo que duró la pausa ──
  if (previous === "on_hold" && sla?.onHoldSince) {
    const pausedFrom = sla.onHoldSince as Date;
    const pausedMinutes = businessMinutesBetween(pausedFrom, at, calendar);

    const response = shiftTargets(
      { dueAt: sla.responseDueAt as Date, riskAt: sla.responseRiskAt as Date },
      pausedFrom,
      at,
      calendar,
    );
    const resolution = shiftTargets(
      { dueAt: sla.resolutionDueAt as Date, riskAt: sla.resolutionRiskAt as Date },
      pausedFrom,
      at,
      calendar,
    );

    ticket.set("sla.responseDueAt", response.dueAt);
    ticket.set("sla.responseRiskAt", response.riskAt);
    ticket.set("sla.resolutionDueAt", resolution.dueAt);
    ticket.set("sla.resolutionRiskAt", resolution.riskAt);
    ticket.set("sla.pausedMs", (sla.pausedMs ?? 0) + pausedMinutes * 60_000);
    ticket.set("sla.onHoldSince", undefined);
  }

  if (next === "on_hold") ticket.set("sla.onHoldSince", at);

  if (next === "resolved") {
    ticket.set("sla.resolvedAt", at);
    ticket.set("sla.resolvedByIds", ticket.get("assigneeIds"));
    ticket.set("sla.resolutionBreached", at > (sla.resolutionDueAt as Date));
  }

  if (next === "closed") ticket.set("sla.closedAt", at);

  // ── Reapertura: el problema sigue vivo, así que el reloj de resolución
  //    vuelve a correr desde cero con la política de su prioridad (spec §5.2).
  if (next === "reopened") {
    const policy = await slaPolicyFor(ticket.get("priority"));
    const resolution = computeSlaTargets(at, policy.resolutionMinutes, calendar);
    ticket.set("sla.resolvedAt", undefined);
    ticket.set("sla.closedAt", undefined);
    ticket.set("sla.resolvedByIds", []);
    ticket.set("sla.resolutionDueAt", resolution.dueAt);
    ticket.set("sla.resolutionRiskAt", resolution.riskAt);
    ticket.set("stats.reopenCount", (ticket.get("stats")?.reopenCount ?? 0) + 1);
  }

  ticket.set("status", next);
  ticket.set("lastActivityAt", at);
  ticket.get("statusHistory").push({ status: next, at, byId: actor.id });
}
