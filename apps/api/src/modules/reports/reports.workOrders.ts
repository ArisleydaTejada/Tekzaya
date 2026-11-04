import {
  emptyWorkOrderStatusCounts,
  FINAL_WORK_ORDER_STATUSES,
  type Actor,
  type ReportWorkOrdersQuery,
  type ReportWorkOrdersResponse,
  type StatsRange,
  type WorkOrderStatus,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { WorkOrder } from "../../models/maintenance.models";
import { windowOf } from "../stats/stats.period";
import { workOrderScopeFilter, type LeanWorkOrder } from "../workOrders/workOrder.access";
import { hydrateWorkOrders, toWorkOrderListItem } from "../workOrders/workOrder.view";
import type { ResolvedScope } from "./reports.scope";

const oid = (value: string) => new Types.ObjectId(value);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SORT_FIELDS: Record<ReportWorkOrdersQuery["sort"], string> = {
  number: "number",
  status: "status",
  scheduledFor: "scheduledFor",
  cost: "costTotal",
  updatedAt: "updatedAt",
};

/**
 * Las órdenes que **tocaron** la ventana: creadas, completadas o canceladas dentro,
 * y las que siguen abiertas al cerrarla. Es el mismo criterio con el que las
 * gráficas de mantenimiento cargan sus órdenes, así la lista explica las cifras.
 *
 * El techo es doble: el alcance del reporte (área o persona) y lo que la sesión
 * puede abrir en la lista de órdenes, para que una fila nunca lleve a un 404.
 */
function filterFor(
  query: ReportWorkOrdersQuery,
  scope: ResolvedScope,
  range: StatsRange,
  actor: Actor,
  withStatus = true,
) {
  const { from, to } = windowOf(range);
  const and: Record<string, unknown>[] = [
    workOrderScopeFilter(actor),
    { createdAt: { $lt: to } },
    {
      $or: [
        { createdAt: { $gte: from } },
        { completedAt: { $gte: from } },
        { cancelledAt: { $gte: from } },
        { status: { $nin: [...FINAL_WORK_ORDER_STATUSES] } },
      ],
    },
  ];
  if (scope.scope === "area" && scope.areaId) and.push({ areaId: oid(scope.areaId) });
  if ((scope.scope === "me" || scope.scope === "user") && scope.userId) {
    and.push({ assigneeIds: oid(scope.userId) });
  }
  if (withStatus && query.status) and.push({ status: { $in: query.status } });
  if (query.type) and.push({ type: query.type });
  if (query.q) {
    const number = /^(?:OT-)?(\d{1,9})$/i.exec(query.q)?.[1];
    and.push({
      $or: [...(number ? [{ number: Number(number) }] : []), { title: new RegExp(escapeRegex(query.q), "i") }],
    });
  }
  return { $and: and };
}

export async function listWorkOrdersOfPeriod(
  query: ReportWorkOrdersQuery,
  scope: ResolvedScope,
  range: StatsRange,
  actor: Actor,
): Promise<ReportWorkOrdersResponse> {
  const filter = filterFor(query, scope, range, actor);
  const direction = query.dir === "desc" ? -1 : 1;
  const [items, total, counts] = await Promise.all([
    WorkOrder.find(filter)
      .sort({ [SORT_FIELDS[query.sort]]: direction, _id: direction })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean() as Promise<LeanWorkOrder[]>,
    WorkOrder.countDocuments(filter),
    WorkOrder.aggregate<{ _id: WorkOrderStatus; count: number }>([
      { $match: filterFor(query, scope, range, actor, false) },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts = emptyWorkOrderStatusCounts();
  for (const row of counts) statusCounts[row._id] = row.count;
  const h = await hydrateWorkOrders(items);

  return {
    items: items.map((order) => toWorkOrderListItem(order, h)),
    total,
    page: query.page,
    limit: query.limit,
    statusCounts,
    currency: h.currency,
    range,
    scope: scope.scope,
  };
}
