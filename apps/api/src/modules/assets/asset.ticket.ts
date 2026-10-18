import {
  canCreateWorkOrder,
  canLinkAssetToTicket,
  canLinkAssetsOnTicket,
  canViewAsset,
  canViewAssetDetails,
  canViewWorkOrder,
  FINAL_WORK_ORDER_STATUSES,
  formatAssetNumber,
  isSettledStatus,
  type Actor,
  type TicketAsset,
  type TicketRef,
  type TicketWorkOrderRef,
  type WorkOrderStatus,
  type WorkOrderType,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Area } from "../../models/area.model";
import { Asset, AssetEvent, WorkOrder } from "../../models/maintenance.models";
import { refOf, type LeanTicket } from "../tickets/ticket.access";
import { assetRefOf, type LeanAsset } from "./asset.access";

/** Averías que muestra la tarjeta del equipo en el ticket. */
const RECENT_FAILURES = 3;

/** "ACT-0012 · Laptop de Vito": cómo se nombra el equipo en la conversación. */
export const assetLabel = (asset: Pick<LeanAsset, "number" | "name">): string =>
  `${formatAssetNumber(asset.number)} · ${asset.name}`;

/** Órdenes del ticket que siguen abiertas: mientras haya una, no se abre otra. */
export const openOrdersOf = (ticketId: Types.ObjectId) => ({
  ticketId,
  status: { $nin: [...FINAL_WORK_ORDER_STATUSES] },
});

/**
 * El equipo que se quiere vincular, ya comprobado. Lo que quien vincula no puede
 * ver se trata como inexistente (422, igual que un área que no existe), y un
 * equipo dado de baja ya no recibe averías.
 */
export async function loadLinkableAsset(assetId: string, actor: Actor, ticket: TicketRef): Promise<LeanAsset> {
  const asset = Types.ObjectId.isValid(assetId)
    ? ((await Asset.findById(assetId).lean()) as LeanAsset | null)
    : null;
  if (!asset || !canViewAsset(actor, assetRefOf(asset))) {
    throw new AppError(422, "validation_error", "Ese equipo no existe");
  }
  if (asset.status === "retired") {
    throw new AppError(422, "validation_error", "Ese equipo está dado de baja");
  }
  if (!canLinkAssetToTicket(actor, assetRefOf(asset), ticket)) {
    throw new AppError(
      403,
      "forbidden",
      "Solo puedes vincular un equipo que usas, o uno que mantiene tu área en un ticket que atiendes",
    );
  }
  return asset;
}

export interface TicketMaintenance {
  asset?: TicketAsset;
  workOrders?: TicketWorkOrderRef[];
  linkAsset: boolean;
  createWorkOrder: boolean;
}

/**
 * Lo del módulo 2 que muestra el detalle del ticket: la tarjeta del equipo, las
 * OT que salieron de él y los dos permisos. Sin equipo vinculado no cuesta más
 * que una consulta, y solo si el ticket tuvo órdenes.
 */
export async function maintenanceOfTicket(ticket: LeanTicket, actor: Actor): Promise<TicketMaintenance> {
  const ref = refOf(ticket);
  const settled = isSettledStatus(ref.status);
  const orderIds = (ticket["workOrderIds"] as Types.ObjectId[] | undefined) ?? [];

  const [asset, orders] = await Promise.all([
    ticket["assetId"] ? (Asset.findById(ticket["assetId"]).lean() as Promise<LeanAsset | null>) : null,
    orderIds.length
      ? WorkOrder.find({ _id: { $in: orderIds } })
          .select("number type status title areaId assigneeIds createdAt")
          .sort({ createdAt: 1 })
          .lean()
      : [],
  ]);
  const assetRef = asset ? assetRefOf(asset) : undefined;
  const hasOpenOrder = orders.some(
    (order) => !(FINAL_WORK_ORDER_STATUSES as readonly string[]).includes(order.status!),
  );

  // El equipo no se cambia una vez abierta una OT: la falla ya quedó en su historia.
  const linkAsset =
    !settled &&
    orders.length === 0 &&
    canLinkAssetsOnTicket(actor, ref) &&
    (!assetRef || canLinkAssetToTicket(actor, assetRef, ref));
  const createWorkOrder =
    !settled &&
    !hasOpenOrder &&
    Boolean(asset && asset.status !== "retired" && canCreateWorkOrder(actor, assetRef!));

  const visibleOrders = orders.filter((order) =>
    canViewWorkOrder(actor, {
      areaId: String(order.areaId),
      assigneeIds: (order.assigneeIds ?? []).map(String),
    }),
  );

  return {
    ...(asset ? { asset: await toTicketAsset(asset, actor) } : {}),
    ...(visibleOrders.length
      ? {
          workOrders: visibleOrders.map((order) => ({
            id: String(order._id),
            number: order.number!,
            type: order.type as WorkOrderType,
            status: order.status as WorkOrderStatus,
            title: order.title!,
            createdAt: (order.createdAt as Date).toISOString(),
          })),
        }
      : {}),
    linkAsset,
    createWorkOrder,
  };
}

async function toTicketAsset(asset: LeanAsset, actor: Actor): Promise<TicketAsset> {
  const ref = assetRefOf(asset);
  const area = await Area.findById(asset.areaId).select("name color").lean();

  let recentFailures: TicketAsset["recentFailures"];
  if (canViewAssetDetails(actor, ref)) {
    const failures = await AssetEvent.find({ assetId: asset._id, kind: "failure" })
      .sort({ at: -1, _id: -1 })
      .limit(RECENT_FAILURES)
      .lean();
    const orders = await WorkOrder.find({ _id: { $in: failures.map((event) => event.workOrderId) } })
      .select("number status")
      .lean();
    const orderById = new Map(orders.map((order) => [String(order._id), order]));
    recentFailures = failures.map((event) => {
      const order = event.workOrderId ? orderById.get(String(event.workOrderId)) : undefined;
      const title = (event.data as Record<string, unknown> | undefined)?.["title"];
      return {
        at: event.at.toISOString(),
        title: typeof title === "string" && title ? title : "Falla",
        ...(order
          ? { workOrder: { id: String(order._id), number: order.number!, status: order.status as WorkOrderStatus } }
          : {}),
      };
    });
  }

  return {
    id: String(asset._id),
    number: asset.number,
    name: asset.name,
    type: asset.type as TicketAsset["type"],
    status: asset.status as TicketAsset["status"],
    location: asset.location,
    area: area
      ? { id: String(area._id), name: area.name!, color: area.color! }
      : { id: String(asset.areaId), name: "Área eliminada", color: "#7c8cae" },
    // El solicitante ve el equipo que vincularon a su ticket aunque no sea suyo
    // (un técnico pudo señalar otro), pero solo abre la ficha si puede verla.
    canOpen: canViewAsset(actor, ref),
    ...(recentFailures ? { recentFailures } : {}),
  };
}
