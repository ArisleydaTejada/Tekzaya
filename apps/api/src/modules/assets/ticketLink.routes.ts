import {
  assetPickerQuery,
  canCreateWorkOrder,
  canLinkAssetToTicket,
  canLinkAssetsOnTicket,
  createWorkOrderFromTicketInput,
  formatWorkOrderNumber,
  isAdmin,
  isAreaMember,
  isOwnTicket,
  isSettledStatus,
  linkTicketAssetInput,
  type Actor,
  type AssetPickerItem,
  type AssetPickerQuery,
  type CreateWorkOrderFromTicketInput,
  type LinkTicketAssetInput,
  type TicketRef,
} from "@tekzaya/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { validateBody, validateQuery } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { nextNumber } from "../../models/counter.model";
import { Asset, AssetEvent, WorkOrder } from "../../models/maintenance.models";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { idOf, loadVisibleTicket, refOf, routeParam, type LeanTicket, type TicketDoc } from "../tickets/ticket.access";
import { recordSystemEvent } from "../tickets/ticket.lifecycle";
import { broadcastTicket } from "../tickets/ticket.notify";
import { hydrate, toDetail } from "../tickets/ticket.view";
import { assetRefOf, type LeanAsset } from "./asset.access";
import { assetLabel, loadLinkableAsset, openOrdersOf } from "./asset.ticket";

/**
 * Plan A2: el puente entre tickets y activos. Vincular el equipo afectado,
 * elegirlo de una lista pensada para quien reporta, y convertir el ticket en una
 * orden de trabajo correctiva, que es cuando la falla entra en la historia del
 * equipo.
 */
const router = Router();

const oid = (value: string) => new Types.ObjectId(value);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const plainOf = (ticket: TicketDoc): LeanTicket => ticket.toObject() as LeanTicket;

async function detailOf(ticket: TicketDoc, actor: Actor) {
  const plain = plainOf(ticket);
  return toDetail(plain, await hydrate([plain]), actor);
}

// ── Selector de equipos ───────────────────────────────────────

/** Opciones por respuesta: es un selector con búsqueda, no un inventario. */
const PICKER_LIMIT = 30;

/**
 * `canLinkAssetToTicket` escrito como consulta: lo que sale de aquí es
 * exactamente lo que el servidor aceptará al vincular. `null` es que no puede
 * vincular nada en este ticket.
 */
function linkableFilter(actor: Actor, ticket: TicketRef): Record<string, unknown> | null {
  if (isAdmin(actor)) return {};
  const areaId = oid(actor.areaId);
  if (isOwnTicket(actor, ticket)) {
    return { $or: [{ areaId }, { usedByAreaId: areaId }, { custodianId: oid(actor.id) }] };
  }
  return isAreaMember(actor, ticket.areaId) ? { areaId } : null;
}

/**
 * Equipos para "Vincular un equipo", agrupados para la persona que reporta:
 * primero los que tiene a su cargo, luego los que usa su área y, al final, el
 * resto de lo que quien vincula puede vincular. Los dados de baja no salen.
 */
router.get("/assets/link-options", validateQuery(assetPickerQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as AssetPickerQuery;

  let ticket: TicketRef = {
    areaId: actor.areaId,
    requesterId: actor.id,
    createdById: actor.id,
    assigneeIds: [],
    status: "open",
  };
  if (query.ticketId) ticket = refOf(plainOf(await loadVisibleTicket(query.ticketId, actor)));

  const person = await User.findById(ticket.requesterId).select("name areaId").lean();
  const personView = { id: ticket.requesterId, name: person?.name ?? "Solicitante" };
  const linkable = linkableFilter(actor, ticket);
  if (!linkable || !person) {
    res.json({ person: personView, items: [] });
    return;
  }

  const and: Record<string, unknown>[] = [linkable, { status: { $ne: "retired" } }];
  if (query.q) {
    const number = /^(?:ACT-)?(\d{1,9})$/i.exec(query.q)?.[1];
    const pattern = new RegExp(escapeRegex(query.q), "i");
    and.push({
      $or: [
        ...(number ? [{ number: Number(number) }] : []),
        { name: pattern },
        { brand: pattern },
        { model: pattern },
        { serial: pattern },
        { location: pattern },
      ],
    });
  }

  // Lo de la persona: lo que tiene a cargo y lo que usa su área (si nadie más
  // lo usa, el área que lo usa es la responsable).
  const personAreaId = person.areaId as Types.ObjectId;
  const theirs = [
    { custodianId: oid(ticket.requesterId) },
    { usedByAreaId: personAreaId },
    { areaId: personAreaId, usedByAreaId: null },
  ];
  const first = (await Asset.find({ $and: [...and, { $or: theirs }] })
    .sort({ name: 1, number: 1 })
    .limit(PICKER_LIMIT)
    .lean()) as LeanAsset[];
  const rest = (await Asset.find({ $and: [...and, { $nor: theirs }] })
    .sort({ name: 1, number: 1 })
    .limit(PICKER_LIMIT - first.length)
    .lean()) as LeanAsset[];

  const areas = await Area.find({ _id: { $in: [...first, ...rest].map((asset) => asset.areaId) } })
    .select("name color")
    .lean();
  const areaById = new Map(areas.map((area) => [String(area._id), { id: String(area._id), name: area.name!, color: area.color! }]));

  const toItem = (asset: LeanAsset, group: AssetPickerItem["group"]): AssetPickerItem => ({
    id: String(asset._id),
    number: asset.number,
    name: asset.name,
    type: asset.type as AssetPickerItem["type"],
    status: asset.status as AssetPickerItem["status"],
    location: asset.location,
    area: areaById.get(String(asset.areaId)) ?? { id: String(asset.areaId), name: "Área eliminada", color: "#7c8cae" },
    group,
  });
  const isCustodian = (asset: LeanAsset) => String(asset.custodianId ?? "") === ticket.requesterId;

  res.json({
    person: personView,
    items: [
      ...first.filter(isCustodian).map((asset) => toItem(asset, "custodian")),
      ...first.filter((asset) => !isCustodian(asset)).map((asset) => toItem(asset, "area")),
      ...rest.map((asset) => toItem(asset, "other")),
    ],
  });
});

// ── Vincular el equipo a un ticket ya creado ──────────────────

/**
 * Vincula, cambia o quita (`assetId: null`) el equipo afectado. Una vez abierta
 * una OT ya no se toca: la falla quedó escrita en la historia de ese equipo.
 */
router.patch("/tickets/:id/asset", validateBody(linkTicketAssetInput), async (req, res) => {
  const actor = res.locals.actor;
  const { assetId } = req.body as LinkTicketAssetInput;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const plain = plainOf(ticket);
  const ref = refOf(plain);

  if (!canLinkAssetsOnTicket(actor, ref)) {
    throw new AppError(403, "forbidden", "Solo el solicitante o el área que lo atiende vinculan un equipo");
  }
  if (isSettledStatus(ref.status)) {
    throw new AppError(409, "ticket_closed", "Este ticket ya terminó; reábrelo para cambiar el equipo");
  }
  if (((plain["workOrderIds"] as unknown[] | undefined) ?? []).length) {
    throw new AppError(409, "work_order_exists", "El ticket ya tiene una orden de trabajo: el equipo ya no se cambia");
  }

  const currentId = plain["assetId"] ? String(plain["assetId"]) : null;
  if (currentId === assetId) {
    res.json(await detailOf(ticket, actor));
    return;
  }
  const current = currentId ? ((await Asset.findById(currentId).lean()) as LeanAsset | null) : null;
  if (current && !canLinkAssetToTicket(actor, assetRefOf(current), ref)) {
    throw new AppError(403, "forbidden", "Ese equipo lo vinculó el área que lo mantiene; solo ella puede cambiarlo");
  }
  const next = assetId ? await loadLinkableAsset(assetId, actor, ref) : null;

  const at = new Date();
  ticket.set("assetId", next ? next._id : undefined);
  ticket.set("lastActivityAt", at);
  await ticket.save();
  await recordSystemEvent(
    idOf(ticket),
    next
      ? { kind: "asset_linked", to: assetLabel(next), ...(current ? { from: assetLabel(current) } : {}) }
      : { kind: "asset_unlinked", ...(current ? { from: assetLabel(current) } : {}) },
    at,
  );
  broadcastTicket(ticket);

  res.json(await detailOf(ticket, actor));
});

// ── Convertir en orden de trabajo ─────────────────────────────

/**
 * La falla se registra aquí, no al vincular (plan A2): "mi laptop va lenta"
 * puede no ser una avería, y MTBF no debe inflarse con quejas. El ticket conserva
 * su SLA y su conversación; la OT es la trastienda técnica.
 */
router.post("/tickets/:id/work-order", validateBody(createWorkOrderFromTicketInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as CreateWorkOrderFromTicketInput;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const plain = plainOf(ticket);
  const ref = refOf(plain);

  const asset = plain["assetId"] ? ((await Asset.findById(plain["assetId"]).lean()) as LeanAsset | null) : null;
  if (!asset) {
    throw new AppError(422, "validation_error", "Vincula primero el equipo afectado");
  }
  if (!canCreateWorkOrder(actor, assetRefOf(asset))) {
    throw new AppError(403, "forbidden", "La orden de trabajo la abre el área que mantiene el equipo");
  }
  if (isSettledStatus(ref.status)) {
    throw new AppError(409, "ticket_closed", "Este ticket ya terminó; reábrelo para abrir una orden");
  }
  if (asset.status === "retired") {
    throw new AppError(409, "asset_retired", "El equipo está dado de baja y ya no recibe órdenes");
  }
  if (await WorkOrder.exists(openOrdersOf(idOf(ticket)))) {
    throw new AppError(409, "work_order_open", "Este ticket ya tiene una orden de trabajo abierta");
  }

  // Reservar el hueco en el ticket antes de crear la orden: dos clics a la vez
  // pasan la comprobación de arriba, pero solo uno encuentra la lista como la dejó.
  const orderId = new Types.ObjectId();
  const known = ((plain["workOrderIds"] as Types.ObjectId[] | undefined) ?? []).length;
  const at = new Date();
  const claimed = await Ticket.updateOne(
    { _id: idOf(ticket), workOrderIds: { $size: known } },
    { $push: { workOrderIds: orderId }, $set: { lastActivityAt: at } },
  );
  if (claimed.modifiedCount === 0) {
    throw new AppError(409, "work_order_open", "Este ticket ya tiene una orden de trabajo abierta");
  }

  const number = await nextNumber("work_order");
  const title = input.title ?? String(plain["title"]);
  await WorkOrder.create({
    _id: orderId,
    number,
    type: "corrective",
    title,
    description: input.description || String(plain["description"]),
    assetId: asset._id,
    areaId: asset.areaId,
    ticketId: idOf(ticket),
    status: "pending",
    assigneeIds: [],
    outOfService: input.outOfService,
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
  await AssetEvent.insertMany([
    {
      assetId: asset._id,
      kind: "failure",
      at,
      actorId: actor.id,
      workOrderId: orderId,
      ticketId: idOf(ticket),
      data: { title },
    },
    ...(stopped
      ? [
          {
            assetId: asset._id,
            kind: "status_changed",
            at,
            actorId: actor.id,
            workOrderId: orderId,
            ticketId: idOf(ticket),
            data: { from: "operational", to: "in_repair" },
          },
        ]
      : []),
  ]);

  await recordSystemEvent(idOf(ticket), { kind: "work_order_created", to: formatWorkOrderNumber(number) }, at);
  const updated = (await Ticket.findById(idOf(ticket))) as TicketDoc;
  broadcastTicket(updated);

  res.status(201).json(await detailOf(updated, actor));
});

export default router;
