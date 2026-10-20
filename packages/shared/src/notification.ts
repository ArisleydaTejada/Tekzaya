import { z } from "zod";
import { isoDateTime, objectId, paginated } from "./common";

/**
 * Catálogo cerrado de avisos (spec §8). Es un enumerado y no texto libre porque
 * la interfaz decide el color del punto a partir del tipo: un tipo nuevo sin
 * tono asignado deja de compilar en vez de pintarse gris por accidente.
 */
export const NOTIFICATION_TYPES = [
  "ticket_created_in_area",
  "ticket_created_for_you",
  "ticket_assigned",
  "ticket_unassigned",
  "ticket_reply",
  "ticket_status_changed",
  "ticket_on_hold",
  "ticket_resolved",
  "ticket_auto_closed",
  "on_hold_reminder",
  "ticket_transferred",
  "ticket_merged",
  "ticket_unmerged",
  "sla_at_risk",
  "sla_breached",
  "incident_detected",
  "join_request",
  "assignee_away",
  // Módulo 2: mantenimiento de activos.
  "work_order_assigned",
  "preventive_due",
  "preventive_overdue",
  "low_stock",
  "warranty_expiring",
  "repeated_failures",
] as const;

export const notificationType = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationType>;

/** Urgencia visual del aviso en el panel de la campana. */
export const NOTIFICATION_TONE: Record<NotificationType, "red" | "amber" | "accent"> = {
  ticket_created_in_area: "accent",
  ticket_created_for_you: "accent",
  ticket_assigned: "accent",
  ticket_unassigned: "amber",
  ticket_reply: "accent",
  ticket_status_changed: "accent",
  ticket_on_hold: "amber",
  ticket_resolved: "accent",
  ticket_auto_closed: "accent",
  on_hold_reminder: "amber",
  ticket_transferred: "accent",
  ticket_merged: "accent",
  ticket_unmerged: "accent",
  sla_at_risk: "amber",
  sla_breached: "red",
  incident_detected: "amber",
  join_request: "accent",
  assignee_away: "amber",
  work_order_assigned: "accent",
  preventive_due: "accent",
  preventive_overdue: "red",
  low_stock: "amber",
  warranty_expiring: "amber",
  repeated_failures: "red",
};

export const notificationView = z.object({
  id: objectId,
  type: notificationType,
  title: z.string(),
  body: z.string().optional(),
  ticketId: objectId.optional(),
  /** Número legible, resuelto al leer: la campana enlaza a `/tickets/TK-000123`. */
  ticketNumber: z.number().int().positive().optional(),
  /** Avisos del módulo 2 que enlazan a una orden de trabajo (`/ordenes/OT-0012`). */
  workOrderId: objectId.optional(),
  workOrderNumber: z.number().int().positive().optional(),
  /** El aviso de stock bajo lleva al repuesto (`/repuestos/REP-0003`). */
  sparePartId: objectId.optional(),
  sparePartNumber: z.number().int().positive().optional(),
  readAt: isoDateTime.optional(),
  createdAt: isoDateTime,
});
export type NotificationView = z.infer<typeof notificationView>;

export const notificationListResponse = paginated(notificationView).extend({
  /** Contador de la campana; cuenta todas las no leídas, no solo las de esta página. */
  unread: z.number().int().min(0),
});
export type NotificationListResponse = z.infer<typeof notificationListResponse>;

/**
 * `{ all: true }` vacía el contador; con `ids` se marcan solo las que el panel
 * mostró. Nunca se borran: el historial es lo que permite volver a un aviso.
 */
export const markNotificationsInput = z
  .object({
    ids: z.array(objectId).max(100).optional(),
    all: z.boolean().default(false),
  })
  .refine((value) => value.all || (value.ids?.length ?? 0) > 0, {
    message: "Indica cuáles marcar o pide marcar todas",
    path: ["ids"],
  });
export type MarkNotificationsInput = z.infer<typeof markNotificationsInput>;
