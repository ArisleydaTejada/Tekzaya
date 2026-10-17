import { z } from "zod";
import { areaRef } from "./area";
import { isoDateTime, objectId, paginated, paginationQuery } from "./common";
import { priority, slaState, ticketScope, ticketStatus } from "./enums";
import { userSummary } from "./user";

export const ticketSla = z.object({
  responseDueAt: isoDateTime,
  resolutionDueAt: isoDateTime,
  firstResponseAt: isoDateTime.optional(),
  resolvedAt: isoDateTime.optional(),
  closedAt: isoDateTime.optional(),
  /**
   * Instante en que el reloj paró de verdad: la resolución, el cierre, o el
   * momento de cancelar o fusionar. Lo calcula el servidor porque es el único que
   * sabe mirar el historial de estados, y es lo que permite a la interfaz dejar de
   * contar días en un ticket entregado en vez de pintarlo vencido para siempre.
   */
  settledAt: isoDateTime.optional(),
  /** Tiempo acumulado en "En espera": el reloj del SLA se pausa (spec §5.2). */
  pausedMs: z.number().int().min(0),
  /**
   * Desde cuándo está "En espera", si lo está ahora mismo. Solo viaja mientras
   * la pausa dura: es lo que convierte `pausedMs` —un total histórico— en una
   * espera que se puede mirar correr.
   */
  onHoldSince: isoDateTime.optional(),
  /**
   * Cuándo se cierra solo por falta de respuesta del solicitante: `onHoldSince`
   * más `onHoldAutoCloseDays` días hábiles (spec §5.2). Es un plazo de verdad
   * —lo ejecuta `runLifecycleJobs`—, pero no es del SLA: vencerlo no es
   * incumplir, es dar el ticket por abandonado. Solo viaja con el ticket en
   * espera, y únicamente hacia quien lo atiende.
   */
  requesterWaitDueAt: isoDateTime.optional(),
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
  /** Adjuntos ya subidos con `POST /attachments`, aún sin ticket. */
  attachmentIds: z.array(objectId).max(5).default([]),
});
export type CreateTicketInput = z.infer<typeof createTicketInput>;

export const updateTicketInput = z
  .object({
    status: ticketStatus.optional(),
    categoryId: objectId.optional(),
    priority: priority.optional(),
    /** Obligatorio al cambiar la prioridad que asignó la IA (spec §5.1). */
    reason: z.string().trim().min(3).max(280).optional(),
    /** Mensaje público que acompaña al cambio; obligatorio al resolver. */
    note: z.string().trim().min(3).max(5000).optional(),
  })
  .refine((v) => v.priority === undefined || (v.reason?.length ?? 0) > 0, {
    message: "Cambiar la prioridad requiere un motivo",
    path: ["reason"],
  })
  .refine((v) => v.status !== "resolved" || (v.note?.length ?? 0) > 0, {
    message: "Explica cómo se resolvió el problema",
    path: ["note"],
  });
export type UpdateTicketInput = z.infer<typeof updateTicketInput>;

// ── Lo que la API devuelve ────────────────────────────────────
// Los identificadores se resuelven en el servidor: el navegador recibe el nombre
// del solicitante y el color del área ya listos, y no necesita un catálogo de
// personas en memoria para pintar una fila.

/** Permisos ya resueltos para ESTE ticket y ESTE usuario (spec §4.3). */
export const ticketPermissions = z.object({
  viewInternalNotes: z.boolean(),
  replyPublicly: z.boolean(),
  writeInternalNote: z.boolean(),
  changeStatus: z.boolean(),
  changeCategory: z.boolean(),
  changePriority: z.boolean(),
  manageAssignees: z.boolean(),
  selfAssign: z.boolean(),
  cancel: z.boolean(),
  transfer: z.boolean(),
  merge: z.boolean(),
  unmerge: z.boolean(),
  requestJoin: z.boolean(),
  /** La encuesta se abre al resolver y se cierra al cerrar el ticket (spec §7.6). */
  answerCsat: z.boolean(),
});
export type TicketPermissions = z.infer<typeof ticketPermissions>;

export const ticketListItem = z.object({
  id: objectId,
  number: z.number().int().positive(),
  title: z.string(),
  status: ticketStatus,
  priority,
  area: areaRef,
  categoryId: objectId.optional(),
  categoryName: z.string().optional(),
  requester: userSummary,
  assignees: z.array(userSummary),
  responseState: slaState,
  resolutionState: slaState,
  responseDueAt: isoDateTime,
  resolutionDueAt: isoDateTime,
  /** Cuándo contestó el área; el panel "Mis solicitudes" distingue con esto (spec §7.2.1). */
  firstResponseAt: isoDateTime.optional(),
  /** Los dos del ticket en espera; ver `ticketSla`. La lista los lleva para que
      la ficha del SLA cuente lo mismo en la tabla que en el detalle. */
  onHoldSince: isoDateTime.optional(),
  requesterWaitDueAt: isoDateTime.optional(),
  attachmentsCount: z.number().int().min(0),
  /**
   * Etiqueta del incidente al que pertenece, si lo hay. Solo viaja hacia quien
   * atiende el ticket: el solicitante no ve que su problema es uno de veinte
   * (spec §6.2, IA-5).
   */
  incidentLabel: z.string().optional(),
  createdAt: isoDateTime,
  lastActivityAt: isoDateTime,
});
export type TicketListItem = z.infer<typeof ticketListItem>;

export const ticketListResponse = paginated(ticketListItem);
export type TicketListResponse = z.infer<typeof ticketListResponse>;

export const ticketHistoryEntry = z.object({
  status: ticketStatus,
  at: isoDateTime,
  by: userSummary.optional(),
});
export type TicketHistoryEntry = z.infer<typeof ticketHistoryEntry>;

/**
 * Ficha del otro extremo de una fusión. Lleva más que el número porque el
 * principal tiene que **mostrar el detalle del duplicado** sin obligar a abrirlo:
 * quien atiende necesita ver de quién venía y qué contaba (spec §7.5.1).
 */
export const mergedTicketRef = z.object({
  id: objectId,
  number: z.number().int().positive(),
  title: z.string(),
  description: z.string().optional(),
  status: ticketStatus.optional(),
  requesterName: z.string().optional(),
  createdAt: isoDateTime.optional(),
  mergedAt: isoDateTime.optional(),
});
export type MergedTicketRef = z.infer<typeof mergedTicketRef>;

export const ticketDetail = ticketListItem.extend({
  description: z.string(),
  createdBy: userSummary,
  /** Solicitantes heredados al absorber duplicados (spec §7.5.1). */
  additionalRequesters: z.array(userSummary),
  sla: ticketSla,
  /** Solo se envía a quien atiende el ticket; el solicitante no ve el rastro de la IA. */
  ai: ticketAi.optional(),
  csat: z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().optional(),
      answeredAt: isoDateTime,
    })
    .optional(),
  mergedInto: mergedTicketRef.optional(),
  mergedTickets: z.array(mergedTicketRef),
  history: z.array(ticketHistoryEntry),
  permissions: ticketPermissions,
});
export type TicketDetail = z.infer<typeof ticketDetail>;

// ── Consulta del listado ──────────────────────────────────────

/** `?status=open,assigned` → `["open", "assigned"]`. */
export function commaSeparated<T extends z.ZodType>(item: T) {
  return z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
        : value,
    z.array(item).min(1),
  );
}

/**
 * Orden del listado. `sla`, `recent` y `oldest` son los tres atajos de siempre y
 * ya llevan su dirección dentro; el resto son columnas de la tabla y se combinan
 * con `dir`, que es lo que permite pulsar una cabecera dos veces.
 *
 * Ordenar vive en el servidor y no en el navegador porque la lista está paginada:
 * ordenar las 25 filas que se ven no es ordenar los 800 tickets que hay.
 */
export const TICKET_SORTS = [
  "sla",
  "recent",
  "oldest",
  "number",
  "title",
  "requester",
  "area",
  "priority",
  "status",
  "created",
] as const;
export const ticketSort = z.enum(TICKET_SORTS);
export type TicketSort = z.infer<typeof ticketSort>;

/** Columnas de la tabla de tickets por las que el servidor sabe ordenar. */
export const SORTABLE_TICKET_COLUMNS = [
  "number",
  "title",
  "requester",
  "area",
  "priority",
  "status",
  "sla",
  "created",
] as const satisfies readonly TicketSort[];

export const ticketListQuery = paginationQuery.extend({
  scope: ticketScope.default("area"),
  status: commaSeparated(ticketStatus).optional(),
  priority: commaSeparated(priority).optional(),
  /** Solo lo respeta el servidor si el alcance del usuario lo permite (spec §10.4). */
  areaId: objectId.optional(),
  assigneeId: objectId.optional(),
  categoryId: objectId.optional(),
  /** Número (`TK-000512` o `512`) o trozo del título. */
  q: z.string().trim().max(120).optional(),
  sort: ticketSort.default("sla"),
  /** Solo lo usan las columnas; los atajos ya traen su propio sentido. */
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type TicketListQuery = z.infer<typeof ticketListQuery>;

/** Responsables del ticket; sustituye la lista entera (spec §7.4). */
export const setAssigneesInput = z.object({
  assigneeIds: z.array(objectId).max(10),
});
export type SetAssigneesInput = z.infer<typeof setAssigneesInput>;

// ── Movimientos del ticket (spec §7.5) ────────────────────────

export const transferTicketInput = z.object({
  areaId: objectId,
  reason: z.string().trim().min(3, "Explica por qué cambia de área").max(280),
});
export type TransferTicketInput = z.infer<typeof transferTicketInput>;

export const mergeTicketsInput = z.object({
  /** Los duplicados que absorbe este ticket; el principal es el de la ruta. */
  duplicateIds: z.array(objectId).min(1, "Elige al menos un duplicado").max(20),
  reason: z.string().trim().min(3, "El motivo es obligatorio").max(280),
  /** Sumar los responsables de los duplicados a los del principal. */
  addAssignees: z.boolean().default(true),
  notifyRequesters: z.boolean().default(true),
});
export type MergeTicketsInput = z.infer<typeof mergeTicketsInput>;

export const unmergeTicketInput = z.object({ duplicateId: objectId });
export type UnmergeTicketInput = z.infer<typeof unmergeTicketInput>;

export const joinRequestInput = z.object({
  message: z.string().trim().max(280).optional(),
});
export type JoinRequestInput = z.infer<typeof joinRequestInput>;

/** Posible duplicado propuesto por búsqueda de texto, sin gastar cuota de IA. */
export const duplicateCandidate = z.object({
  id: objectId,
  number: z.number().int().positive(),
  title: z.string(),
  status: ticketStatus,
  requesterName: z.string(),
  createdAt: isoDateTime,
  /** Parte del mismo grupo de incidente que el principal: llega preseleccionado. */
  sameIncident: z.boolean(),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidate>;

// ── Encuesta de satisfacción (spec §7.6) ──────────────────────

export const csatInput = z.object({
  rating: z.number().int().min(1, "Elige de 1 a 5 estrellas").max(5),
  comment: z.string().trim().max(1000).optional(),
});
export type CsatInput = z.infer<typeof csatInput>;
