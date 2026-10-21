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
import { Asset, SparePart, WorkOrder } from "../../models/maintenance.models";
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
  // Lo mismo para los avisos del módulo 2 que llevan a una orden de trabajo.
  const orderIds = [...new Set(items.filter((item) => item.workOrderId).map((item) => item.workOrderId))];
  const orders = orderIds.length
    ? await WorkOrder.find({ _id: { $in: orderIds } })
        .select("number")
        .lean()
    : [];
  const orderNumbers = new Map(orders.map((order) => [String(order._id), order.number]));
  const partIds = [...new Set(items.filter((item) => item.sparePartId).map((item) => item.sparePartId))];
  const parts = partIds.length
    ? await SparePart.find({ _id: { $in: partIds } })
        .select("number")
        .lean()
    : [];
  const partNumbers = new Map(parts.map((part) => [String(part._id), part.number]));
  const assetIds = [...new Set(items.filter((item) => item.assetId).map((item) => item.assetId))];
  const assets = assetIds.length
    ? await Asset.find({ _id: { $in: assetIds } })
        .select("number")
        .lean()
    : [];
  const assetNumbers = new Map(assets.map((asset) => [String(asset._id), asset.number]));

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
      ...(item.workOrderId && orderNumbers.has(String(item.workOrderId))
        ? { workOrderId: String(item.workOrderId), workOrderNumber: orderNumbers.get(String(item.workOrderId))! }
        : {}),
      ...(item.sparePartId && partNumbers.has(String(item.sparePartId))
        ? { sparePartId: String(item.sparePartId), sparePartNumber: partNumbers.get(String(item.sparePartId))! }
        : {}),
      ...(item.assetId && assetNumbers.has(String(item.assetId))
        ? { assetId: String(item.assetId), assetNumber: assetNumbers.get(String(item.assetId))! }
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
