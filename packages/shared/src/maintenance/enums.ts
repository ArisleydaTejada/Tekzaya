import { z } from "zod";

// Igual que en los tickets: los valores del contrato van en inglés y el español
// vive solo en las etiquetas de interfaz.

// ── Activo ────────────────────────────────────────────────────

export const ASSET_STATUSES = ["operational", "in_repair", "retired"] as const;
export const assetStatus = z.enum(ASSET_STATUSES);
export type AssetStatus = z.infer<typeof assetStatus>;

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  operational: "Operativo",
  in_repair: "En reparación",
  retired: "De baja",
};

/**
 * Tipos de equipo. Es una lista cerrada, no un texto libre, porque el tipo es una
 * dimensión de los reportes ("Disponibilidad por tipo de equipo") y un plan
 * preventivo puede cubrir "todas las impresoras de TI": "Impresora" e
 * "impresora " no pueden ser dos tipos distintos.
 */
export const ASSET_TYPES = [
  "laptop",
  "desktop",
  "monitor",
  "printer",
  "network",
  "server",
  "phone",
  "ups",
  "air_conditioner",
  "generator",
  "electrical",
  "plumbing",
  "appliance",
  "furniture",
  "vehicle",
  "other",
] as const;
export const assetType = z.enum(ASSET_TYPES);
export type AssetType = z.infer<typeof assetType>;

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  laptop: "Laptop",
  desktop: "Computadora de escritorio",
  monitor: "Monitor",
  printer: "Impresora",
  network: "Equipo de red",
  server: "Servidor",
  phone: "Teléfono",
  ups: "UPS",
  air_conditioner: "Aire acondicionado",
  generator: "Planta eléctrica",
  electrical: "Instalación eléctrica",
  plumbing: "Plomería",
  appliance: "Electrodoméstico",
  furniture: "Mobiliario",
  vehicle: "Vehículo",
  other: "Otro",
};

/** Historial del activo: solo crece, y de él se derivan MTBF y disponibilidad. */
export const ASSET_EVENT_KINDS = [
  "created",
  "status_changed",
  "failure",
  "repair",
  "preventive",
  "moved",
  "custodian_changed",
  "retired",
] as const;
export const assetEventKind = z.enum(ASSET_EVENT_KINDS);
export type AssetEventKind = z.infer<typeof assetEventKind>;

export const ASSET_EVENT_LABEL: Record<AssetEventKind, string> = {
  created: "Alta",
  status_changed: "Cambio de estado",
  failure: "Falla",
  repair: "Reparación",
  preventive: "Mantenimiento preventivo",
  moved: "Cambio de ubicación",
  custodian_changed: "Cambio de persona a cargo",
  retired: "Baja",
};

// ── Orden de trabajo ──────────────────────────────────────────

export const WORK_ORDER_TYPES = ["corrective", "preventive"] as const;
export const workOrderType = z.enum(WORK_ORDER_TYPES);
export type WorkOrderType = z.infer<typeof workOrderType>;

export const WORK_ORDER_TYPE_LABEL: Record<WorkOrderType, string> = {
  corrective: "Correctiva",
  preventive: "Preventiva",
};

export const WORK_ORDER_STATUSES = [
  "pending",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
] as const;
export const workOrderStatus = z.enum(WORK_ORDER_STATUSES);
export type WorkOrderStatus = z.infer<typeof workOrderStatus>;

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  pending: "Pendiente",
  assigned: "Asignada",
  in_progress: "En progreso",
  on_hold: "En espera",
  completed: "Completada",
  cancelled: "Cancelada",
};

export const FINAL_WORK_ORDER_STATUSES = ["completed", "cancelled"] as const;

export function isFinalWorkOrderStatus(status: WorkOrderStatus): boolean {
  return (FINAL_WORK_ORDER_STATUSES as readonly WorkOrderStatus[]).includes(status);
}

/**
 * Transiciones permitidas; el servidor responde 409 a cualquier otra (plan A3).
 * Una orden completada o cancelada ya no cambia: rehacer un trabajo es otra OT.
 */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  pending: ["assigned", "cancelled"],
  assigned: ["pending", "in_progress", "on_hold", "cancelled"],
  in_progress: ["on_hold", "completed", "cancelled"],
  on_hold: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
};

/** Por qué una orden está en espera: lo que hace falta para seguir. */
export const WORK_ORDER_HOLD_REASONS = ["parts", "vendor", "other"] as const;
export const workOrderHoldReason = z.enum(WORK_ORDER_HOLD_REASONS);
export type WorkOrderHoldReason = z.infer<typeof workOrderHoldReason>;

export const WORK_ORDER_HOLD_REASON_LABEL: Record<WorkOrderHoldReason, string> = {
  parts: "Esperando repuesto",
  vendor: "Esperando proveedor",
  other: "Otro motivo",
};

/** Cómo cobra un proveedor externo: un precio cerrado o por hora trabajada. */
export const EXTERNAL_PRICINGS = ["total", "hourly"] as const;
export const externalPricing = z.enum(EXTERNAL_PRICINGS);
export type ExternalPricing = z.infer<typeof externalPricing>;

export const EXTERNAL_PRICING_LABEL: Record<ExternalPricing, string> = {
  total: "Precio total",
  hourly: "Por hora",
};

// ── Plan preventivo ───────────────────────────────────────────

export const PLAN_UNITS = ["day", "week", "month"] as const;
export const planUnit = z.enum(PLAN_UNITS);
export type PlanUnit = z.infer<typeof planUnit>;

export const PLAN_UNIT_LABEL: Record<PlanUnit, { one: string; many: string }> = {
  day: { one: "día", many: "días" },
  week: { one: "semana", many: "semanas" },
  month: { one: "mes", many: "meses" },
};

/**
 * `fixed`: cada N desde la fecha inicial, aunque un mantenimiento se haga tarde
 * (lo que exige una norma o un contrato). `from_last`: N desde el último
 * completado (desgaste real).
 */
export const PLAN_MODES = ["fixed", "from_last"] as const;
export const planMode = z.enum(PLAN_MODES);
export type PlanMode = z.infer<typeof planMode>;

export const PLAN_MODE_LABEL: Record<PlanMode, string> = {
  fixed: "Calendario fijo",
  from_last: "Desde el último completado",
};

// ── Repuestos ─────────────────────────────────────────────────

export const STOCK_MOVEMENT_KINDS = ["in", "consume", "return", "adjust"] as const;
export const stockMovementKind = z.enum(STOCK_MOVEMENT_KINDS);
export type StockMovementKind = z.infer<typeof stockMovementKind>;

export const STOCK_MOVEMENT_LABEL: Record<StockMovementKind, string> = {
  in: "Entrada",
  consume: "Consumo",
  return: "Devolución",
  adjust: "Ajuste",
};

export const PART_UNITS = ["unit", "box", "meter", "liter", "kit"] as const;
export const partUnit = z.enum(PART_UNITS);
export type PartUnit = z.infer<typeof partUnit>;

export const PART_UNIT_LABEL: Record<PartUnit, string> = {
  unit: "unidad",
  box: "caja",
  meter: "metro",
  liter: "litro",
  kit: "kit",
};
