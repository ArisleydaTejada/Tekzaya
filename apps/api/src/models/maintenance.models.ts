import {
  ASSET_EVENT_KINDS,
  ASSET_STATUSES,
  ASSET_TYPES,
  PART_UNITS,
  PLAN_MODES,
  PLAN_UNITS,
  STOCK_MOVEMENT_KINDS,
  WORK_ORDER_HOLD_REASONS,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from "@tekzaya/shared";
import { model, Schema } from "mongoose";

// Módulo 2 (plan §2). Todos los montos son **centavos enteros** y nada se borra:
// un activo se da de baja, un repuesto se desactiva, una OT se cancela.

// ── assets ────────────────────────────────────────────────────
const assetSchema = new Schema(
  {
    number: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ASSET_TYPES, required: true },
    brand: { type: String, trim: true },
    model: { type: String, trim: true },
    serial: { type: String, trim: true },
    /** Área responsable: la que lo mantiene y decide quién lo gestiona. */
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    /** Área que lo usa, si no es la responsable (la impresora de Ventas la mantiene TI). */
    usedByAreaId: { type: Schema.Types.ObjectId, ref: "Area" },
    custodianId: { type: Schema.Types.ObjectId, ref: "User" },
    location: { type: String, required: true, trim: true },
    /** Fechas de calendario "YYYY-MM-DD": una compra no tiene hora ni zona. */
    purchaseDate: { type: String },
    purchaseCost: { type: Number },
    warrantyUntil: { type: String },
    // Caché del estado actual para que la lista sea rápida; la verdad está en
    // `asset_events` (plan §2.3).
    status: { type: String, enum: ASSET_STATUSES, default: "operational" },
    photoId: { type: Schema.Types.ObjectId, ref: "Attachment" },
    retiredAt: { type: Date },
    retiredReason: { type: String },
    // Marcas de "ya se avisó", como las del SLA: el trabajo diario no repite.
    warrantyNotifiedAt: { type: Date },
    repeatedFailuresNotifiedAt: { type: Date },
  },
  { timestamps: true },
);
assetSchema.index({ areaId: 1, status: 1 });
assetSchema.index({ custodianId: 1 });
assetSchema.index({ usedByAreaId: 1 });
assetSchema.index({ name: "text", brand: "text", model: "text", serial: "text" });

export const Asset = model("Asset", assetSchema, "assets");

// ── asset_events ──────────────────────────────────────────────
// Solo de inserción: el historial del activo no se edita (plan §2.3).
const assetEventSchema = new Schema({
  assetId: { type: Schema.Types.ObjectId, ref: "Asset", required: true },
  kind: { type: String, enum: ASSET_EVENT_KINDS, required: true },
  at: { type: Date, required: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User" },
  workOrderId: { type: Schema.Types.ObjectId, ref: "WorkOrder" },
  ticketId: { type: Schema.Types.ObjectId, ref: "Ticket" },
  data: { type: Schema.Types.Mixed, default: () => ({}) },
});
assetEventSchema.index({ assetId: 1, at: 1 });
assetEventSchema.index({ kind: 1, at: 1 });

export const AssetEvent = model("AssetEvent", assetEventSchema, "asset_events");

// ── work_orders ───────────────────────────────────────────────
const workOrderSchema = new Schema(
  {
    number: { type: Number, required: true, unique: true },
    type: { type: String, enum: WORK_ORDER_TYPES, required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    assetId: { type: Schema.Types.ObjectId, ref: "Asset", required: true },
    /** Área responsable del activo al abrirla: quien la ve y la atiende. */
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket" },
    planId: { type: Schema.Types.ObjectId, ref: "MaintenancePlan" },
    status: { type: String, enum: WORK_ORDER_STATUSES, default: "pending" },
    holdReason: { type: String, enum: WORK_ORDER_HOLD_REASONS },
    assigneeIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    scheduledFor: { type: String },
    outOfService: { type: Boolean, default: false },
    checklist: [{ _id: false, label: { type: String, required: true }, done: { type: Boolean, default: false } }],
    timeEntries: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        minutes: { type: Number, required: true },
        rate: { type: Number, required: true },
        at: { type: Date, required: true },
        note: { type: String },
      },
    ],
    partsUsed: [
      {
        partId: { type: Schema.Types.ObjectId, ref: "SparePart", required: true },
        qty: { type: Number, required: true },
        unitCost: { type: Number, required: true },
        at: { type: Date, required: true },
      },
    ],
    externalCosts: [
      {
        vendor: { type: String, required: true },
        description: { type: String },
        amount: { type: Number, required: true },
        attachmentId: { type: Schema.Types.ObjectId, ref: "Attachment" },
        at: { type: Date, required: true },
      },
    ],
    costTotal: { type: Number, default: 0 },
    completionNotes: { type: String },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: WORK_ORDER_STATUSES },
        at: { type: Date },
        byId: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],
  },
  { timestamps: true },
);
workOrderSchema.index({ areaId: 1, status: 1 });
workOrderSchema.index({ assetId: 1, createdAt: -1 });
workOrderSchema.index({ assigneeIds: 1, status: 1 });
workOrderSchema.index({ ticketId: 1 }, { sparse: true });
// El trabajo de preventivos puede correr dos veces el mismo día: este índice es lo
// que impide dos OT para la misma fecha del mismo plan (plan A5). Lleva el activo
// porque un plan por tipo ("todas las impresoras") genera una OT por equipo en
// la misma fecha.
workOrderSchema.index(
  { planId: 1, assetId: 1, scheduledFor: 1 },
  { unique: true, partialFilterExpression: { planId: { $exists: true } } },
);

export const WorkOrder = model("WorkOrder", workOrderSchema, "work_orders");

// ── maintenance_plans ─────────────────────────────────────────
const maintenancePlanSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    /** De un activo concreto… */
    assetId: { type: Schema.Types.ObjectId, ref: "Asset" },
    /** …o de todos los de un tipo en el área (exactamente uno de los dos). */
    assetType: { type: String, enum: ASSET_TYPES },
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    checklist: [{ type: String }],
    every: { type: Number, required: true },
    unit: { type: String, enum: PLAN_UNITS, required: true },
    mode: { type: String, enum: PLAN_MODES, required: true },
    startsOn: { type: String, required: true },
    nextDueAt: { type: String, required: true },
    lastCompletedAt: { type: Date },
    leadDays: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    createdById: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
maintenancePlanSchema.index({ isActive: 1, nextDueAt: 1 });
maintenancePlanSchema.index({ assetId: 1 }, { sparse: true });
maintenancePlanSchema.index({ areaId: 1, assetType: 1 });

export const MaintenancePlan = model("MaintenancePlan", maintenancePlanSchema, "maintenance_plans");

// ── spare_parts ───────────────────────────────────────────────
const sparePartSchema = new Schema(
  {
    number: { type: Number, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    unit: { type: String, enum: PART_UNITS, default: "unit" },
    // Suma en caché del libro de movimientos. Se descuenta con `$inc` condicionado
    // a `stock >= qty`, así dos consumos del último no lo dejan en -1 (plan §2.3).
    stock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    avgUnitCost: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    /** Marca del aviso de stock bajo; se borra al volver a superar el mínimo. */
    lowStockNotifiedAt: { type: Date },
  },
  { timestamps: true },
);
sparePartSchema.index({ areaId: 1, isActive: 1 });

export const SparePart = model("SparePart", sparePartSchema, "spare_parts");

// ── stock_movements ───────────────────────────────────────────
const stockMovementSchema = new Schema({
  partId: { type: Schema.Types.ObjectId, ref: "SparePart", required: true },
  kind: { type: String, enum: STOCK_MOVEMENT_KINDS, required: true },
  /** Con signo: positivo entra, negativo sale. */
  qty: { type: Number, required: true },
  unitCost: { type: Number, required: true },
  workOrderId: { type: Schema.Types.ObjectId, ref: "WorkOrder" },
  actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  at: { type: Date, required: true },
  reason: { type: String },
});
stockMovementSchema.index({ partId: 1, at: 1 });
stockMovementSchema.index({ workOrderId: 1 }, { sparse: true });

export const StockMovement = model("StockMovement", stockMovementSchema, "stock_movements");

/** Vacía las colecciones del módulo 2 (semilla y pruebas); no toca las del módulo 1. */
export async function clearMaintenanceData(): Promise<void> {
  await Promise.all([
    Asset.deleteMany({}),
    AssetEvent.deleteMany({}),
    WorkOrder.deleteMany({}),
    MaintenancePlan.deleteMany({}),
    SparePart.deleteMany({}),
    StockMovement.deleteMany({}),
  ]);
}
