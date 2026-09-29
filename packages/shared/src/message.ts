import { z } from "zod";
import { isoDateTime, objectId } from "./common";
import { messageType } from "./enums";

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
    "merged",
    "unmerged",
    "reopened",
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
