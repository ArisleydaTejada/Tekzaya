import { FINAL_WORK_ORDER_STATUSES, formatWorkOrderNumber, type Actor, type WorkOrderType } from "@tekzaya/shared";
import { Types } from "mongoose";
import { nextNumber } from "../../models/counter.model";
import { Asset, AssetEvent, StockMovement, WorkOrder } from "../../models/maintenance.models";
import { emitWorkOrderUpdated } from "../../realtime/realtime";
import { notify } from "../notifications/notifications.service";
import { checkLowStock, receiveStock } from "../spareParts/stock";
import type { LeanAsset } from "../assets/asset.access";
import type { LeanWorkOrder } from "./workOrder.access";

/** Órdenes que todavía no terminaron. */
export const OPEN_WORK_ORDER = { status: { $nin: [...FINAL_WORK_ORDER_STATUSES] } };

// ── Apertura ──────────────────────────────────────────────────

export interface OpenWorkOrderInput {
  /** Se reserva antes cuando hace falta (el ticket guarda el id antes de crear la OT). */
  _id?: Types.ObjectId;
  type: WorkOrderType;
  title: string;
  description?: string | undefined;
  asset: LeanAsset;
  ticketId?: Types.ObjectId | undefined;
  outOfService: boolean;
  scheduledFor?: string | undefined;
  checklist?: readonly string[] | undefined;
}

/**
 * Abre una OT y escribe lo que su apertura deja en la historia del equipo. Una
 * correctiva **es** la falla (plan A2: el ticket solo la señala); un preventivo
 * no cuenta como falla, pero si deja el equipo fuera de servicio, esa parada
 * también se mide.
 */
export async function openWorkOrder(
  input: OpenWorkOrderInput,
  actor: Actor,
  at: Date,
): Promise<{ id: Types.ObjectId; number: number }> {
  const _id = input._id ?? new Types.ObjectId();
  const number = await nextNumber("work_order");
  const { asset } = input;
  await WorkOrder.create({
    _id,
    number,
    type: input.type,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    assetId: asset._id,
    areaId: asset.areaId,
    ...(input.ticketId ? { ticketId: input.ticketId } : {}),
    status: "pending",
    assigneeIds: [],
    ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
    outOfService: input.outOfService,
    checklist: (input.checklist ?? []).map((label) => ({ label, done: false })),
    createdById: actor.id,
    statusHistory: [{ status: "pending", at, byId: actor.id }],
    createdAt: at,
    updatedAt: at,
  });

  // Si el equipo ya estaba en reparación por otra orden, la parada ya corre: no
  // se escribe un segundo "fuera de servicio". La condición en la propia
  // actualización evita que dos órdenes a la vez lo dejen escrito dos veces.
  const stopped = input.outOfService
    ? (await Asset.updateOne({ _id: asset._id, status: "operational" }, { $set: { status: "in_repair" } }))
        .modifiedCount > 0
    : false;
  const trace = { actorId: actor.id, workOrderId: _id, ...(input.ticketId ? { ticketId: input.ticketId } : {}) };
  await AssetEvent.insertMany([
    ...(input.type === "corrective"
      ? [{ assetId: asset._id, kind: "failure", at, ...trace, data: { title: input.title } }]
      : []),
    ...(stopped
      ? [{ assetId: asset._id, kind: "status_changed", at, ...trace, data: { from: "operational", to: "in_repair" } }]
      : []),
  ]);

  return { id: _id, number };
}

// ── Costo ─────────────────────────────────────────────────────

/**
 * Recalcula `costTotal` en la base, en una sola actualización atómica sobre el
 * documento tal como está. Calcularlo en JavaScript y escribirlo después dejaba
 * una carrera: dos técnicos que cargan repuestos a la vez escriben cada uno el
 * total que vio, y gana el que llega último aunque haya visto menos.
 *
 * Es la misma fórmula que `workOrderCost` (y hay una prueba que lo comprueba):
 * repuestos + servicios externos.
 */
export async function refreshCost(orderId: Types.ObjectId): Promise<void> {
  await WorkOrder.updateOne(
    { _id: orderId },
    [
      {
        $set: {
          costTotal: {
            $add: [
              { $sum: { $map: { input: "$partsUsed", in: { $multiply: ["$$this.qty", "$$this.unitCost"] } } } },
              { $sum: "$externalCosts.amount" },
            ],
          },
        },
      },
    ],
    { updatePipeline: true },
  );
}

// ── Repuestos ─────────────────────────────────────────────────

/**
 * Devuelve al almacén lo que la OT había consumido: un movimiento `return` por
 * línea, al costo congelado de la pieza, que entra en el promedio como una
 * compra a ese costo. Nunca se borra el consumo (plan A4).
 */
export async function returnParts(
  order: Pick<LeanWorkOrder, "_id">,
  usages: LeanWorkOrder["partsUsed"],
  actor: Actor,
  at: Date,
  reason: string,
): Promise<void> {
  for (const usage of usages) {
    await receiveStock(usage.partId, usage.qty, usage.unitCost);
    await StockMovement.create({
      partId: usage.partId,
      kind: "return",
      qty: usage.qty,
      unitCost: usage.unitCost,
      workOrderId: order._id,
      actorId: actor.id,
      at,
      reason,
    });
    await checkLowStock(usage.partId, actor.id);
  }
}

// ── Estado del equipo ─────────────────────────────────────────

/**
 * Al cerrar una OT que dejó el equipo fuera de servicio, vuelve a *Operativo*…
 * salvo que otra orden abierta también lo tenga parado: entonces la parada
 * sigue corriendo y la devuelve la última en cerrarse.
 */
export async function releaseAsset(order: LeanWorkOrder, actor: Actor, at: Date): Promise<boolean> {
  if (!order.outOfService) return false;
  const stillDown = await WorkOrder.exists({
    _id: { $ne: order._id },
    assetId: order.assetId,
    outOfService: true,
    ...OPEN_WORK_ORDER,
  });
  if (stillDown) return false;

  const released = await Asset.updateOne(
    { _id: order.assetId, status: "in_repair" },
    { $set: { status: "operational" } },
  );
  if (released.modifiedCount === 0) return false;
  await AssetEvent.create({
    assetId: order.assetId,
    kind: "status_changed",
    at,
    actorId: actor.id,
    workOrderId: order._id,
    ...(order.ticketId ? { ticketId: order.ticketId } : {}),
    data: { from: "in_repair", to: "operational" },
  });
  return true;
}

// ── Avisos ────────────────────────────────────────────────────

/** Solo a los responsables nuevos, y nunca a quien se asigna a sí mismo. */
export async function notifyWorkOrderAssigned(
  order: Pick<LeanWorkOrder, "_id" | "number" | "title">,
  previousIds: readonly string[],
  nextIds: readonly string[],
  actor: Actor,
): Promise<void> {
  const previous = new Set(previousIds);
  const added = nextIds.filter((id) => !previous.has(id) && id !== actor.id);
  if (!added.length) return;
  await notify(added, {
    type: "work_order_assigned",
    title: "Te asignaron una orden de trabajo",
    body: `${formatWorkOrderNumber(order.number)} · ${order.title}`,
    workOrderId: order._id,
    workOrderNumber: order.number,
  });
}

/** Avisa a la sala del área de que la OT cambió (plan A3). */
export async function broadcastWorkOrder(orderId: Types.ObjectId): Promise<void> {
  const order = await WorkOrder.findById(orderId).select("number areaId status updatedAt").lean();
  if (!order) return;
  emitWorkOrderUpdated({
    workOrderId: String(order._id),
    number: order.number,
    areaId: String(order.areaId),
    status: order.status,
    updatedAt: (order.updatedAt as Date).toISOString(),
  });
}
