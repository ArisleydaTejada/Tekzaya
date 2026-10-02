import { z } from "zod";
import { isoDateTime, objectId } from "./common";
import { messageType, ticketStatus } from "./enums";
import { notificationView } from "./notification";

/**
 * Nombres de los tres eventos del spec §12. Están aquí y no sueltos en cada lado
 * porque un cambio de nombre tiene que romper la compilación de ambos, no dejar
 * al navegador escuchando un evento que ya nadie emite.
 */
export const REALTIME_EVENTS = {
  /** Aviso nuevo para esta persona; va a su sala privada. */
  notification: "notification:new",
  /** El ticket cambió de estado, de responsables o de prioridad. */
  ticketUpdated: "ticket:updated",
  /** Mensaje nuevo en la conversación. */
  ticketMessage: "ticket:message",
} as const;

/** El detalle de un ticket pide entrar en su sala al abrirse y salir al cerrarse. */
export const REALTIME_COMMANDS = {
  watchTicket: "ticket:watch",
  unwatchTicket: "ticket:unwatch",
} as const;

export const notificationEvent = notificationView;
export type NotificationEvent = z.infer<typeof notificationEvent>;

export const ticketUpdatedEvent = z.object({
  ticketId: objectId,
  number: z.number().int().positive(),
  areaId: objectId,
  status: ticketStatus,
  lastActivityAt: isoDateTime,
});
export type TicketUpdatedEvent = z.infer<typeof ticketUpdatedEvent>;

/**
 * Solo avisa de que **hay** mensaje nuevo: el cuerpo no viaja por el socket, lo
 * pide la pantalla por la API, que es la que filtra las notas internas. Así una
 * sala mal calculada no puede filtrar el texto de una nota.
 */
export const ticketMessageEvent = z.object({
  ticketId: objectId,
  number: z.number().int().positive(),
  messageId: objectId,
  type: messageType,
  authorId: objectId.optional(),
  createdAt: isoDateTime,
});
export type TicketMessageEvent = z.infer<typeof ticketMessageEvent>;
