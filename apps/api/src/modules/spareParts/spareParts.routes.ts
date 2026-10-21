import {
  canManageStock,
  canViewSpareParts,
  createSparePartInput,
  createStockMovementInput,
  formatSparePartNumber,
  isAdmin,
  isLowStock,
  PART_UNIT_LABEL,
  paginationQuery,
  sparePartListQuery,
  updateSparePartInput,
  type Actor,
  type AreaRef,
  type CreateSparePartInput,
  type CreateStockMovementInput,
  type PaginationQuery,
  type ParsedSparePartListQuery,
  type PartUnit,
  type SparePartAssetRef,
  type SparePartView,
  type StockMovementView,
  type UpdateSparePartInput,
} from "@tekzaya/shared";
import { Router, type Response } from "express";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { validateBody, validateQuery } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { nextNumber } from "../../models/counter.model";
import { Asset, SparePart, StockMovement, WorkOrder } from "../../models/maintenance.models";
import { User } from "../../models/user.model";
import { getSettings } from "../settings/settings.service";
import { routeParam } from "../tickets/ticket.access";
import { csvFile, csvRow, sendCsv } from "../tickets/ticket.csv";
import { checkLowStock, receiveStock, shortageMessage, takeStock, type LeanSparePart } from "./stock";

/**
 * Plan A4: el almacén de repuestos de cada área. Lo ve el área (y RRHH y el
 * administrador, en lectura); entradas, ajustes y el catálogo son del
 * supervisor. Consumos y devoluciones no se registran aquí: salen de una OT.
 */
const router = Router();

const oid = (value: string) => new Types.ObjectId(value);
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unknownArea = (id: unknown): AreaRef => ({ id: String(id), name: "Área eliminada", color: "#7c8cae" });

/** El almacén que ve la sesión: el de su área, salvo lectura global. */
function scopeFilter(actor: Actor): Record<string, unknown> {
  if (isAdmin(actor) || actor.hasGlobalReadAccess) return {};
  return { areaId: oid(actor.areaId) };
}

/** Por id o por número (`REP-0003` o `3`). Lo que no se puede ver responde 404. */
async function loadVisiblePart(key: string, actor: Actor): Promise<LeanSparePart> {
  const number = /^(?:REP-)?(\d{1,9})$/i.exec(key.trim())?.[1];
  const filter =
    Types.ObjectId.isValid(key) && key.length === 24 ? { _id: key } : number ? { number: Number(number) } : null;
  const part = filter ? ((await SparePart.findOne(filter).lean()) as LeanSparePart | null) : null;
  if (!part || !canViewSpareParts(actor, String(part.areaId))) {
    throw new AppError(404, "not_found", "Ese repuesto no existe");
  }
  return part;
}

async function areaMap(parts: readonly LeanSparePart[]): Promise<Map<string, AreaRef>> {
  const areas = await Area.find({ _id: { $in: [...new Set(parts.map((part) => String(part.areaId)))] } })
    .select("name color")
    .lean();
  return new Map(areas.map((area) => [String(area._id), { id: String(area._id), name: area.name!, color: area.color! }]));
}

async function assetMap(parts: readonly LeanSparePart[]): Promise<Map<string, SparePartAssetRef>> {
  const assets = await Asset.find({ _id: { $in: [...new Set(parts.flatMap((part) => (part.assetIds ?? []).map(String)))] } })
    .select("number name status")
    .lean();
  return new Map(
    assets.map((asset) => [
      String(asset._id),
      { id: String(asset._id), number: asset.number, name: asset.name, status: asset.status as SparePartAssetRef["status"] },
    ]),
  );
}

/**
 * Los equipos en los que se usa una pieza son del área que la guarda: la pieza
 * sale de ese almacén hacia una OT de ese mismo área.
 */
async function assertAreaAssets(assetIds: readonly string[], areaId: string): Promise<Types.ObjectId[]> {
  const unique = [...new Set(assetIds)];
  if (!unique.length) return [];
  const found = await Asset.countDocuments({ _id: { $in: unique.map(oid) }, areaId: oid(areaId) });
  if (found !== unique.length) {
    throw new AppError(422, "validation_error", "Solo se pueden vincular equipos que mantiene el área del repuesto");
  }
  return unique.map(oid);
}

function toView(
  part: LeanSparePart,
  areas: Map<string, AreaRef>,
  assets: Map<string, SparePartAssetRef>,
  actor: Actor,
): SparePartView {
  const linked = (part.assetIds ?? []).flatMap((id) => assets.get(String(id)) ?? []);
  return {
    id: String(part._id),
    number: part.number,
    name: part.name,
    areaId: String(part.areaId),
    area: areas.get(String(part.areaId)) ?? unknownArea(part.areaId),
    unit: part.unit as PartUnit,
    stock: part.stock,
    minStock: part.minStock,
    avgUnitCost: part.avgUnitCost,
    isActive: part.isActive,
    assetIds: linked.map((asset) => asset.id),
    assets: linked.sort((a, b) => a.number - b.number),
    low: isLowStock(part),
    stockValue: part.stock * part.avgUnitCost,
    createdAt: part.createdAt.toISOString(),
    updatedAt: part.updatedAt.toISOString(),
    permissions: { manage: canManageStock(actor, String(part.areaId)) },
  };
}

async function sendDetail(res: Response, partId: Types.ObjectId, actor: Actor, status = 200): Promise<void> {
  const part = (await SparePart.findById(partId).lean()) as LeanSparePart;
  const [areas, assets, settings] = await Promise.all([areaMap([part]), assetMap([part]), getSettings()]);
  res.status(status).json({ ...toView(part, areas, assets, actor), currency: settings.maintenance.currency });
}

function assertCanManage(part: LeanSparePart, actor: Actor): void {
  if (!canManageStock(actor, String(part.areaId))) {
    throw new AppError(403, "forbidden", "El almacén lo gestiona el supervisor del área");
  }
}

// ── Lista ─────────────────────────────────────────────────────

/** `withLow: false` lo usa el resumen, que no debe vaciarse al filtrar los bajo mínimo. */
function listFilter(actor: Actor, query: ParsedSparePartListQuery, withLow = true) {
  const and: Record<string, unknown>[] = [scopeFilter(actor)];
  if (query.areaId) and.push({ areaId: oid(query.areaId) });
  if (query.assetId) and.push({ assetIds: oid(query.assetId) });
  if (query.state !== "all") and.push({ isActive: query.state === "active" });
  if (withLow && query.low) and.push({ $expr: { $lt: ["$stock", "$minStock"] } });
  if (query.q) {
    const number = /^(?:REP-)?(\d{1,9})$/i.exec(query.q)?.[1];
    and.push({
      $or: [...(number ? [{ number: Number(number) }] : []), { name: new RegExp(escapeRegex(query.q), "i") }],
    });
  }
  return { $and: and };
}

const SORTS: Record<ParsedSparePartListQuery["sort"], Record<string, unknown>> = {
  number: { number: 1 },
  name: { name: 1 },
  stock: { stock: 1 },
  value: { stockValue: 1 },
};

/** Áreas donde quien mira puede dar de alta repuestos: todas para el admin, la suya para el supervisor. */
async function manageableAreas(actor: Actor): Promise<AreaRef[]> {
  if (!isAdmin(actor) && !actor.isAreaSupervisor) return [];
  const areas = await Area.find(isAdmin(actor) ? { isActive: { $ne: false } } : { _id: actor.areaId })
    .select("name color")
    .sort({ name: 1 })
    .lean();
  return areas.map((area) => ({ id: String(area._id), name: area.name!, color: area.color! }));
}

router.get("/spare-parts", validateQuery(sparePartListQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as ParsedSparePartListQuery;
  const direction = query.dir === "desc" ? -1 : 1;
  const sort = Object.fromEntries(Object.keys(SORTS[query.sort]).map((key) => [key, direction]));

  // El valor del stock se calcula en la consulta para poder ordenar por él.
  const [items, total, summary, settings, areasICanManage] = await Promise.all([
    SparePart.aggregate<LeanSparePart>([
      { $match: listFilter(actor, query) },
      { $addFields: { stockValue: { $multiply: ["$stock", "$avgUnitCost"] } } },
      { $sort: { ...sort, _id: direction } },
      { $skip: (query.page - 1) * query.limit },
      { $limit: query.limit },
    ]),
    SparePart.countDocuments(listFilter(actor, query)),
    SparePart.aggregate<{ total: number; low: number; stockValue: number }>([
      { $match: listFilter(actor, query, false) },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          low: { $sum: { $cond: [{ $lt: ["$stock", "$minStock"] }, 1, 0] } },
          stockValue: { $sum: { $multiply: ["$stock", "$avgUnitCost"] } },
        },
      },
    ]),
    getSettings(),
    manageableAreas(actor),
  ]);
  const [areas, assets] = await Promise.all([areaMap(items), assetMap(items)]);

  res.json({
    items: items.map((part) => toView(part, areas, assets, actor)),
    total,
    page: query.page,
    limit: query.limit,
    summary: { total: summary[0]?.total ?? 0, low: summary[0]?.low ?? 0, stockValue: summary[0]?.stockValue ?? 0 },
    currency: settings.maintenance.currency,
    manageableAreas: areasICanManage,
  });
});

/** Techo de filas por descarga, como en los tickets y los activos. */
const EXPORT_LIMIT = 5000;

/** CSV del almacén con los filtros de la pantalla. Va antes de `/:id`. */
router.get("/spare-parts/export", validateQuery(sparePartListQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as ParsedSparePartListQuery;
  const parts = (await SparePart.find(listFilter(actor, query)).sort({ number: 1 }).limit(EXPORT_LIMIT).lean()) as LeanSparePart[];
  const [areas, settings] = await Promise.all([areaMap(parts), getSettings()]);
  const currency = settings.maintenance.currency;
  const cents = (amount: number) => (amount / 100).toFixed(2);

  const header = csvRow([
    "Número",
    "Repuesto",
    "Área",
    "Unidad",
    "Stock",
    "Mínimo",
    "Bajo mínimo",
    `Costo promedio (${currency})`,
    `Valor en stock (${currency})`,
    "Estado",
  ]);
  const rows = parts.map((part) =>
    csvRow([
      formatSparePartNumber(part.number),
      part.name,
      areas.get(String(part.areaId))?.name ?? "",
      PART_UNIT_LABEL[part.unit as PartUnit],
      String(part.stock),
      String(part.minStock),
      isLowStock(part) ? "Sí" : "No",
      cents(part.avgUnitCost),
      cents(part.stock * part.avgUnitCost),
      part.isActive ? "Activo" : "Desactivado",
    ]),
  );
  sendCsv(res, "tekzaya-repuestos", csvFile(header, ...rows));
});

// ── Alta y edición ────────────────────────────────────────────

router.post("/spare-parts", validateBody(createSparePartInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as CreateSparePartInput;
  if (!canManageStock(actor, input.areaId)) {
    throw new AppError(403, "forbidden", "Solo el supervisor del área da de alta repuestos en su almacén");
  }
  const area = await Area.findById(input.areaId).select("isActive").lean();
  if (!area || area.isActive === false) throw new AppError(422, "validation_error", "Esa área no existe o está desactivada");
  const assetIds = await assertAreaAssets(input.assetIds, input.areaId);

  const _id = new Types.ObjectId();
  await SparePart.create({
    _id,
    number: await nextNumber("spare_part"),
    name: input.name,
    areaId: input.areaId,
    unit: input.unit,
    stock: 0,
    minStock: input.minStock,
    avgUnitCost: input.initialStock?.unitCost ?? 0,
    isActive: true,
    assetIds,
  });
  // Las existencias iniciales son una entrada más: el libro empieza cuadrado.
  if (input.initialStock) {
    await receiveStock(_id, input.initialStock.qty, input.initialStock.unitCost);
    await StockMovement.create({
      partId: _id,
      kind: "in",
      qty: input.initialStock.qty,
      unitCost: input.initialStock.unitCost,
      actorId: actor.id,
      at: new Date(),
      reason: "Existencias iniciales",
    });
  }
  await checkLowStock(_id, actor.id);
  await sendDetail(res, _id, actor, 201);
});

router.get("/spare-parts/:id", async (req, res) => {
  const actor = res.locals.actor;
  const part = await loadVisiblePart(routeParam(req.params["id"]), actor);
  await sendDetail(res, part._id, actor);
});

/** Nombre, unidad, mínimo, activo y equipos. Cambiar el mínimo puede armar o desarmar el aviso. */
router.patch("/spare-parts/:id", validateBody(updateSparePartInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as UpdateSparePartInput;
  const part = await loadVisiblePart(routeParam(req.params["id"]), actor);
  assertCanManage(part, actor);

  const { assetIds, ...fields } = input;
  const $set: Record<string, unknown> = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  if (assetIds) $set["assetIds"] = await assertAreaAssets(assetIds, String(part.areaId));
  if (Object.keys($set).length) await SparePart.updateOne({ _id: part._id }, { $set });
  await checkLowStock(part._id, actor.id);
  await sendDetail(res, part._id, actor);
});

// ── Libro de movimientos ──────────────────────────────────────

/**
 * Más reciente primero, con el saldo que dejó cada paso. El saldo se deduce del
 * stock actual hacia atrás: como `stock` es la suma del libro, el de la fila
 * más reciente es el stock de hoy.
 */
router.get("/spare-parts/:id/movements", validateQuery(paginationQuery), async (req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as PaginationQuery;
  const part = await loadVisiblePart(routeParam(req.params["id"]), actor);
  const skip = (query.page - 1) * query.limit;

  const [items, total, newer] = await Promise.all([
    StockMovement.find({ partId: part._id }).sort({ at: -1, _id: -1 }).skip(skip).limit(query.limit).lean(),
    StockMovement.countDocuments({ partId: part._id }),
    skip > 0
      ? StockMovement.aggregate<{ sum: number }>([
          { $match: { partId: part._id } },
          { $sort: { at: -1, _id: -1 } },
          { $limit: skip },
          { $group: { _id: null, sum: { $sum: "$qty" } } },
        ])
      : [],
  ]);

  const [people, orders] = await Promise.all([
    User.find({ _id: { $in: items.map((item) => item.actorId) } }).select("name avatarUrl areaId").lean(),
    WorkOrder.find({ _id: { $in: items.flatMap((item) => (item.workOrderId ? [item.workOrderId] : [])) } })
      .select("number")
      .lean(),
  ]);
  const personOf = new Map(
    people.map((person) => [
      String(person._id),
      {
        id: String(person._id),
        name: person.name!,
        ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
        areaId: String(person.areaId),
      },
    ]),
  );
  const orderNumber = new Map(orders.map((order) => [String(order._id), order.number]));

  let balance = part.stock - (newer[0]?.sum ?? 0);
  const views: StockMovementView[] = items.map((item) => {
    const view: StockMovementView = {
      id: String(item._id),
      kind: item.kind as StockMovementView["kind"],
      qty: item.qty,
      unitCost: item.unitCost,
      balance,
      at: item.at.toISOString(),
      ...(personOf.has(String(item.actorId)) ? { actor: personOf.get(String(item.actorId))! } : {}),
      ...(item.workOrderId && orderNumber.has(String(item.workOrderId))
        ? { workOrder: { id: String(item.workOrderId), number: orderNumber.get(String(item.workOrderId))! } }
        : {}),
      ...(item.reason ? { reason: item.reason } : {}),
    };
    balance -= item.qty;
    return view;
  });

  res.json({ items: views, total, page: query.page, limit: query.limit });
});

/**
 * Entrada (compra, con su costo) o ajuste (conteo físico o merma, con motivo).
 * Un ajuste a la baja nunca deja el stock en negativo: la condición va en la
 * propia actualización, como en los consumos.
 */
router.post("/spare-parts/:id/movements", validateBody(createStockMovementInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as CreateStockMovementInput;
  const part = await loadVisiblePart(routeParam(req.params["id"]), actor);
  assertCanManage(part, actor);
  if (!part.isActive) throw new AppError(409, "part_inactive", "Este repuesto está desactivado: reactívalo antes de moverlo");

  const at = new Date();
  let unitCost: number;
  if (input.kind === "in") {
    await receiveStock(part._id, input.qty, input.unitCost);
    unitCost = input.unitCost;
  } else if (input.qty > 0) {
    // Un sobrante entra al costo de hoy: no es una compra y no mueve el promedio.
    const found = await SparePart.findOneAndUpdate({ _id: part._id }, { $inc: { stock: input.qty } }, { returnDocument: "before" }).lean();
    unitCost = found!.avgUnitCost;
  } else {
    const taken = await takeStock(part._id, -input.qty);
    if (!taken) {
      const left = (await SparePart.findById(part._id).select("stock").lean())?.stock ?? 0;
      throw new AppError(409, "insufficient_stock", `${shortageMessage(part, left)}: el ajuste no puede dejarlo en negativo`);
    }
    unitCost = taken.avgUnitCost;
  }

  await StockMovement.create({
    partId: part._id,
    kind: input.kind,
    qty: input.qty,
    unitCost,
    actorId: actor.id,
    at,
    ...(input.reason ? { reason: input.reason } : {}),
  });
  await checkLowStock(part._id, actor.id);
  await sendDetail(res, part._id, actor, 201);
});

export default router;
