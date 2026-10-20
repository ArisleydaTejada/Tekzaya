import type { NotificationType, NotificationView } from "@tekzaya/shared";
import type { Types } from "mongoose";
import { Notification } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { emitNotification } from "../../realtime/realtime";

/**
 * Las notificaciones se guardan desde F4 y desde F6 se emiten también por el
 * socket. El orden importa: primero la base, luego el socket. Si se emitiera
 * antes, una persona con la aplicación abierta vería un aviso que, tras un fallo
 * de escritura, no estaría en su bandeja al recargar.
 */
export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string;
  ticketId?: Types.ObjectId;
  /** Número del ticket, si quien avisa ya lo tiene a mano; si no, se consulta. */
  ticketNumber?: number;
  /** Avisos del módulo 2 que llevan a una orden de trabajo. */
  workOrderId?: Types.ObjectId;
  workOrderNumber?: number;
  sparePartId?: Types.ObjectId;
  sparePartNumber?: number;
}

function viewOf(
  doc: { _id: unknown; createdAt?: Date },
  input: NotificationInput,
  ticketNumber: number | undefined,
): NotificationView {
  return {
    id: String(doc._id),
    type: input.type,
    title: input.title,
    ...(input.body ? { body: input.body } : {}),
    ...(input.ticketId ? { ticketId: String(input.ticketId) } : {}),
    ...(ticketNumber ? { ticketNumber } : {}),
    ...(input.workOrderId ? { workOrderId: String(input.workOrderId) } : {}),
    ...(input.workOrderNumber ? { workOrderNumber: input.workOrderNumber } : {}),
    ...(input.sparePartId ? { sparePartId: String(input.sparePartId) } : {}),
    ...(input.sparePartNumber ? { sparePartNumber: input.sparePartNumber } : {}),
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
  };
}

export async function notify(
  userIds: readonly (string | Types.ObjectId)[],
  input: NotificationInput,
): Promise<void> {
  const unique = [...new Set(userIds.map(String))];
  if (!unique.length) return;

  const created = await Notification.insertMany(
    unique.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      ...(input.body ? { body: input.body } : {}),
      ...(input.ticketId ? { ticketId: input.ticketId } : {}),
      ...(input.workOrderId ? { workOrderId: input.workOrderId } : {}),
      ...(input.sparePartId ? { sparePartId: input.sparePartId } : {}),
    })),
  );

  let ticketNumber = input.ticketNumber;
  if (ticketNumber === undefined && input.ticketId) {
    const ticket = await Ticket.findById(input.ticketId).select("number").lean();
    ticketNumber = ticket?.number;
  }

  for (const doc of created) {
    emitNotification(String(doc.userId), viewOf(doc, input, ticketNumber));
  }
}

/** Quién vigila un área: sus supervisores. Sin ellos, el administrador. */
export async function supervisorsOf(areaId: string | Types.ObjectId): Promise<string[]> {
  const supervisors = await User.find({
    areaId: String(areaId),
    isAreaSupervisor: true,
    status: "active",
  })
    .select("_id")
    .lean();
  if (supervisors.length) return supervisors.map((user) => String(user._id));

  const admins = await User.find({ role: "admin", status: "active" }).select("_id").lean();
  return admins.map((user) => String(user._id));
}

/**
 * Una persona ausente no recibe los avisos masivos del área (spec §7.7); los
 * dirigidos a ella personalmente sí le llegan, para que los encuentre al volver.
 */
export async function availableAmong(userIds: readonly string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const available = await User.find({
    _id: { $in: userIds },
    status: "active",
    "availability.state": { $ne: "away" },
  })
    .select("_id")
    .lean();
  return available.map((user) => String(user._id));
}

/** Miembros activos del área, sin contar a quien provoca el aviso. */
export async function areaMembersExcept(
  areaId: string | Types.ObjectId,
  excludeIds: readonly string[],
): Promise<string[]> {
  const members = await User.find({ areaId: String(areaId), status: "active" })
    .select("_id")
    .lean();
  const excluded = new Set(excludeIds.map(String));
  return members.map((user) => String(user._id)).filter((id) => !excluded.has(id));
}
