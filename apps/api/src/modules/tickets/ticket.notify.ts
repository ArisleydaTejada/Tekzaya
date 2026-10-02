import {
  formatTicketNumber,
  TICKET_STATUS_LABEL,
  type Actor,
  type TicketStatus,
} from "@tekzaya/shared";
import type { Types } from "mongoose";
import { User } from "../../models/user.model";
import { emitTicketMessage, emitTicketUpdated } from "../../realtime/realtime";
import { availableAmong, areaMembersExcept, notify, supervisorsOf } from "../notifications/notifications.service";
import { idOf, refOf, type LeanTicket, type TicketDoc } from "./ticket.access";

/**
 * La tabla de eventos del spec §8, en un sitio. Estaba repartida entre los jobs y
 * algunas rutas; centralizar quién recibe qué es lo que permite leer la tabla del
 * spec y comprobarla línea por línea sin recorrer cinco archivos.
 *
 * Regla común: **nadie recibe el aviso de su propia acción**. Quien acaba de pulsar
 * el botón ya sabe lo que hizo, y un aviso suyo propio le entrena a ignorar la campana.
 */

/** Quién pidió el ticket: solicitante, creador y los solicitantes heredados de una fusión. */
function requesterSide(ticket: LeanTicket): string[] {
  const ref = refOf(ticket);
  return [...new Set([ref.requesterId, ref.createdById, ...(ref.additionalRequesterIds ?? [])])];
}

function without(userIds: readonly string[], actorId: string): string[] {
  return userIds.filter((id) => id !== actorId);
}

const label = (ticket: TicketDoc): string =>
  `${formatTicketNumber(ticket.get("number"))} · ${ticket.get("title")}`;

/** Avisa a la sala del ticket y a la del área de que algo cambió (spec §12). */
export function broadcastTicket(ticket: TicketDoc): void {
  emitTicketUpdated({
    ticketId: String(idOf(ticket)),
    number: ticket.get("number"),
    areaId: String(ticket.get("areaId")),
    status: ticket.get("status") as TicketStatus,
    lastActivityAt: (ticket.get("lastActivityAt") as Date).toISOString(),
  });
}

export function broadcastMessage(
  ticket: TicketDoc,
  messageId: Types.ObjectId,
  type: "public" | "internal" | "system",
  at: Date,
  authorId?: string,
): void {
  emitTicketMessage(
    {
      ticketId: String(idOf(ticket)),
      number: ticket.get("number"),
      messageId: String(messageId),
      type,
      ...(authorId ? { authorId } : {}),
      createdAt: at.toISOString(),
    },
    String(ticket.get("areaId")),
  );
}

// ── Creación ──────────────────────────────────────────────────

/**
 * Un ticket nuevo lo vigila el supervisor del área; si entra como **Urgente**, lo
 * ven además todos los miembros disponibles, porque esperar al supervisor para que
 * alguien lo mire es justo lo que un urgente no puede permitirse (spec §8).
 */
export async function notifyTicketCreated(ticket: TicketDoc, actor: Actor): Promise<void> {
  const areaId = String(ticket.get("areaId"));
  const audience = new Set(await supervisorsOf(areaId));

  if (ticket.get("priority") === "urgent") {
    const members = await areaMembersExcept(areaId, [actor.id]);
    for (const id of await availableAmong(members)) audience.add(id);
  }

  await notify(without([...audience], actor.id), {
    type: "ticket_created_in_area",
    title: ticket.get("priority") === "urgent" ? "Ticket urgente en tu área" : "Nuevo ticket en tu área",
    body: label(ticket),
    ticketId: idOf(ticket),
    ticketNumber: ticket.get("number"),
  });

  // "En nombre de un compañero": la persona tiene que enterarse de que existe un
  // ticket a su nombre, porque es ella quien recibirá las respuestas (spec §5.1).
  const requesterId = String(ticket.get("requesterId"));
  if (requesterId !== actor.id) {
    const creator = await User.findById(actor.id).select("name").lean();
    await notify([requesterId], {
      type: "ticket_created_for_you",
      title: creator?.name
        ? `${creator.name} creó un ticket en tu nombre`
        : "Crearon un ticket en tu nombre",
      body: label(ticket),
      ticketId: idOf(ticket),
      ticketNumber: ticket.get("number"),
    });
  }
}

// ── Asignación ────────────────────────────────────────────────

/** Solo a los responsables **nuevos**: a quien ya lo era no le ha cambiado nada. */
export async function notifyAssigned(
  ticket: TicketDoc,
  previousIds: readonly string[],
  nextIds: readonly string[],
  actor: Actor,
): Promise<void> {
  const previous = new Set(previousIds);
  const added = without(
    nextIds.filter((id) => !previous.has(id)),
    actor.id,
  );
  if (!added.length) return;

  await notify(added, {
    type: "ticket_assigned",
    title: "Te asignaron un ticket",
    body: label(ticket),
    ticketId: idOf(ticket),
    ticketNumber: ticket.get("number"),
  });
}

// ── Conversación ──────────────────────────────────────────────

/**
 * Una respuesta pública va "al otro lado": si contesta el área, al solicitante; si
 * contesta el solicitante, a los responsables (o al supervisor si no hay ninguno,
 * porque si no el mensaje se quedaría sin destinatario).
 */
export async function notifyPublicReply(
  ticket: TicketDoc,
  actor: Actor,
  fromRequester: boolean,
): Promise<void> {
  const plain = ticket.toObject() as LeanTicket;
  let audience: string[];

  if (fromRequester) {
    const assignees = refOf(plain).assigneeIds.map(String);
    audience = assignees.length ? assignees : await supervisorsOf(String(ticket.get("areaId")));
  } else {
    audience = requesterSide(plain);
  }

  await notify(without([...new Set(audience)], actor.id), {
    type: "ticket_reply",
    title: fromRequester ? "El solicitante respondió" : "Respondieron a tu ticket",
    body: label(ticket),
    ticketId: idOf(ticket),
    ticketNumber: ticket.get("number"),
  });
}

// ── Cambios de estado ─────────────────────────────────────────

/**
 * El solicitante se entera de cada movimiento de su ticket. Tres estados tienen
 * mensaje propio porque **piden algo** de él: en espera y resuelto necesitan su
 * respuesta, y resuelto trae además la invitación a la encuesta (spec §7.6).
 */
export async function notifyStatusChange(
  ticket: TicketDoc,
  to: TicketStatus,
  actor: Actor,
): Promise<void> {
  const audience = without(requesterSide(ticket.toObject() as LeanTicket), actor.id);
  if (!audience.length) return;

  const common = {
    body: label(ticket),
    ticketId: idOf(ticket),
    ticketNumber: ticket.get("number") as number,
  };

  if (to === "on_hold") {
    await notify(audience, {
      type: "ticket_on_hold",
      title: "Necesitamos tu respuesta",
      ...common,
    });
    return;
  }

  if (to === "resolved") {
    await notify(audience, {
      type: "ticket_resolved",
      title: "Tu ticket se resolvió — cuéntanos cómo fue la atención",
      ...common,
    });
    return;
  }

  await notify(audience, {
    type: "ticket_status_changed",
    title: `Tu ticket pasó a ${TICKET_STATUS_LABEL[to]}`,
    ...common,
  });
}
