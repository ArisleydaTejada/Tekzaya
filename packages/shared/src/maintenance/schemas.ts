import { z } from "zod";
import { isoDateTime, objectId } from "../common";
import {
  assetEventKind,
  assetStatus,
  assetType,
  externalPricing,
  partUnit,
  planMode,
  planUnit,
  stockMovementKind,
  workOrderHoldReason,
  workOrderStatus,
  workOrderType,
} from "./enums";
import { money } from "./money";

const isoDate = z.iso.date();
const text = (max: number) => z.string().trim().min(1).max(max);

// ── Activo ────────────────────────────────────────────────────

/**
 * La ficha de un equipo. `areaId` es el **área responsable** —la que lo mantiene—
 * y `usedByAreaId` la que lo usa: la impresora de Ventas la mantiene TI.
 *
 * `purchaseCost` es opcional en la respuesta porque el empleado nunca ve costos
 * (plan §3): el servidor lo quita, no la pantalla.
 */
export const asset = z.object({
  id: objectId,
  number: z.number().int().positive(),
  name: z.string(),
  type: assetType,
  brand: z.string().optional(),
  model: z.string().optional(),
  serial: z.string().optional(),
  areaId: objectId,
  usedByAreaId: objectId.optional(),
  custodianId: objectId.optional(),
  location: z.string(),
  purchaseDate: isoDate.optional(),
  purchaseCost: money.optional(),
  warrantyUntil: isoDate.optional(),
  status: assetStatus,
  photoId: objectId.optional(),
  retiredAt: isoDateTime.optional(),
  retiredReason: z.string().optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Asset = z.infer<typeof asset>;

export const createAssetInput = z.object({
  name: text(120),
  type: assetType,
  brand: text(60).optional(),
  model: text(80).optional(),
  serial: text(80).optional(),
  areaId: objectId,
  usedByAreaId: objectId.optional(),
  custodianId: objectId.optional(),
  location: text(120),
  purchaseDate: isoDate.optional(),
  purchaseCost: money.optional(),
  warrantyUntil: isoDate.optional(),
  photoId: objectId.optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetInput>;

/**
 * Solo llega lo que cambia. Los campos opcionales aceptan `null` para vaciarlos
 * (quitar la persona a cargo no es lo mismo que no tocarla). El estado no se
 * edita a mano: lo mueven las órdenes de trabajo y la baja.
 */
export const updateAssetInput = z.object({
  name: createAssetInput.shape.name.optional(),
  type: assetType.optional(),
  areaId: objectId.optional(),
  location: createAssetInput.shape.location.optional(),
  brand: text(60).nullable().optional(),
  model: text(80).nullable().optional(),
  serial: text(80).nullable().optional(),
  usedByAreaId: objectId.nullable().optional(),
  custodianId: objectId.nullable().optional(),
  purchaseDate: isoDate.nullable().optional(),
  purchaseCost: money.nullable().optional(),
  warrantyUntil: isoDate.nullable().optional(),
  photoId: objectId.nullable().optional(),
});
export type UpdateAssetInput = z.infer<typeof updateAssetInput>;

/** Nada se borra: un activo se da de baja con motivo (plan §2.3). */
export const retireAssetInput = z.object({ reason: text(500) });
export type RetireAssetInput = z.infer<typeof retireAssetInput>;

export const assetEvent = z.object({
  id: objectId,
  assetId: objectId,
  kind: assetEventKind,
  at: isoDateTime,
  actorId: objectId.optional(),
  workOrderId: objectId.optional(),
  ticketId: objectId.optional(),
  /** Lo propio de cada tipo: estado de/a, ubicación anterior y nueva, motivo… */
  data: z.record(z.string(), z.unknown()).default({}),
});
export type AssetEvent = z.infer<typeof assetEvent>;

// ── Orden de trabajo ──────────────────────────────────────────

/** El costo unitario se congela al consumir: una compra posterior no cambia el pasado. */
export const partUsage = z.object({
  id: objectId,
  partId: objectId,
  qty: z.number().int().positive(),
  unitCost: money,
  at: isoDateTime,
});
export type PartUsage = z.infer<typeof partUsage>;

/**
 * Un servicio de un proveedor externo: la única mano de obra que cuesta. Cobra
 * un precio total (las horas, si se anotan, son informativas) o por hora, y
 * entonces `amount` es `hourlyRate × minutes`, calculado al registrarlo.
 */
export const externalCost = z.object({
  id: objectId,
  vendor: z.string(),
  description: z.string().optional(),
  pricing: externalPricing,
  minutes: z.number().int().positive().optional(),
  hourlyRate: money.optional(),
  /** Total del servicio, en centavos, sea cual sea la forma de cobro. */
  amount: money,
  attachmentId: objectId.optional(),
  at: isoDateTime,
});
export type ExternalCost = z.infer<typeof externalCost>;

export const checklistItem = z.object({ label: z.string(), done: z.boolean() });
export type ChecklistItem = z.infer<typeof checklistItem>;

export const workOrder = z.object({
  id: objectId,
  number: z.number().int().positive(),
  type: workOrderType,
  title: z.string(),
  description: z.string().optional(),
  assetId: objectId,
  areaId: objectId,
  ticketId: objectId.optional(),
  planId: objectId.optional(),
  status: workOrderStatus,
  holdReason: workOrderHoldReason.optional(),
  assigneeIds: z.array(objectId),
  /** Fecha programada de un preventivo (día en la zona de la empresa). */
  scheduledFor: isoDate.optional(),
  /** ¿El equipo quedó fuera de servicio al abrirla? Decide si cuenta tiempo de parada. */
  outOfService: z.boolean(),
  checklist: z.array(checklistItem),
  partsUsed: z.array(partUsage),
  externalCosts: z.array(externalCost),
  /** Suma en caché de `workOrderCost`; la verdad son las tres listas de arriba. */
  costTotal: money,
  completionNotes: z.string().optional(),
  startedAt: isoDateTime.optional(),
  completedAt: isoDateTime.optional(),
  cancelledAt: isoDateTime.optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type WorkOrder = z.infer<typeof workOrder>;

// ── Plan preventivo ───────────────────────────────────────────

/**
 * Un plan cubre **un activo** o **un tipo de activo en un área** ("todas las
 * impresoras de TI cada 6 meses"): exactamente uno de los dos.
 */
export const maintenancePlan = z
  .object({
    id: objectId,
    title: z.string(),
    assetId: objectId.optional(),
    assetType: assetType.optional(),
    areaId: objectId,
    checklist: z.array(z.string()),
    every: z.number().int().positive(),
    unit: planUnit,
    mode: planMode,
    startsOn: isoDate,
    nextDueAt: isoDate,
    lastCompletedAt: isoDateTime.optional(),
    /** Días de antelación con los que se genera la OT antes de la fecha. */
    leadDays: z.number().int().min(0).max(60),
    isActive: z.boolean(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
  })
  .refine((plan) => (plan.assetId === undefined) !== (plan.assetType === undefined), {
    message: "Un plan es de un activo o de un tipo de activo, no de ambos",
    path: ["assetId"],
  });
export type MaintenancePlan = z.infer<typeof maintenancePlan>;

// ── Repuestos ─────────────────────────────────────────────────

export const sparePart = z.object({
  id: objectId,
  number: z.number().int().positive(),
  name: z.string(),
  areaId: objectId,
  unit: partUnit,
  /** Suma en caché de `stock_movements`; nunca negativa. */
  stock: z.number().int().min(0),
  minStock: z.number().int().min(0),
  /** Promedio ponderado de las entradas, en centavos. */
  avgUnitCost: money,
  isActive: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type SparePart = z.infer<typeof sparePart>;

export const stockMovement = z.object({
  id: objectId,
  partId: objectId,
  kind: stockMovementKind,
  /** Con signo: positivo entra, negativo sale. Un ajuste puede ser de cualquiera de los dos. */
  qty: z.number().int().refine((n) => n !== 0, "La cantidad no puede ser cero"),
  unitCost: money,
  workOrderId: objectId.optional(),
  actorId: objectId,
  at: isoDateTime,
  reason: z.string().optional(),
});
export type StockMovement = z.infer<typeof stockMovement>;
