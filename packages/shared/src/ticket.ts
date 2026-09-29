import { z } from "zod";
import { isoDateTime, objectId } from "./common";
import { priority, slaState, ticketStatus } from "./enums";

export const ticketSla = z.object({
  responseDueAt: isoDateTime,
  resolutionDueAt: isoDateTime,
  firstResponseAt: isoDateTime.optional(),
  resolvedAt: isoDateTime.optional(),
  closedAt: isoDateTime.optional(),
  /** Tiempo acumulado en "En espera": el reloj del SLA se pausa (spec §5.2). */
  pausedMs: z.number().int().min(0),
  /** Estado derivado en el backend a partir de los vencimientos y las pausas. */
  responseState: slaState,
  resolutionState: slaState,
});
export type TicketSla = z.infer<typeof ticketSla>;

export const ticketAi = z.object({
  suggestedAreaId: objectId.optional(),
  areaConfidence: z.number().min(0).max(1).optional(),
  classificationStatus: z.enum(["pending", "done", "failed"]),
  summary: z.string().optional(),
  summaryUpdatedAt: isoDateTime.optional(),
  incident: z
    .object({
      groupId: z.string(),
      label: z.string(),
      confidence: z.number().min(0).max(1),
      status: z.enum(["detected", "dismissed"]),
    })
    .optional(),
});
export type TicketAi = z.infer<typeof ticketAi>;

export const ticket = z.object({
  id: objectId,
  /** Secuencial legible; se muestra con `formatTicketNumber` como TK-000123. */
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string(),

  requesterId: objectId,
  createdById: objectId,
  areaId: objectId,
  categoryId: objectId.optional(),
  assigneeIds: z.array(objectId),

  status: ticketStatus,
  priority,

  sla: ticketSla,
  ai: ticketAi,

  csat: z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().optional(),
      answeredAt: isoDateTime,
    })
    .optional(),

  mergedIntoId: objectId.optional(),
  mergedTicketIds: z.array(objectId),

  attachmentsCount: z.number().int().min(0),
  lastActivityAt: isoDateTime,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Ticket = z.infer<typeof ticket>;

// Límites tomados de la anatomía del ticket (spec §5.1). El mismo esquema valida
// el formulario en el navegador y la petición en el servidor.
export const createTicketInput = z.object({
  title: z.string().trim().min(5, "Mínimo 5 caracteres").max(120, "Máximo 120 caracteres"),
  description: z
    .string()
    .trim()
    .min(10, "Describe el problema con al menos 10 caracteres")
    .max(5000, "Máximo 5000 caracteres"),
  areaId: objectId,
  categoryId: objectId.optional(),
  /** Crear en nombre de un compañero de la misma área; el backend lo verifica. */
  requesterId: objectId.optional(),
});
export type CreateTicketInput = z.infer<typeof createTicketInput>;

export const updateTicketInput = z
  .object({
    status: ticketStatus.optional(),
    categoryId: objectId.optional(),
    priority: priority.optional(),
    /** Obligatorio al cambiar la prioridad que asignó la IA (spec §5.1). */
    reason: z.string().trim().min(3).max(280).optional(),
  })
  .refine((v) => v.priority === undefined || (v.reason?.length ?? 0) > 0, {
    message: "Cambiar la prioridad requiere un motivo",
    path: ["reason"],
  });
export type UpdateTicketInput = z.infer<typeof updateTicketInput>;
