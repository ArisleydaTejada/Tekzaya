import {
  canAssignWorkOrder,
  canManageAsset,
  canTakeWorkOrder,
  canWorkOnWorkOrder,
  isFinalWorkOrderStatus,
  isWorkOrderOverdue,
  workOrderCost,
  type Actor,
  type AreaRef,
  type AssetPerson,
  type PartUnit,
  type WorkOrderAssetRef,
  type WorkOrderDetail,
  type WorkOrderListItem,
} from "@tekzaya/shared";
import type { Types } from "mongoose";
import { Area } from "../../models/area.model";
import { Asset, MaintenancePlan, SparePart } from "../../models/maintenance.models";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { getSettings } from "../settings/settings.service";
import { todayKey } from "../assets/asset.view";
import { workOrderRefOf, type LeanWorkOrder } from "./workOrder.access";

/** Lo que una tanda de OT necesita para leerse: equipos, áreas, personas y tickets. */
export interface WorkOrderHydration {
  assets: Map<string, WorkOrderAssetRef & { areaId: string; usedByAreaId?: string; custodianId?: string }>;
  areas: Map<string, AreaRef>;
  people: Map<string, AssetPerson>;
  tickets: Map<string, { id: string; number: number; title: string }>;
  parts: Map<string, { id: string; number: number; name: string; unit: PartUnit }>;
  /** Existencias de hoy de los repuestos requeridos: si alcanza o no se decide al mirar. */
  stock: Map<string, number>;
  plans: Map<string, { id: string; title: string }>;
  today: string;
  currency: string;
}

const ids = (values: readonly unknown[]) => [...new Set(values.filter(Boolean).map(String))];

export async function hydrateWorkOrders(
  orders: readonly LeanWorkOrder[],
  { full = false }: { full?: boolean } = {},
): Promise<WorkOrderHydration> {
  const userIds = orders.flatMap((order) => [
    ...order.assigneeIds,
    ...(full
      ? [
          order.createdById,
          ...order.statusHistory.map((step) => step.byId),
        ]
      : []),
  ]);
  const [assets, areas, people, tickets, parts, plans, settings] = await Promise.all([
    Asset.find({ _id: { $in: ids(orders.map((order) => order.assetId)) } })
      .select("number name type status location areaId usedByAreaId custodianId")
      .lean(),
    Area.find({ _id: { $in: ids(orders.map((order) => order.areaId)) } }).select("name color").lean(),
    User.find({ _id: { $in: ids(userIds) } }).select("name avatarUrl areaId").lean(),
    Ticket.find({ _id: { $in: ids(orders.map((order) => order.ticketId)) } }).select("number title").lean(),
    full
      ? SparePart.find({
          _id: {
            $in: ids(
              orders.flatMap((order) => [
                ...order.partsUsed.map((use) => use.partId),
                ...(order.requiredParts ?? []).map((item) => item.partId),
              ]),
            ),
          },
        })
          .select("number name unit stock")
          .lean()
      : [],
    full
      ? MaintenancePlan.find({ _id: { $in: ids(orders.map((order) => order.planId)) } }).select("title").lean()
      : [],
    getSettings(),
  ]);

  return {
    assets: new Map(
      assets.map((asset) => [
        String(asset._id),
        {
          id: String(asset._id),
          number: asset.number,
          name: asset.name,
          type: asset.type as WorkOrderAssetRef["type"],
          status: asset.status as WorkOrderAssetRef["status"],
          location: asset.location,
          areaId: String(asset.areaId),
          ...(asset.usedByAreaId ? { usedByAreaId: String(asset.usedByAreaId) } : {}),
          ...(asset.custodianId ? { custodianId: String(asset.custodianId) } : {}),
        },
      ]),
    ),
    areas: new Map(areas.map((area) => [String(area._id), { id: String(area._id), name: area.name!, color: area.color! }])),
    people: new Map(
      people.map((person) => [
        String(person._id),
        {
          id: String(person._id),
          name: person.name!,
          ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
          areaId: String(person.areaId),
        },
      ]),
    ),
    tickets: new Map(
      tickets.map((ticket) => [String(ticket._id), { id: String(ticket._id), number: ticket.number!, title: ticket.title! }]),
    ),
    parts: new Map(
      (parts as { _id: Types.ObjectId; number: number; name: string; unit: string }[]).map((part) => [
        String(part._id),
        { id: String(part._id), number: part.number, name: part.name, unit: part.unit as PartUnit },
      ]),
    ),
    stock: new Map((parts as { _id: Types.ObjectId; stock: number }[]).map((part) => [String(part._id), part.stock])),
    plans: new Map(
      (plans as { _id: Types.ObjectId; title: string }[]).map((plan) => [
        String(plan._id),
        { id: String(plan._id), title: plan.title },
      ]),
    ),
    today: todayKey(settings.businessHours.timezone),
    currency: settings.maintenance.currency,
  };
}

const unknownArea = (id: unknown): AreaRef => ({ id: String(id), name: "Área eliminada", color: "#7c8cae" });
const unknownPerson = (id: unknown): AssetPerson => ({ id: String(id), name: "Persona eliminada", areaId: String(id) });

function assetOf(order: LeanWorkOrder, h: WorkOrderHydration): WorkOrderAssetRef {
  const asset = h.assets.get(String(order.assetId));
  if (!asset) {
    return { id: String(order.assetId), number: 1, name: "Equipo eliminado", type: "other", status: "retired", location: "—" };
  }
  const { areaId: _area, usedByAreaId: _used, custodianId: _custodian, ...ref } = asset;
  return ref;
}

export function toWorkOrderListItem(order: LeanWorkOrder, h: WorkOrderHydration): WorkOrderListItem {
  const ticket = order.ticketId ? h.tickets.get(String(order.ticketId)) : undefined;
  return {
    id: String(order._id),
    number: order.number,
    type: order.type,
    title: order.title,
    status: order.status,
    ...(order.holdReason ? { holdReason: order.holdReason } : {}),
    asset: assetOf(order, h),
    area: h.areas.get(String(order.areaId)) ?? unknownArea(order.areaId),
    assignees: order.assigneeIds.map((id) => h.people.get(String(id)) ?? unknownPerson(id)),
    ...(ticket ? { ticket: { id: ticket.id, number: ticket.number } } : {}),
    ...(order.scheduledFor ? { scheduledFor: order.scheduledFor } : {}),
    overdue: isWorkOrderOverdue({ ...order, scheduledFor: order.scheduledFor ?? undefined }, h.today),
    outOfService: order.outOfService,
    costTotal: order.costTotal,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * La OT completa para quien puede verla. Ver una OT ya es ver sus costos: el
 * empleado no llega aquí (404), y RRHH la lee sin ningún permiso de acción.
 */
export function toWorkOrderDetail(order: LeanWorkOrder, h: WorkOrderHydration, actor: Actor): WorkOrderDetail {
  const ref = workOrderRefOf(order);
  const open = !isFinalWorkOrderStatus(order.status);
  const person = (id: unknown) => h.people.get(String(id)) ?? unknownPerson(id);
  const asset = h.assets.get(String(order.assetId));
  const ticket = order.ticketId ? h.tickets.get(String(order.ticketId)) : undefined;
  const plan = order.planId ? h.plans.get(String(order.planId)) : undefined;
  const cost = workOrderCost(order);
  const partRef = (id: Types.ObjectId) =>
    h.parts.get(String(id)) ?? { id: String(id), number: 1, name: "Repuesto eliminado", unit: "unit" as const };

  return {
    id: String(order._id),
    number: order.number,
    type: order.type,
    title: order.title,
    ...(order.description ? { description: order.description } : {}),
    assetId: String(order.assetId),
    asset: assetOf(order, h),
    areaId: String(order.areaId),
    area: h.areas.get(String(order.areaId)) ?? unknownArea(order.areaId),
    ...(order.ticketId ? { ticketId: String(order.ticketId) } : {}),
    ...(ticket ? { ticket } : {}),
    ...(order.planId ? { planId: String(order.planId) } : {}),
    ...(plan ? { plan } : {}),
    status: order.status,
    ...(order.holdReason ? { holdReason: order.holdReason } : {}),
    assignees: order.assigneeIds.map(person),
    ...(order.scheduledFor ? { scheduledFor: order.scheduledFor } : {}),
    outOfService: order.outOfService,
    checklist: order.checklist.map((item) => ({ label: item.label, done: item.done })),
    partsUsed: order.partsUsed.map((use) => ({
      id: String(use._id),
      part: partRef(use.partId),
      qty: use.qty,
      unitCost: use.unitCost,
      at: use.at.toISOString(),
    })),
    requiredParts: (order.requiredParts ?? []).map((item) => ({
      id: String(item._id),
      part: partRef(item.partId),
      qty: item.qty,
      stock: h.stock.get(String(item.partId)) ?? 0,
      used: order.partsUsed
        .filter((use) => String(use.partId) === String(item.partId))
        .reduce((sum, use) => sum + use.qty, 0),
    })),
    externalCosts: order.externalCosts.map((item) => ({
      id: String(item._id),
      vendor: item.vendor,
      ...(item.description ? { description: item.description } : {}),
      pricing: item.pricing ?? "total",
      ...(item.minutes ? { minutes: item.minutes } : {}),
      ...(item.hourlyRate ? { hourlyRate: item.hourlyRate } : {}),
      amount: item.amount,
      ...(item.attachmentId ? { attachmentId: String(item.attachmentId) } : {}),
      at: item.at.toISOString(),
    })),
    costTotal: order.costTotal,
    cost,
    currency: h.currency,
    ...(order.completionNotes ? { completionNotes: order.completionNotes } : {}),
    ...(order.startedAt ? { startedAt: order.startedAt.toISOString() } : {}),
    ...(order.completedAt ? { completedAt: order.completedAt.toISOString() } : {}),
    ...(order.cancelledAt ? { cancelledAt: order.cancelledAt.toISOString() } : {}),
    overdue: isWorkOrderOverdue({ ...order, scheduledFor: order.scheduledFor ?? undefined }, h.today),
    history: order.statusHistory.map((step) => ({
      status: step.status,
      at: step.at.toISOString(),
      ...(step.byId ? { by: person(step.byId) } : {}),
      ...(step.reason ? { reason: step.reason } : {}),
    })),
    ...(order.createdById ? { createdBy: person(order.createdById) } : {}),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    permissions: {
      take: open && !ref.assigneeIds.includes(actor.id) && canTakeWorkOrder(actor, ref),
      work: open && canWorkOnWorkOrder(actor, ref),
      assign: open && canAssignWorkOrder(actor, ref),
      retireAsset: open && Boolean(asset) && canManageAsset(actor, { areaId: asset!.areaId }),
    },
  };
}
