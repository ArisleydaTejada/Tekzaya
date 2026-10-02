import {
  markNotificationsInput,
  paginationQuery,
  type MarkNotificationsInput,
  type NotificationListResponse,
  type NotificationType,
  type PaginationQuery,
} from "@tekzaya/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { validateBody, validateQuery } from "../../middleware/validate";
import { Notification } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";

const router = Router();

/**
 * La bandeja es estrictamente personal: el filtro por `userId` del actor no es
 * un criterio de búsqueda que el cliente pueda cambiar, es el alcance entero de
 * la consulta. No hay parámetro para ver la de otra persona.
 */
router.get("/notifications", validateQuery(paginationQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as PaginationQuery;

  const [items, total, unread] = await Promise.all([
    Notification.find({ userId: actor.id })
      .sort({ createdAt: -1, _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Notification.countDocuments({ userId: actor.id }),
    Notification.countDocuments({ userId: actor.id, readAt: { $exists: false } }),
  ]);

  // Una consulta para los números de todos los tickets de la página: la campana
  // enlaza por número, que es lo que la gente reconoce y comparte.
  const ticketIds = [...new Set(items.filter((item) => item.ticketId).map((item) => item.ticketId))];
  const tickets = ticketIds.length
    ? await Ticket.find({ _id: { $in: ticketIds } })
        .select("number")
        .lean()
    : [];
  const numbers = new Map(tickets.map((ticket) => [String(ticket._id), ticket.number!]));

  const response: NotificationListResponse = {
    items: items.map((item) => ({
      id: String(item._id),
      type: item.type as NotificationType,
      title: item.title!,
      ...(item.body ? { body: item.body } : {}),
      ...(item.ticketId ? { ticketId: String(item.ticketId) } : {}),
      ...(item.ticketId && numbers.has(String(item.ticketId))
        ? { ticketNumber: numbers.get(String(item.ticketId))! }
        : {}),
      ...(item.readAt ? { readAt: item.readAt.toISOString() } : {}),
      createdAt: item.createdAt!.toISOString(),
    })),
    total,
    page: query.page,
    limit: query.limit,
    unread,
  };

  res.json(response);
});

/** Marcar como leídas. Nunca se borran: un aviso leído sigue siendo historial. */
router.patch("/notifications", validateBody(markNotificationsInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as MarkNotificationsInput;

  const filter: Record<string, unknown> = { userId: actor.id, readAt: { $exists: false } };
  if (!input.all) {
    filter["_id"] = { $in: input.ids!.map((id) => new Types.ObjectId(id)) };
  }

  const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  const unread = await Notification.countDocuments({
    userId: actor.id,
    readAt: { $exists: false },
  });

  res.json({ marked: result.modifiedCount, unread });
});

export default router;
