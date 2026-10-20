import {
  addExternalCostInput,
  addWorkOrderPartInput,
  canAssignWorkOrder,
  canCreateWorkOrder,
  canManageAsset,
  canTakeWorkOrder,
  canViewAsset,
  canWorkOnWorkOrder,
  completeWorkOrderInput,
  createWorkOrderInput,
  emptyWorkOrderStatusCounts,
  FINAL_WORK_ORDER_STATUSES,
  formatWorkOrderNumber,
  hourlyServiceAmount,
  isFinalWorkOrderStatus,
  setWorkOrderAssigneesInput,
  updateWorkOrderInput,
  workOrderListQuery,
  type Actor,
  type AddExternalCostInput,
  type AddWorkOrderPartInput,
  type CompleteWorkOrderInput,
  type CreateWorkOrderInput,
  type PartUnit,
  type SetWorkOrderAssigneesInput,
  type SystemEvent,
  type UpdateWorkOrderInput,
  type WorkOrderListQuery,
  type WorkOrderStatus,
} from "@tekzaya/shared";
import { Router, type Response } from "express";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { validateBody, validateQuery } from "../../middleware/validate";
import { Asset, AssetEvent, MaintenancePlan, SparePart, StockMovement, WorkOrder } from "../../models/maintenance.models";
import { Attachment } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { assetRefOf, type LeanAsset } from "../assets/asset.access";
import { routeParam, type TicketDoc } from "../tickets/ticket.access";
import { recordSystemEvent } from "../tickets/ticket.lifecycle";
import { broadcastTicket } from "../tickets/ticket.notify";
import {
  assertWorkOrderTransition,
  loadVisibleWorkOrder,
  workOrderRefOf,
  workOrderScopeFilter,
  type LeanWorkOrder,
} from "./workOrder.access";
import {
  broadcastWorkOrder,
  notifyWorkOrderAssigned,
  OPEN_WORK_ORDER,
  openWorkOrder,
  refreshCost,
  releaseAsset,
  returnParts,
} from "./workOrder.lifecycle";
import { checkLowStock, shortageMessage, takeStock } from "../spareParts/stock";
import { hydrateWorkOrders, toWorkOrderDetail, toWorkOrderListItem } from "./workOrder.view";

/**
 * Plan A3: órdenes de trabajo. El estado se mueve solo por las transiciones de
 * `WORK_ORDER_TRANSITIONS` (409 para lo demás), y todo lo que se carga a una
 * orden —repuestos y servicios externos— exige que siga abierta: la
 * comprobación va **dentro** de cada actualización, no antes, para que una
 * orden que se completa en paralelo no reciba cargos después de cerrada.
 */
const router = Router();

const oid = (value: string) => new Types.ObjectId(value);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OPEN_STATUS = { $nin: [...FINAL_WORK_ORDER_STATUSES] };

async function sendDetail(res: Response, orderId: Types.ObjectId, actor: Actor, status = 200): Promise<void> {
  const order = (await WorkOrder.findById(orderId).lean()) as LeanWorkOrder;
  res.status(status).json(toWorkOrderDetail(order, await hydrateWorkOrders([order], { full: true }), actor));
}

/** Una orden terminada ya no cambia: rehacer un trabajo es otra OT. */
function assertOpen(order: LeanWorkOrder): void {
  if (isFinalWorkOrderStatus(order.status)) {
    throw new AppError(409, "work_order_closed", "Esta orden ya terminó y no admite cambios");
  }
}

/** Cargarle repuestos o servicios, y mover su estado: quien la atiende o su supervisor. */
function assertCanWork(order: LeanWorkOrder, actor: Actor): void {
  if (!canWorkOnWorkOrder(actor, workOrderRefOf(order))) {
    throw new AppError(403, "forbidden", "Solo quien atiende la orden o su supervisor puede trabajar en ella");
  }
}

/** La orden se cerró o cambió entre la lectura y la escritura. */
const raced = () => new AppError(409, "work_order_changed", "La orden cambió mientras tanto; recarga para ver su estado");

/** Lo que la OT le cuenta a su ticket de origen: el solicitante sigue hablando ahí. */
async function tellTicket(order: LeanWorkOrder, event: SystemEvent, at: Date): Promise<void> {
  if (!order.ticketId) return;
  await recordSystemEvent(order.ticketId, event, at);
  await Ticket.updateOne({ _id: order.ticketId }, { $set: { lastActivityAt: at } });
  const ticket = (await Ticket.findById(order.ticketId)) as TicketDoc | null;
  if (ticket) broadcastTicket(ticket);
}

// ── Lista ─────────────────────────────────────────────────────

async function listFilter(actor: Actor, query: WorkOrderListQuery, withStatus = true) {
  const and: Record<string, unknown>[] = [workOrderScopeFilter(actor)];
  if (query.scope === "mine") and.push({ assigneeIds: oid(actor.id), status: OPEN_STATUS });
  if (query.scope === "unassigned") and.push({ assigneeIds: { $size: 0 }, status: OPEN_STATUS });
  if (withStatus && query.status) and.push({ status: { $in: query.status } });
  if (query.type) and.push({ type: query.type });
  if (query.areaId) and.push({ areaId: oid(query.areaId) });
  if (query.assetId) and.push({ assetId: oid(query.assetId) });
  if (query.assigneeId) and.push({ assigneeIds: oid(query.assigneeId) });

  if (query.q) {
    const orderNumber = /^(?:OT-)?(\d{1,9})$/i.exec(query.q)?.[1];
    const assetNumber = /^ACT-(\d{1,9})$/i.exec(query.q)?.[1];
    const pattern = new RegExp(escapeRegex(query.q), "i");
    const assets = await Asset.find({
      $or: [{ name: pattern }, ...(assetNumber ? [{ number: Number(assetNumber) }] : [])],
    })
      .select("_id")
      .limit(200)
      .lean();
    and.push({
      $or: [
        ...(orderNumber ? [{ number: Number(orderNumber) }] : []),
        { title: pattern },
        { assetId: { $in: assets.map((asset) => asset._id) } },
      ],
    });
  }
  return { $and: and };
}

const SORT_FIELDS: Record<WorkOrderListQuery["sort"], string> = {
  number: "number",
  status: "status",
  scheduledFor: "scheduledFor",
  cost: "costTotal",
  updatedAt: "updatedAt",
};

router.get("/work-orders", validateQuery(workOrderListQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as WorkOrderListQuery;
  const direction = query.dir === "desc" ? -1 : 1;

  const filter = await listFilter(actor, query);
  const [items, total, counts] = await Promise.all([
    WorkOrder.find(filter)
      .sort({ [SORT_FIELDS[query.sort]]: direction, _id: direction })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean() as Promise<LeanWorkOrder[]>,
    WorkOrder.countDocuments(filter),
    WorkOrder.aggregate<{ _id: WorkOrderStatus; count: number }>([
      { $match: await listFilter(actor, query, false) },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts = emptyWorkOrderStatusCounts();
  for (const row of counts) statusCounts[row._id] = row.count;
  const h = await hydrateWorkOrders(items);

  res.json({
    items: items.map((order) => toWorkOrderListItem(order, h)),
    total,
    page: query.page,
    limit: query.limit,
    statusCounts,
    currency: h.currency,
  });
});

// ── Alta sin ticket ───────────────────────────────────────────

/**
 * Una OT que no nace de un ticket: la avería que encuentra el propio técnico,
 * o un preventivo puntual. Los preventivos de un plan los genera el trabajo
 * diario (plan A5).
 */
router.post("/work-orders", validateBody(createWorkOrderInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as CreateWorkOrderInput;

  const asset = (await Asset.findById(input.assetId).lean()) as LeanAsset | null;
  if (!asset || !canViewAsset(actor, assetRefOf(asset))) {
    throw new AppError(422, "validation_error", "Ese equipo no existe");
  }
  if (!canCreateWorkOrder(actor, assetRefOf(asset))) {
    throw new AppError(403, "forbidden", "La orden de trabajo la abre el área que mantiene el equipo");
  }
  if (asset.status === "retired") {
    throw new AppError(409, "asset_retired", "El equipo está dado de baja y ya no recibe órdenes");
  }

  const { id } = await openWorkOrder(
    {
      type: input.type,
      title: input.title,
      description: input.description,
      asset,
      outOfService: input.outOfService,
      ...(input.type === "preventive" && input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
      checklist: input.checklist,
    },
    actor,
    new Date(),
  );
  await broadcastWorkOrder(id);
  await sendDetail(res, id, actor, 201);
});

// ── Ficha ─────────────────────────────────────────────────────

router.get("/work-orders/:id", async (req, res) => {
  const actor = res.locals.actor;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  res.json(toWorkOrderDetail(order, await hydrateWorkOrders([order], { full: true }), actor));
});

/**
 * Editar la descripción y la lista de verificación, y mover el estado: iniciar,
 * poner en espera (con lo que falta), reanudar o cancelar. Completar va aparte
 * porque exige notas; Pendiente y Asignada las decide la asignación.
 */
router.patch("/work-orders/:id", validateBody(updateWorkOrderInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as UpdateWorkOrderInput;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  assertCanWork(order, actor);
  assertOpen(order);

  const at = new Date();
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};
  if (input.title !== undefined) $set["title"] = input.title;
  if (input.description === null) $unset["description"] = "";
  else if (input.description !== undefined) $set["description"] = input.description;
  if (input.checklist) {
    if (input.checklist.length !== order.checklist.length) {
      throw new AppError(422, "validation_error", "La lista de verificación cambió; recarga la orden");
    }
    $set["checklist"] = order.checklist.map((item, index) => ({ label: item.label, done: input.checklist![index] }));
  }

  const next = input.status && input.status !== order.status ? input.status : undefined;
  if (next) {
    assertWorkOrderTransition(order.status, next);
    $set["status"] = next;
    if (next === "in_progress") {
      $unset["holdReason"] = "";
      if (!order.startedAt) $set["startedAt"] = at;
    }
    if (next === "on_hold") $set["holdReason"] = input.holdReason;
    if (next === "cancelled") {
      $set["cancelledAt"] = at;
      $unset["holdReason"] = "";
    }
  } else if (input.status === "on_hold" && input.holdReason !== order.holdReason) {
    // Ya en espera: solo cambia lo que falta.
    $set["holdReason"] = input.holdReason;
  }

  const updated = (await WorkOrder.findOneAndUpdate(
    { _id: order._id, status: order.status },
    {
      ...(Object.keys($set).length ? { $set } : {}),
      ...(Object.keys($unset).length ? { $unset } : {}),
      ...(next
        ? { $push: { statusHistory: { status: next, at, byId: actor.id, ...(input.reason ? { reason: input.reason } : {}) } } }
        : {}),
    },
    { returnDocument: "after" },
  ).lean()) as LeanWorkOrder | null;
  if (!updated) throw raced();

  // Cancelar devuelve lo consumido y, si la orden tenía el equipo parado, lo
  // libera. La falla queda en la historia: nada se borra (plan §2.3).
  if (next === "cancelled") {
    await returnParts(updated, updated.partsUsed, actor, at, `Cancelación de ${formatWorkOrderNumber(order.number)}`);
    await releaseAsset(updated, actor, at);
    await tellTicket(
      order,
      { kind: "work_order_cancelled", to: formatWorkOrderNumber(order.number), ...(input.reason ? { reason: input.reason } : {}) },
      at,
    );
  }

  await broadcastWorkOrder(order._id);
  await sendDetail(res, order._id, actor);
});

// ── Responsables ──────────────────────────────────────────────

/**
 * Técnicos del área para el selector de responsables, con su carga de órdenes
 * abiertas: el supervisor reparte mirando quién está libre, como en los tickets.
 */
router.get("/work-orders/:id/assignee-options", async (req, res) => {
  const actor = res.locals.actor;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  if (!canAssignWorkOrder(actor, workOrderRefOf(order))) {
    throw new AppError(403, "forbidden", "Solo el supervisor del área asigna responsables");
  }
  const people = await User.find({ areaId: order.areaId, status: "active" })
    .select("name avatarUrl areaId availability")
    .sort({ name: 1 })
    .lean();
  const load = await WorkOrder.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { areaId: order.areaId, ...OPEN_WORK_ORDER } },
    { $unwind: "$assigneeIds" },
    { $group: { _id: "$assigneeIds", count: { $sum: 1 } } },
  ]);
  const loadOf = new Map(load.map((row) => [String(row._id), row.count]));
  res.json({
    items: people.map((person) => ({
      id: String(person._id),
      name: person.name!,
      ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
      areaId: String(person.areaId),
      away: person.availability?.state === "away",
      openWorkOrders: loadOf.get(String(person._id)) ?? 0,
    })),
  });
});

/**
 * Pendiente ↔ Asignada la decide tener o no responsables. Una orden ya en curso
 * no se queda sin nadie: alguien tiene que poder trabajar en ella.
 */
function statusForAssignees(current: WorkOrderStatus, count: number): WorkOrderStatus {
  if (count > 0 && current === "pending") return "assigned";
  if (count === 0 && current === "assigned") return "pending";
  if (count === 0 && (current === "in_progress" || current === "on_hold")) {
    throw new AppError(409, "invalid_transition", "Una orden en curso necesita al menos un responsable");
  }
  return current;
}

async function saveAssignees(order: LeanWorkOrder, assigneeIds: string[], actor: Actor): Promise<void> {
  const at = new Date();
  const status = statusForAssignees(order.status, assigneeIds.length);
  const updated = await WorkOrder.updateOne(
    { _id: order._id, status: order.status },
    {
      $set: { assigneeIds: assigneeIds.map(oid), status },
      ...(status !== order.status ? { $push: { statusHistory: { status, at, byId: actor.id } } } : {}),
    },
  );
  if (updated.modifiedCount === 0) throw raced();
  await notifyWorkOrderAssigned(order, order.assigneeIds.map(String), assigneeIds, actor);
  await broadcastWorkOrder(order._id);
}

router.put("/work-orders/:id/assignees", validateBody(setWorkOrderAssigneesInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as SetWorkOrderAssigneesInput;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  if (!canAssignWorkOrder(actor, workOrderRefOf(order))) {
    throw new AppError(403, "forbidden", "Solo el supervisor del área asigna responsables");
  }
  assertOpen(order);

  const unique = [...new Set(input.assigneeIds)];
  if (unique.length) {
    const members = await User.countDocuments({ _id: { $in: unique }, areaId: order.areaId, status: "active" });
    if (members !== unique.length) {
      throw new AppError(422, "validation_error", "Solo puedes asignar a personas activas del área");
    }
    // Igual que en los tickets: a un ausente no se le asigna trabajo nuevo.
    const previous = new Set(order.assigneeIds.map(String));
    const away = await User.find({
      _id: { $in: unique.filter((id) => !previous.has(id)) },
      "availability.state": "away",
    })
      .select("name")
      .lean();
    if (away.length) {
      throw new AppError(
        422,
        "validation_error",
        `${away.map((user) => user.name).join(", ")} ${away.length === 1 ? "está ausente" : "están ausentes"} y no se le pueden asignar órdenes`,
      );
    }
  }

  await saveAssignees(order, unique, actor);
  await sendDetail(res, order._id, actor);
});

/** Tomar la orden: cualquier técnico del área, como "Tomar" en los tickets. */
router.post("/work-orders/:id/take", async (req, res) => {
  const actor = res.locals.actor;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  if (!canTakeWorkOrder(actor, workOrderRefOf(order))) {
    throw new AppError(403, "forbidden", "Solo el área que mantiene el equipo puede tomar la orden");
  }
  assertOpen(order);
  if (!order.assigneeIds.some((id) => String(id) === actor.id)) {
    await saveAssignees(order, [...order.assigneeIds.map(String), actor.id], actor);
  }
  await sendDetail(res, order._id, actor);
});

// ── Repuestos ─────────────────────────────────────────────────

/** El almacén del área que mantiene el equipo: es de donde sale la pieza. */
router.get("/work-orders/:id/part-options", async (req, res) => {
  const actor = res.locals.actor;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  assertCanWork(order, actor);
  const parts = await SparePart.find({ areaId: order.areaId, isActive: true })
    .select("number name unit stock avgUnitCost")
    .sort({ name: 1 })
    .lean();
  res.json({
    items: parts.map((part) => ({
      id: String(part._id),
      number: part.number,
      name: part.name,
      unit: part.unit as PartUnit,
      stock: part.stock,
      avgUnitCost: part.avgUnitCost,
    })),
  });
});

/**
 * Consumir un repuesto. El stock se descuenta con una actualización condicionada
 * a que alcance (plan §2.3): dos técnicos que se llevan el último filtro a la vez
 * no lo dejan en -1, uno de los dos recibe 409. El costo unitario se congela en
 * la OT con el promedio de ese momento.
 */
router.post("/work-orders/:id/parts", validateBody(addWorkOrderPartInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as AddWorkOrderPartInput;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  assertCanWork(order, actor);
  assertOpen(order);

  const part = await SparePart.findOne({ _id: input.partId, areaId: order.areaId, isActive: true }).lean();
  if (!part) throw new AppError(422, "validation_error", "Ese repuesto no está en el almacén del área");

  const taken = await takeStock(part._id, input.qty, { isActive: true });
  if (!taken) {
    const left = (await SparePart.findById(part._id).select("stock").lean())?.stock ?? 0;
    const message = shortageMessage(part, left);
    throw new AppError(409, "insufficient_stock", left > 0 ? message : `${message}: pon la orden en espera de repuesto`);
  }

  const at = new Date();
  const usageId = new Types.ObjectId();
  const pushed = await WorkOrder.updateOne(
    { _id: order._id, status: OPEN_STATUS },
    { $push: { partsUsed: { _id: usageId, partId: part._id, qty: input.qty, unitCost: taken.avgUnitCost, at } } },
  );
  if (pushed.modifiedCount === 0) {
    // La orden se cerró entre medias: la pieza vuelve al almacén sin haber salido.
    await SparePart.updateOne({ _id: part._id }, { $inc: { stock: input.qty } });
    throw raced();
  }
  await StockMovement.create({
    partId: part._id,
    kind: "consume",
    qty: -input.qty,
    unitCost: taken.avgUnitCost,
    workOrderId: order._id,
    actorId: actor.id,
    at,
  });
  await checkLowStock(part._id, actor.id);
  await refreshCost(order._id);
  await broadcastWorkOrder(order._id);
  await sendDetail(res, order._id, actor, 201);
});

/** Quitar un repuesto de la OT lo devuelve al almacén: un movimiento `return`, no un borrado. */
router.delete("/work-orders/:id/parts/:usageId", async (req, res) => {
  const actor = res.locals.actor;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  assertCanWork(order, actor);
  assertOpen(order);
  const usageId = routeParam(req.params["usageId"]);
  const usage = order.partsUsed.find((item) => String(item._id) === usageId);
  if (!usage) throw new AppError(404, "not_found", "Ese repuesto no está en la orden");

  // Primero sale de la orden, y solo si salía: dos clics no lo devuelven dos veces.
  const pulled = await WorkOrder.updateOne(
    { _id: order._id, status: OPEN_STATUS, "partsUsed._id": usage._id },
    { $pull: { partsUsed: { _id: usage._id } } },
  );
  if (pulled.modifiedCount === 0) throw raced();
  await returnParts(order, [usage], actor, new Date(), `Retirado de ${formatWorkOrderNumber(order.number)}`);
  await refreshCost(order._id);
  await broadcastWorkOrder(order._id);
  await sendDetail(res, order._id, actor);
});

// ── Servicios externos ────────────────────────────────────────

/**
 * La factura se sube antes como cualquier adjunto y aquí se enlaza a la orden.
 * Solo vale un archivo que subió quien registra y que no cuelga ya de otro
 * sitio: conocer un id no basta para colgar el archivo de otra persona.
 */
async function claimInvoice(attachmentId: string, actor: Actor, orderId: Types.ObjectId): Promise<void> {
  const file = await Attachment.findById(attachmentId).lean();
  const usable =
    file &&
    String(file.uploaderId) === actor.id &&
    !file.ticketId &&
    !file.assetId &&
    (!file.workOrderId || file.workOrderId.equals(orderId));
  if (!usable) throw new AppError(422, "validation_error", "La factura no es válida: súbela de nuevo");
  await Attachment.updateOne({ _id: attachmentId }, { $set: { workOrderId: orderId } });
}

/**
 * Un servicio de un proveedor externo: la única mano de obra que cuesta. Cobra
 * un precio total (con las horas como dato opcional) o por hora.
 */
router.post("/work-orders/:id/external-costs", validateBody(addExternalCostInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as AddExternalCostInput;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  assertCanWork(order, actor);
  assertOpen(order);
  if (input.attachmentId) await claimInvoice(input.attachmentId, actor, order._id);

  const pushed = await WorkOrder.updateOne(
    { _id: order._id, status: OPEN_STATUS },
    {
      $push: {
        externalCosts: {
          vendor: input.vendor,
          ...(input.description ? { description: input.description } : {}),
          pricing: input.pricing,
          ...(input.minutes ? { minutes: input.minutes } : {}),
          // Por hora, el total lo calcula el servidor: nunca un monto que no
          // cuadre con su tarifa y sus horas.
          ...(input.pricing === "hourly"
            ? { hourlyRate: input.hourlyRate, amount: hourlyServiceAmount(input.hourlyRate, input.minutes) }
            : { amount: input.amount }),
          ...(input.attachmentId ? { attachmentId: input.attachmentId } : {}),
          at: new Date(),
        },
      },
    },
  );
  if (pushed.modifiedCount === 0) throw raced();
  await refreshCost(order._id);
  await broadcastWorkOrder(order._id);
  await sendDetail(res, order._id, actor, 201);
});

router.delete("/work-orders/:id/external-costs/:costId", async (req, res) => {
  const actor = res.locals.actor;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  assertCanWork(order, actor);
  assertOpen(order);
  const cost = order.externalCosts.find((item) => String(item._id) === routeParam(req.params["costId"]));
  if (!cost) throw new AppError(404, "not_found", "Ese costo no está en la orden");

  const pulled = await WorkOrder.updateOne(
    { _id: order._id, status: OPEN_STATUS, "externalCosts._id": cost._id },
    { $pull: { externalCosts: { _id: cost._id } } },
  );
  if (pulled.modifiedCount === 0) throw raced();
  await refreshCost(order._id);
  await broadcastWorkOrder(order._id);
  await sendDetail(res, order._id, actor);
});

// ── Completar ─────────────────────────────────────────────────

/**
 * Completar exige notas del trabajo realizado. El equipo vuelve a Operativo si
 * esta orden era la que lo tenía parado —o pasa a De baja si no tiene arreglo—,
 * y el ticket de origen recibe el aviso. El ticket **no** se resuelve solo:
 * resolver exige una nota para el solicitante (decisión de F3).
 */
router.post("/work-orders/:id/complete", validateBody(completeWorkOrderInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as CompleteWorkOrderInput;
  const order = await loadVisibleWorkOrder(routeParam(req.params["id"]), actor);
  assertCanWork(order, actor);
  assertOpen(order);
  assertWorkOrderTransition(order.status, "completed");

  const asset = (await Asset.findById(order.assetId).lean()) as LeanAsset | null;
  if (input.retireAsset) {
    if (!asset || !canManageAsset(actor, assetRefOf(asset))) {
      throw new AppError(403, "forbidden", "Dar de baja el equipo es del supervisor del área que lo mantiene");
    }
    const others = await WorkOrder.countDocuments({ _id: { $ne: order._id }, assetId: order.assetId, ...OPEN_WORK_ORDER });
    if (others > 0) {
      throw new AppError(
        409,
        "open_work_orders",
        "El equipo tiene otras órdenes abiertas: ciérralas antes de darlo de baja",
      );
    }
  }

  const at = new Date();
  const completed = (await WorkOrder.findOneAndUpdate(
    { _id: order._id, status: "in_progress" },
    {
      $set: { status: "completed", completedAt: at, completionNotes: input.completionNotes },
      $unset: { holdReason: "" },
      $push: { statusHistory: { status: "completed", at, byId: actor.id } },
    },
    { returnDocument: "after" },
  ).lean()) as LeanWorkOrder | null;
  if (!completed) throw raced();

  const trace = {
    actorId: actor.id,
    workOrderId: order._id,
    ...(order.ticketId ? { ticketId: order.ticketId } : {}),
  };
  await AssetEvent.create({
    assetId: order.assetId,
    at,
    ...trace,
    ...(order.type === "corrective"
      ? { kind: "repair", data: { notes: input.completionNotes } }
      : { kind: "preventive", data: { plan: order.title, notes: input.completionNotes } }),
  });

  if (input.retireAsset && asset && asset.status !== "retired") {
    await Asset.updateOne(
      { _id: asset._id },
      { $set: { status: "retired", retiredAt: at, retiredReason: input.completionNotes } },
    );
    await AssetEvent.insertMany([
      { assetId: asset._id, kind: "status_changed", at, ...trace, data: { from: asset.status, to: "retired" } },
      { assetId: asset._id, kind: "retired", at, ...trace, data: { reason: input.completionNotes } },
    ]);
    await MaintenancePlan.updateMany({ assetId: asset._id, isActive: true }, { $set: { isActive: false } });
  } else {
    await releaseAsset(completed, actor, at);
  }

  await tellTicket(order, { kind: "work_order_completed", to: formatWorkOrderNumber(order.number) }, at);
  await broadcastWorkOrder(order._id);
  await sendDetail(res, order._id, actor);
});

export default router;
