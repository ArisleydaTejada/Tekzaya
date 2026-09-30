import type { Types } from "mongoose";
import { Notification } from "../../models/support.models";
import { User } from "../../models/user.model";

/**
 * Las notificaciones se guardan desde F4 aunque la bandeja y el tiempo real
 * lleguen en F6: un aviso que no se escribió cuando ocurrió el hecho ya no se
 * puede recuperar después.
 */
export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  ticketId?: Types.ObjectId;
}

export async function notify(
  userIds: readonly (string | Types.ObjectId)[],
  input: NotificationInput,
): Promise<void> {
  const unique = [...new Set(userIds.map(String))];
  if (!unique.length) return;

  await Notification.insertMany(
    unique.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      ...(input.body ? { body: input.body } : {}),
      ...(input.ticketId ? { ticketId: input.ticketId } : {}),
    })),
  );
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
