import { z } from "zod";
import { areaRef } from "../area";
import { isoDateTime, objectId, paginated, paginationQuery } from "../common";
import { commaSeparated } from "../ticket";
import { assetPerson } from "./assetApi";
import {
  assetStatus,
  assetType,
  partUnit,
  workOrderHoldReason,
  workOrderStatus,
  workOrderType,
  WORK_ORDER_STATUSES,
  type WorkOrderStatus,
} from "./enums";
import { currencyCode, money } from "./money";
import { workOrder } from "./schemas";

// Plan A3: el trabajo técnico con su costo real. La OT tiene su propio ciclo
// (Pendiente → Asignada → En progreso → En espera → Completada, o Cancelada) y
// su costo es repuestos + servicios externos: el trabajo de los técnicos de la
// empresa no se cobra a la orden.

const text = (max: number) => z.string().trim().min(1, "Escribe algo").max(max);

// ── Consulta de la lista ──────────────────────────────────────

/** Bandejas de la lista, como las de los tickets: lo mío, lo del área sin dueño, todo. */
export const WORK_ORDER_SCOPES = ["mine", "unassigned", "all"] as const;
export const workOrderScope = z.enum(WORK_ORDER_SCOPES);
export type WorkOrderScope = z.infer<typeof workOrderScope>;

export const WORK_ORDER_SCOPE_LABEL: Record<WorkOrderScope, string> = {
  mine: "Asignadas a mí",
  unassigned: "Sin asignar",
  all: "Todas",
};

export const WORK_ORDER_SORTS = ["number", "status", "scheduledFor", "cost", "updatedAt"] as const;
export const workOrderSort = z.enum(WORK_ORDER_SORTS);
export type WorkOrderSort = z.infer<typeof workOrderSort>;

/**
 * Filtros de la lista. Igual que en el inventario, solo **estrechan** lo que la
 * sesión permite ver: las OT de las áreas que mantiene quien pregunta.
 */
export const workOrderListQuery = paginationQuery.extend({
  scope: workOrderScope.default("all"),
  /** Número (`OT-0012` o `12`), título, o el número o nombre del equipo. */
  q: z.string().trim().max(120).optional(),
  status: commaSeparated(workOrderStatus).optional(),
  type: workOrderType.optional(),
  areaId: objectId.optional(),
  assetId: objectId.optional(),
  assigneeId: objectId.optional(),
  sort: workOrderSort.default("number"),
  dir: z.enum(["asc", "desc"]).default("desc"),
});
export type WorkOrderListQuery = z.infer<typeof workOrderListQuery>;

// ── Vistas ────────────────────────────────────────────────────

/** El equipo de la OT, lo justo para reconocerlo en una fila. */
export const workOrderAssetRef = z.object({
  id: objectId,
  number: z.number().int().positive(),
  name: z.string(),
  type: assetType,
  status: assetStatus,
  location: z.string(),
});
export type WorkOrderAssetRef = z.infer<typeof workOrderAssetRef>;

export const workOrderListItem = z.object({
  id: objectId,
  number: z.number().int().positive(),
  type: workOrderType,
  title: z.string(),
  status: workOrderStatus,
  holdReason: workOrderHoldReason.optional(),
  asset: workOrderAssetRef,
  area: areaRef,
  assignees: z.array(assetPerson),
  ticket: z.object({ id: objectId, number: z.number().int().positive() }).optional(),
  scheduledFor: z.iso.date().optional(),
  /** Preventivo que pasó su fecha sin completarse (plan A3: las OT no tienen SLA). */
  overdue: z.boolean(),
  outOfService: z.boolean(),
  costTotal: money,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type WorkOrderListItem = z.infer<typeof workOrderListItem>;

export const workOrderStatusCounts = z.record(workOrderStatus, z.number().int().min(0));
export type WorkOrderStatusCounts = z.infer<typeof workOrderStatusCounts>;

export const workOrderListResponse = paginated(workOrderListItem).extend({
  /** Por estado, con los demás filtros aplicados: las cabeceras de grupos y kanban. */
  statusCounts: workOrderStatusCounts,
  currency: currencyCode,
});
export type WorkOrderListResponse = z.infer<typeof workOrderListResponse>;

/** Qué puede hacer quien mira; la pantalla no recalcula permisos. */
export const workOrderPermissions = z.object({
  /** Tomarla: cualquier técnico del área, mientras no sea suya ya. */
  take: z.boolean(),
  /** Mover el estado, registrar horas, repuestos y costos, completar. */
  work: z.boolean(),
  /** Elegir responsables: el supervisor. */
  assign: z.boolean(),
  /** Al completar, dar de baja un equipo sin arreglo: quien gestiona el activo. */
  retireAsset: z.boolean(),
});
export type WorkOrderPermissions = z.infer<typeof workOrderPermissions>;

export const workOrderStatusStep = z.object({
  status: workOrderStatus,
  at: isoDateTime,
  by: assetPerson.optional(),
  /** Motivo, si lo tuvo (una cancelación). */
  reason: z.string().optional(),
});
export type WorkOrderStatusStep = z.infer<typeof workOrderStatusStep>;

/** Desglose de `workOrderCost`, calculado en el servidor para que cuadre con el total guardado. */
export const workOrderCostBreakdown = z.object({
  parts: money,
  external: money,
  total: money,
});
export type WorkOrderCostBreakdown = z.infer<typeof workOrderCostBreakdown>;

/**
 * Un repuesto que el trabajo va a necesitar. Es una previsión: no sale del
 * almacén hasta que se consume (`partsUsed`). `used` es lo que ya se cargó de esa
 * pieza a la orden, así se sabe cuánto falta todavía.
 */
export const workOrderRequiredPart = z.object({
  id: objectId,
  part: z.object({ id: objectId, number: z.number().int().positive(), name: z.string(), unit: partUnit }),
  qty: z.number().int().positive(),
  stock: z.number().int().min(0),
  used: z.number().int().min(0),
});
export type WorkOrderRequiredPart = z.infer<typeof workOrderRequiredPart>;

/** Disponibilidad de un repuesto requerido, de lo resuelto a lo que bloquea. */
export type RequiredPartAvailability = "loaded" | "in_stock" | "short" | "out";

export function requiredPartAvailability(item: Pick<WorkOrderRequiredPart, "qty" | "stock" | "used">): RequiredPartAvailability {
  const missing = item.qty - item.used;
  if (missing <= 0) return "loaded";
  if (item.stock >= missing) return "in_stock";
  return item.stock > 0 ? "short" : "out";
}

export const workOrderDetail = workOrder
  .omit({ partsUsed: true, assigneeIds: true })
  .extend({
    asset: workOrderAssetRef,
    area: areaRef,
    assignees: z.array(assetPerson),
    ticket: z.object({ id: objectId, number: z.number().int().positive(), title: z.string() }).optional(),
    /** El plan preventivo que la generó. */
    plan: z.object({ id: objectId, title: z.string() }).optional(),
    partsUsed: z.array(
      z.object({
        id: objectId,
        part: z.object({ id: objectId, number: z.number().int().positive(), name: z.string(), unit: partUnit }),
        qty: z.number().int().positive(),
        unitCost: money,
        at: isoDateTime,
      }),
    ),
    /** Lo que hará falta, con las existencias de hoy y lo que ya se cargó de cada pieza. */
    requiredParts: z.array(workOrderRequiredPart),
    cost: workOrderCostBreakdown,
    currency: currencyCode,
    overdue: z.boolean(),
    history: z.array(workOrderStatusStep),
    createdBy: assetPerson.optional(),
    permissions: workOrderPermissions,
  });
export type WorkOrderDetail = z.infer<typeof workOrderDetail>;

/** Repuestos del área que se pueden cargar a la OT, con lo que queda. */
export const workOrderPartOption = z.object({
  id: objectId,
  number: z.number().int().positive(),
  name: z.string(),
  unit: partUnit,
  stock: z.number().int().min(0),
  avgUnitCost: money,
  /** Vinculado al equipo de la orden: se ofrece primero. */
  forAsset: z.boolean().default(false),
});
export type WorkOrderPartOption = z.infer<typeof workOrderPartOption>;

export const workOrderPartOptionsResponse = z.object({ items: z.array(workOrderPartOption) });

/** Técnicos del área a los que se puede asignar la OT. */
export const workOrderAssigneeOptionsResponse = z.object({
  items: z.array(assetPerson.extend({ away: z.boolean(), openWorkOrders: z.number().int().min(0) })),
});
export type WorkOrderAssigneeOptionsResponse = z.infer<typeof workOrderAssigneeOptionsResponse>;

// ── Entradas ──────────────────────────────────────────────────

/**
 * OT sin ticket: una avería que encuentra el propio técnico, o un preventivo
 * puntual. `outOfService` es la misma pregunta de A2 y no trae respuesta por
 * defecto: decide si empieza a contar tiempo de parada.
 */
export const createWorkOrderInput = z.object({
  assetId: objectId,
  type: workOrderType,
  title: z.string().trim().min(5, "Mínimo 5 caracteres").max(120, "Máximo 120 caracteres"),
  description: z.string().trim().max(5000).optional(),
  outOfService: z.boolean(),
  scheduledFor: z.iso.date().optional(),
  checklist: z.array(text(200)).max(30).default([]),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderInput>;

/**
 * Editar y mover el estado. Completar no pasa por aquí (exige notas: `complete`),
 * y `pending`/`assigned` los decide la asignación, no un desplegable.
 */
export const updateWorkOrderInput = z
  .object({
    title: z.string().trim().min(5, "Mínimo 5 caracteres").max(120, "Máximo 120 caracteres").optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    status: z.enum(["in_progress", "on_hold", "cancelled"]).optional(),
    /** Obligatorio al pasar a En espera: lo que hace falta para seguir. */
    holdReason: workOrderHoldReason.optional(),
    /** Motivo de la cancelación; queda en el historial. */
    reason: z.string().trim().max(500).optional(),
    /** Casillas de la lista de verificación, en el mismo orden. */
    checklist: z.array(z.boolean()).max(30).optional(),
  })
  .refine((input) => input.status !== "on_hold" || input.holdReason !== undefined, {
    message: "Indica qué falta para seguir",
    path: ["holdReason"],
  });
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderInput>;

export const setWorkOrderAssigneesInput = z.object({ assigneeIds: z.array(objectId).max(10) });
export type SetWorkOrderAssigneesInput = z.infer<typeof setWorkOrderAssigneesInput>;

export const addWorkOrderPartInput = z.object({
  partId: objectId,
  qty: z.number().int().min(1).max(1000),
});
export type AddWorkOrderPartInput = z.infer<typeof addWorkOrderPartInput>;

/** Prever un repuesto; si ya estaba en la lista, se cambia su cantidad. */
export const setRequiredPartInput = z.object({
  partId: objectId,
  qty: z.number().int().min(1).max(1000),
});
export type SetRequiredPartInput = z.infer<typeof setRequiredPartInput>;

export const MAX_REQUIRED_PARTS = 30;

const externalCostBase = {
  vendor: text(120),
  description: z.string().trim().max(300).optional(),
  /** Factura: un adjunto subido antes, como la foto de un activo. */
  attachmentId: objectId.optional(),
};
const workedMinutes = z.number().int().min(1, "Mínimo un minuto").max(1000 * 60);

/**
 * Un servicio externo. Con precio total, las horas son opcionales e
 * informativas; por hora, son obligatorias y el servidor calcula el monto
 * (`hourlyServiceAmount`), así nunca hay un total que no cuadre con su tarifa.
 */
export const addExternalCostInput = z.discriminatedUnion("pricing", [
  z.object({
    ...externalCostBase,
    pricing: z.literal("total"),
    amount: money.min(1, "El monto tiene que ser mayor que cero"),
    minutes: workedMinutes.optional(),
  }),
  z.object({
    ...externalCostBase,
    pricing: z.literal("hourly"),
    hourlyRate: money.min(1, "La tarifa tiene que ser mayor que cero"),
    minutes: workedMinutes,
  }),
]);
export type AddExternalCostInput = z.infer<typeof addExternalCostInput>;

/**
 * Completar exige notas del trabajo realizado. `retireAsset` es "no tiene
 * arreglo": el equipo pasa a De baja en vez de volver a Operativo.
 */
export const completeWorkOrderInput = z.object({
  completionNotes: z.string().trim().min(5, "Cuenta qué se hizo (mínimo 5 caracteres)").max(5000),
  retireAsset: z.boolean().default(false),
});
export type CompleteWorkOrderInput = z.infer<typeof completeWorkOrderInput>;

// ── Utilidades ────────────────────────────────────────────────

/** Para que grupos y kanban tengan siempre sus seis columnas. */
export function emptyWorkOrderStatusCounts(): WorkOrderStatusCounts {
  return Object.fromEntries(WORK_ORDER_STATUSES.map((status) => [status, 0])) as WorkOrderStatusCounts;
}

/**
 * Un preventivo vencido: pasó su fecha programada y sigue abierto. Se compara
 * como fecha de calendario de la empresa, igual que la garantía.
 */
export function isWorkOrderOverdue(
  order: { type: string; status: WorkOrderStatus; scheduledFor?: string | undefined },
  today: string,
): boolean {
  return (
    order.type === "preventive" &&
    order.scheduledFor !== undefined &&
    order.scheduledFor < today &&
    order.status !== "completed" &&
    order.status !== "cancelled"
  );
}
