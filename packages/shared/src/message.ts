import { z } from "zod";
import { isoDateTime, objectId } from "./common";
import { messageType } from "./enums";
import { userSummary } from "./user";

export const attachment = z.object({
  id: objectId,
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().min(0),
});
export type Attachment = z.infer<typeof attachment>;

export const systemEvent = z.object({
  kind: z.enum([
    "assignees_changed",
    "status_changed",
    "priority_changed",
    "category_changed",
    "transferred",
    /** En el principal: absorbió a estos duplicados. */
    "merged",
    /** En el duplicado: se fusionó dentro del principal y quedó cerrado. */
    "merged_into",
    "unmerged",
    "reopened",
    "join_requested",
    "csat_answered",
    /** Módulo 2: equipo vinculado o quitado, y OT abierta desde el ticket. */
    "asset_linked",
    "asset_unlinked",
    "work_order_created",
  ]),
  from: z.string().optional(),
  to: z.string().optional(),
  reason: z.string().optional(),
});
export type SystemEvent = z.infer<typeof systemEvent>;

export const message = z.object({
  id: objectId,
  ticketId: objectId,
  authorId: objectId.optional(),
  type: messageType,
  body: z.string(),
  mentions: z.array(objectId),
  attachments: z.array(attachment),
  systemEvent: systemEvent.optional(),
  createdAt: isoDateTime,
});
export type Message = z.infer<typeof message>;

// Solo "public" o "internal": los mensajes de sistema los escribe el backend.
export const createMessageInput = z.object({
  type: z.enum(["public", "internal"]),
  body: z.string().trim().min(1, "Escribe un mensaje").max(5000),
  attachmentIds: z.array(objectId).max(5).default([]),
});
export type CreateMessageInput = z.infer<typeof createMessageInput>;

// ── Lo que la API devuelve ────────────────────────────────────

/**
 * Las notas internas se descartan en la consulta, no aquí (spec §10.4): si un
 * mensaje llega con `type: "internal"`, es porque quien lo pidió puede leerlo.
 */
export const messageView = z.object({
  id: objectId,
  type: messageType,
  body: z.string(),
  author: userSummary.optional(),
  attachments: z.array(attachment),
  systemEvent: systemEvent.optional(),
  /**
   * Presente cuando el mensaje viene de un duplicado absorbido: la conversación
   * del principal los muestra como bloques "Mensaje original de TK-000124"
   * (spec §7.5.1). Los mensajes no se copian; se leen donde están.
   */
  fromTicket: z.object({ id: objectId, number: z.number().int().positive() }).optional(),
  createdAt: isoDateTime,
});
export type MessageView = z.infer<typeof messageView>;

export const messageListResponse = z.object({ items: z.array(messageView) });
export type MessageListResponse = z.infer<typeof messageListResponse>;

/** Lo que devuelve `POST /attachments` antes de enlazarlo a un ticket. */
export const uploadedAttachment = attachment;
export type UploadedAttachment = Attachment;

/** Límites del spec §5.1: hasta 5 archivos de 10 MB por mensaje. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Tipos permitidos. Se comprueban contra los bytes reales del archivo, no contra
 * la extensión ni la cabecera que manda el navegador.
 */
export const ALLOWED_ATTACHMENT_MIME = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
] as const;
