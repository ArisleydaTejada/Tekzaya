import {
  canViewWorkOrder,
  isAdmin,
  WORK_ORDER_STATUS_LABEL,
  WORK_ORDER_TRANSITIONS,
  type Actor,
  type WorkOrderRef,
  type WorkOrderStatus,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { WorkOrder } from "../../models/maintenance.models";

/** Documento plano de una OT, tal como sale de `.lean()`. */
export interface LeanWorkOrder {
  _id: Types.ObjectId;
  number: number;
  type: "corrective" | "preventive";
  title: string;
  description?: string | null;
  assetId: Types.ObjectId;
  areaId: Types.ObjectId;
  ticketId?: Types.ObjectId | null;
  planId?: Types.ObjectId | null;
  status: WorkOrderStatus;
  holdReason?: "parts" | "vendor" | "other" | null;
  assigneeIds: Types.ObjectId[];
  scheduledFor?: string | null;
  outOfService: boolean;
  checklist: { label: string; done: boolean }[];
  partsUsed: { _id: Types.ObjectId; partId: Types.ObjectId; qty: number; unitCost: number; at: Date }[];
  externalCosts: {
    _id: Types.ObjectId;
    vendor: string;
    description?: string | null;
    pricing?: "total" | "hourly" | null;
    minutes?: number | null;
    hourlyRate?: number | null;
    amount: number;
    attachmentId?: Types.ObjectId | null;
    at: Date;
  }[];
  costTotal: number;
  completionNotes?: string | null;
  createdById?: Types.ObjectId | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  statusHistory: { status: WorkOrderStatus; at: Date; byId?: Types.ObjectId | null; reason?: string | null }[];
  createdAt: Date;
  updatedAt: Date;
}

export function workOrderRefOf(order: { areaId?: unknown; assigneeIds?: unknown[] | null }): WorkOrderRef {
  return { areaId: String(order.areaId), assigneeIds: (order.assigneeIds ?? []).map(String) };
}

/**
 * Qué OT entran en una lista: las de su área, salvo lectura global. Mismo
 * criterio que `canViewWorkOrder`, escrito como consulta; los filtros del
 * cliente se suman con `$and` y solo estrechan.
 */
export function workOrderScopeFilter(actor: Actor): Record<string, unknown> {
  if (isAdmin(actor) || actor.hasGlobalReadAccess) return {};
  return { areaId: new Types.ObjectId(actor.areaId) };
}

/**
 * Busca por id o por número (`OT-0012` o `12`). Lo que no se puede ver responde
 * 404, igual que un ticket o un activo ajeno.
 */
export async function loadVisibleWorkOrder(key: string, actor: Actor): Promise<LeanWorkOrder> {
  const number = /^(?:OT-)?(\d{1,9})$/i.exec(key.trim())?.[1];
  const filter =
    Types.ObjectId.isValid(key) && key.length === 24 ? { _id: key } : number ? { number: Number(number) } : null;
  const order = filter ? ((await WorkOrder.findOne(filter).lean()) as LeanWorkOrder | null) : null;
  if (!order || !canViewWorkOrder(actor, workOrderRefOf(order))) {
    throw new AppError(404, "not_found", "Esa orden de trabajo no existe");
  }
  return order;
}

/** La máquina de estados vive en el servidor (plan A3): lo demás es 409. */
export function assertWorkOrderTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (!WORK_ORDER_TRANSITIONS[from].includes(to)) {
    throw new AppError(
      409,
      "invalid_transition",
      `Una orden «${WORK_ORDER_STATUS_LABEL[from]}» no puede pasar a «${WORK_ORDER_STATUS_LABEL[to]}»`,
    );
  }
}
