import {
  addDaysToKey,
  ASSET_STATUS_LABEL,
  ASSET_TYPE_LABEL,
  assetListQuery,
  canManageAsset,
  canViewAssetDetails,
  createAssetInput,
  emptyStatusCounts,
  FINAL_WORK_ORDER_STATUSES,
  formatAssetNumber,
  isAdmin,
  retireAssetInput,
  updateAssetInput,
  WARRANTY_STATE_LABEL,
  type Actor,
  type AssetEventView,
  type AssetListQuery,
  type AssetStatus,
  type CreateAssetInput,
  type RetireAssetInput,
  type UpdateAssetInput,
} from "@tekzaya/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { validateBody, validateQuery } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { nextNumber } from "../../models/counter.model";
import { Asset, AssetEvent, MaintenancePlan, WorkOrder } from "../../models/maintenance.models";
import { Attachment } from "../../models/support.models";
import { User } from "../../models/user.model";
import { getSettings } from "../settings/settings.service";
import { csvFile, csvRow, sendCsv } from "../tickets/ticket.csv";
import { routeParam } from "../tickets/ticket.access";
import { assetRefOf, assetScopeFilter, loadVisibleAsset, type LeanAsset } from "./asset.access";
import { hydrateAssets, todayKey, toAssetView } from "./asset.view";

const router = Router();

const oid = (value: string) => new Types.ObjectId(value);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Órdenes que todavía no terminaron: impiden dar de baja el equipo. */
const OPEN_WORK_ORDER = { status: { $nin: [...FINAL_WORK_ORDER_STATUSES] } };

const SORT_FIELDS: Record<AssetListQuery["sort"], string> = {
  number: "number",
  name: "name",
  type: "type",
  status: "status",
  location: "location",
  warranty: "warrantyUntil",
};

/**
 * El filtro de la lista: alcance de la sesión **y** lo que pidió el cliente.
 * `withStatus: false` lo usa el resumen por estado, que tiene que seguir
 * mostrando los tres aunque se esté filtrando por uno.
 */
async function listFilter(actor: Actor, query: AssetListQuery, withStatus = true) {
  const and: Record<string, unknown>[] = [assetScopeFilter(actor)];
  if (query.areaId) and.push({ areaId: oid(query.areaId) });
  if (query.usedByAreaId) and.push({ usedByAreaId: oid(query.usedByAreaId) });
  if (query.custodianId) and.push({ custodianId: oid(query.custodianId) });
  if (query.type) and.push({ type: { $in: query.type } });
  if (withStatus && query.status) and.push({ status: { $in: query.status } });
  if (query.location) and.push({ location: query.location });

  if (query.warranty) {
    const settings = await getSettings();
    const today = todayKey(settings.businessHours.timezone);
    const limit = addDaysToKey(today, settings.maintenance.warrantyAlertDays);
    and.push(
      query.warranty === "none"
        ? { $or: [{ warrantyUntil: { $exists: false } }, { warrantyUntil: null }] }
        : query.warranty === "expired"
          ? { warrantyUntil: { $lt: today } }
          : query.warranty === "expiring"
            ? { warrantyUntil: { $gte: today, $lte: limit } }
            : { warrantyUntil: { $gt: limit } },
    );
  }

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
      ],
    });
  }
  return { $and: and };
}

/** Comprueba que las referencias del formulario existan antes de guardarlas. */
async function assertReferences(input: {
  areaId?: string | undefined;
  usedByAreaId?: string | null | undefined;
  custodianId?: string | null | undefined;
}): Promise<void> {
  for (const areaId of [input.areaId, input.usedByAreaId]) {
    if (!areaId) continue;
    const area = await Area.findById(areaId).select("isActive").lean();
    if (!area || area.isActive === false) {
      throw new AppError(422, "validation_error", "Esa área no existe o está desactivada");
    }
  }
  if (input.custodianId) {
    const person = await User.exists({ _id: input.custodianId, status: "active" });
    if (!person) throw new AppError(422, "validation_error", "Esa persona no existe o está desactivada");
  }
}

/**
 * La foto se sube antes como cualquier adjunto (borrador sin dueño) y aquí se
 * enlaza al activo. Solo vale una imagen que subió quien guarda, que no esté ya
 * en un ticket ni en otro equipo: si no, bastaría con conocer un id para colgar
 * en un activo el archivo de otra persona.
 */
async function claimPhoto(photoId: string, actor: Actor, assetId: Types.ObjectId): Promise<void> {
  const file = await Attachment.findById(photoId).lean();
  const usable =
    file &&
    String(file.uploaderId) === actor.id &&
    !file.ticketId &&
    (!file.assetId || file.assetId.equals(assetId)) &&
    file.mimeType?.startsWith("image/");
  if (!usable) throw new AppError(422, "validation_error", "La foto no es válida: sube una imagen nueva");
  await Attachment.updateOne({ _id: photoId }, { $set: { assetId } });
}

async function detailOf(asset: LeanAsset, actor: Actor) {
  const hydration = await hydrateAssets([asset]);
  const view = toAssetView(asset, hydration, actor);
  return {
    ...view,
    currency: hydration.currency,
    ...(view.permissions.viewDetails
      ? { openWorkOrders: await WorkOrder.countDocuments({ assetId: asset._id, ...OPEN_WORK_ORDER }) }
      : {}),
  };
}

// ── Listado ───────────────────────────────────────────────────

router.get("/assets", validateQuery(assetListQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as AssetListQuery;
  const direction = query.dir === "desc" ? -1 : 1;

  const filter = await listFilter(actor, query);
  const [items, total, counts] = await Promise.all([
    Asset.find(filter)
      .sort({ [SORT_FIELDS[query.sort]]: direction, _id: direction })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean() as Promise<LeanAsset[]>,
    Asset.countDocuments(filter),
    Asset.aggregate<{ _id: AssetStatus; count: number }>([
      { $match: await listFilter(actor, query, false) },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts = emptyStatusCounts();
  for (const row of counts) statusCounts[row._id] = row.count;
  const hydration = await hydrateAssets(items);

  res.json({
    items: items.map((asset) => toAssetView(asset, hydration, actor)),
    total,
    page: query.page,
    limit: query.limit,
    statusCounts,
    currency: hydration.currency,
  });
});

/** Techo de filas por descarga, como en los tickets. */
const EXPORT_LIMIT = 5000;

/**
 * CSV del inventario con los filtros de la pantalla. El costo de compra solo
 * sale en las filas que quien descarga puede ver con detalle. Va antes de
 * `/assets/:id` para que Express no lea "export" como un número de activo.
 */
router.get("/assets/export", validateQuery(assetListQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as AssetListQuery;
  const assets = (await Asset.find(await listFilter(actor, query))
    .sort({ number: 1 })
    .limit(EXPORT_LIMIT)
    .lean()) as LeanAsset[];
  const h = await hydrateAssets(assets);

  const header = csvRow([
    "Número",
    "Nombre",
    "Tipo",
    "Marca",
    "Modelo",
    "Serie",
    "Área responsable",
    "Área que lo usa",
    "Persona a cargo",
    "Ubicación",
    "Estado",
    "Fecha de compra",
    `Costo de compra (${h.currency})`,
    "Garantía hasta",
    "Garantía",
  ]);
  const rows = assets.map((asset) => {
    const view = toAssetView(asset, h, actor);
    return csvRow([
      formatAssetNumber(view.number),
      view.name,
      ASSET_TYPE_LABEL[view.type],
      view.brand,
      view.model,
      view.serial,
      view.area.name,
      view.usedByArea?.name,
      view.custodian?.name,
      view.location,
      ASSET_STATUS_LABEL[view.status],
      view.purchaseDate,
      view.purchaseCost === undefined ? "" : (view.purchaseCost / 100).toFixed(2),
      view.warrantyUntil,
      WARRANTY_STATE_LABEL[view.warranty],
    ]);
  });
  sendCsv(res, "tekzaya-activos", csvFile(header, ...rows));
});

/** Ubicaciones ya usadas, para sugerirlas al escribir y para el filtro. */
router.get("/assets/locations", async (_req, res) => {
  const locations = await Asset.distinct("location", assetScopeFilter(res.locals.actor));
  res.json({ items: (locations as string[]).sort((a, b) => a.localeCompare(b, "es")) });
});

/**
 * Personas para "Persona a cargo". La laptop de alguien de Ventas la da de alta
 * el supervisor de IT, así que necesita ver gente de otras áreas: solo nombre y
 * área, y solo quien puede gestionar algún activo.
 */
router.get("/assets/people", async (req, res) => {
  const actor = res.locals.actor;
  if (!isAdmin(actor) && !actor.isAreaSupervisor) {
    throw new AppError(403, "forbidden", "Solo quien gestiona activos elige a la persona a cargo");
  }
  const areaId = typeof req.query["areaId"] === "string" ? req.query["areaId"] : undefined;
  if (areaId && !Types.ObjectId.isValid(areaId)) throw new AppError(404, "not_found", "Esa área no existe");

  const people = await User.find({ status: "active", ...(areaId ? { areaId } : {}) })
    .select("name avatarUrl areaId")
    .sort({ name: 1 })
    .lean();
  res.json({
    items: people.map((person) => ({
      id: String(person._id),
      name: person.name!,
      ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
      areaId: String(person.areaId),
    })),
  });
});

// ── Alta ──────────────────────────────────────────────────────

router.post("/assets", validateBody(createAssetInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as CreateAssetInput;

  if (!canManageAsset(actor, { areaId: input.areaId })) {
    throw new AppError(403, "forbidden", "Solo el supervisor del área responsable da de alta sus equipos");
  }
  await assertReferences(input);

  const _id = new Types.ObjectId();
  if (input.photoId) await claimPhoto(input.photoId, actor, _id);

  const now = new Date();
  const { photoId, ...fields } = input;
  await Asset.create({
    _id,
    ...fields,
    ...(photoId ? { photoId } : {}),
    number: await nextNumber("asset"),
    status: "operational",
  });
  await AssetEvent.create({
    assetId: _id,
    kind: "created",
    at: now,
    actorId: actor.id,
    data: { status: "operational" },
  });

  const asset = (await Asset.findById(_id).lean()) as LeanAsset;
  res.status(201).json(await detailOf(asset, actor));
});

// ── Ficha ─────────────────────────────────────────────────────

router.get("/assets/:id", async (req, res) => {
  const actor = res.locals.actor;
  const asset = await loadVisibleAsset(routeParam(req.params["id"]), actor);
  res.json(await detailOf(asset, actor));
});

/**
 * Editar, y con ello **mover**: cambiar la ubicación, el área que lo usa o el
 * área responsable deja un paso `moved` en la línea de tiempo, y cambiar la
 * persona a cargo deja `custodian_changed`. El resto de los datos (nombre, serie,
 * garantía…) se corrige sin dejar rastro en la historia del equipo.
 */
router.patch("/assets/:id", validateBody(updateAssetInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as UpdateAssetInput;
  const asset = await loadVisibleAsset(routeParam(req.params["id"]), actor);

  if (!canManageAsset(actor, assetRefOf(asset))) {
    throw new AppError(403, "forbidden", "Solo el supervisor del área responsable edita este equipo");
  }
  if (asset.status === "retired") {
    throw new AppError(409, "asset_retired", "Este equipo está dado de baja y ya no se edita");
  }
  // Pasarlo a otra área responsable es entregárselo: hay que poder gestionar las dos.
  if (input.areaId && input.areaId !== String(asset.areaId) && !canManageAsset(actor, { areaId: input.areaId })) {
    throw new AppError(403, "forbidden", "No puedes pasar el equipo a un área que no supervisas");
  }
  await assertReferences(input);
  if (input.photoId) await claimPhoto(input.photoId, actor, asset._id);

  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ""> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (value === null) $unset[key] = "";
    else $set[key] = value;
  }

  const same = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "");
  const now = new Date();
  const events: Record<string, unknown>[] = [];

  const moved: Record<string, unknown> = {};
  if (input.location !== undefined && !same(input.location, asset.location)) {
    Object.assign(moved, { from: asset.location, to: input.location });
  }
  if (input.usedByAreaId !== undefined && !same(input.usedByAreaId, asset.usedByAreaId)) {
    Object.assign(moved, {
      fromUsedByAreaId: asset.usedByAreaId ? String(asset.usedByAreaId) : null,
      toUsedByAreaId: input.usedByAreaId,
    });
  }
  if (input.areaId !== undefined && !same(input.areaId, asset.areaId)) {
    Object.assign(moved, { fromAreaId: String(asset.areaId), toAreaId: input.areaId });
  }
  if (Object.keys(moved).length) {
    events.push({ assetId: asset._id, kind: "moved", at: now, actorId: actor.id, data: moved });
  }
  if (input.custodianId !== undefined && !same(input.custodianId, asset.custodianId)) {
    events.push({
      assetId: asset._id,
      kind: "custodian_changed",
      at: now,
      actorId: actor.id,
      data: { from: asset.custodianId ? String(asset.custodianId) : null, to: input.custodianId },
    });
  }

  await Asset.updateOne(
    { _id: asset._id },
    { ...(Object.keys($set).length ? { $set } : {}), ...(Object.keys($unset).length ? { $unset } : {}) },
  );
  if (events.length) await AssetEvent.insertMany(events);

  const updated = (await Asset.findById(asset._id).lean()) as LeanAsset;
  res.json(await detailOf(updated, actor));
});

/**
 * Dar de baja: nada se borra (plan §2.3). El equipo queda en el inventario con
 * su motivo, y sus planes preventivos se pausan (plan A5). Con órdenes de
 * trabajo abiertas no se puede: primero se cierran o se cancelan.
 */
router.post("/assets/:id/retire", validateBody(retireAssetInput), async (req, res) => {
  const actor = res.locals.actor;
  const { reason } = req.body as RetireAssetInput;
  const asset = await loadVisibleAsset(routeParam(req.params["id"]), actor);

  if (!canManageAsset(actor, assetRefOf(asset))) {
    throw new AppError(403, "forbidden", "Solo el supervisor del área responsable da de baja este equipo");
  }
  if (asset.status === "retired") {
    throw new AppError(409, "asset_retired", "Este equipo ya está dado de baja");
  }
  const open = await WorkOrder.countDocuments({ assetId: asset._id, ...OPEN_WORK_ORDER });
  if (open > 0) {
    throw new AppError(
      409,
      "open_work_orders",
      `Tiene ${open} ${open === 1 ? "orden de trabajo abierta" : "órdenes de trabajo abiertas"}: ciérralas o cancélalas antes de darlo de baja`,
    );
  }

  const now = new Date();
  await Asset.updateOne(
    { _id: asset._id },
    { $set: { status: "retired", retiredAt: now, retiredReason: reason } },
  );
  await AssetEvent.insertMany([
    { assetId: asset._id, kind: "status_changed", at: now, actorId: actor.id, data: { from: asset.status, to: "retired" } },
    { assetId: asset._id, kind: "retired", at: now, actorId: actor.id, data: { reason } },
  ]);
  await MaintenancePlan.updateMany({ assetId: asset._id, isActive: true }, { $set: { isActive: false } });

  const updated = (await Asset.findById(asset._id).lean()) as LeanAsset;
  res.json(await detailOf(updated, actor));
});

// ── Línea de tiempo ───────────────────────────────────────────

/**
 * El historial es información del área (plan §3): el empleado ve su equipo y su
 * estado, no sus averías ni lo que costaron. Más reciente primero.
 */
router.get("/assets/:id/events", async (req, res) => {
  const actor = res.locals.actor;
  const asset = await loadVisibleAsset(routeParam(req.params["id"]), actor);
  if (!canViewAssetDetails(actor, assetRefOf(asset))) {
    throw new AppError(403, "forbidden", "El historial del equipo es del área que lo mantiene");
  }

  const events = await AssetEvent.find({ assetId: asset._id }).sort({ at: -1, _id: -1 }).lean();
  const data = (event: (typeof events)[number]) => (event.data ?? {}) as Record<string, unknown>;

  // Personas y áreas que aparecen en los pasos, para escribir sus nombres.
  const userIds = new Set<string>();
  const areaIds = new Set<string>();
  for (const event of events) {
    if (event.actorId) userIds.add(String(event.actorId));
    const d = data(event);
    if (event.kind === "custodian_changed") {
      for (const id of [d["from"], d["to"]]) if (typeof id === "string") userIds.add(id);
    }
    for (const key of ["fromUsedByAreaId", "toUsedByAreaId", "fromAreaId", "toAreaId"]) {
      if (typeof d[key] === "string") areaIds.add(d[key] as string);
    }
  }
  const [h, orders] = await Promise.all([
    hydrateAssets([], [...userIds], [...areaIds]),
    WorkOrder.find({ _id: { $in: events.flatMap((event) => (event.workOrderId ? [event.workOrderId] : [])) } })
      .select("number")
      .lean(),
  ]);
  const orderNumber = new Map(orders.map((order) => [String(order._id), order.number]));

  const items: AssetEventView[] = events.map((event) => {
    const d = { ...data(event) };
    const nameOf = (id: unknown) => (typeof id === "string" ? h.people.get(id)?.name : undefined);
    const areaOf = (id: unknown) => (typeof id === "string" ? h.areas.get(id)?.name : undefined);
    if (event.kind === "custodian_changed") {
      d["fromName"] = nameOf(d["from"]) ?? null;
      d["toName"] = nameOf(d["to"]) ?? null;
    }
    for (const key of ["fromUsedByAreaId", "toUsedByAreaId", "fromAreaId", "toAreaId"] as const) {
      if (key in d) d[key.replace("Id", "Name")] = areaOf(d[key]) ?? null;
    }
    const actorPerson = event.actorId ? h.people.get(String(event.actorId)) : undefined;
    const number = event.workOrderId ? orderNumber.get(String(event.workOrderId)) : undefined;
    return {
      id: String(event._id),
      kind: event.kind as AssetEventView["kind"],
      at: event.at.toISOString(),
      ...(actorPerson ? { actor: actorPerson } : {}),
      ...(event.workOrderId && number ? { workOrder: { id: String(event.workOrderId), number } } : {}),
      data: d,
    };
  });

  res.json({ items });
});

export default router;
