import {
  addDaysToKey,
  calendarQuery,
  canManageMaintenancePlans,
  canViewAsset,
  canViewMaintenancePlans,
  createPlanInput,
  fixedOccurrences,
  generationDate,
  isAdmin,
  isWorkOrderOverdue,
  nextFixedDue,
  planListQuery,
  updatePlanInput,
  type Actor,
  type AreaRef,
  type CalendarItem,
  type CalendarQuery,
  type CreatePlanInput,
  type ParsedPlanListQuery,
  type PlanView,
  type UpdatePlanInput,
  type WorkOrderStatus,
} from "@tekzaya/shared";
import { Router, type Response } from "express";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { validateBody, validateQuery } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { Asset, MaintenancePlan, WorkOrder } from "../../models/maintenance.models";
import { getSettings } from "../settings/settings.service";
import { assetRefOf, type LeanAsset } from "../assets/asset.access";
import { todayKey } from "../assets/asset.view";
import { routeParam } from "../tickets/ticket.access";
import { OPEN_WORK_ORDER } from "../workOrders/workOrder.lifecycle";
import { coverageFilter, type LeanPlan } from "./plan.rounds";

/**
 * Plan A5: planes preventivos y su calendario. Los ve el área que mantiene los
 * equipos (y RRHH y el administrador, en lectura); crearlos, cambiarlos y
 * pausarlos es del supervisor. Las OT las abre el trabajo diario, no esta API.
 */
const router = Router();

const oid = (value: string) => new Types.ObjectId(value);
const unknownArea = (id: unknown): AreaRef => ({ id: String(id), name: "Área eliminada", color: "#7c8cae" });

function scopeFilter(actor: Actor): Record<string, unknown> {
  if (isAdmin(actor) || actor.hasGlobalReadAccess) return {};
  return { areaId: oid(actor.areaId) };
}

async function loadVisiblePlan(key: string, actor: Actor): Promise<LeanPlan> {
  const plan = Types.ObjectId.isValid(key) && key.length === 24
    ? ((await MaintenancePlan.findById(key).lean()) as LeanPlan | null)
    : null;
  if (!plan || !canViewMaintenancePlans(actor, String(plan.areaId))) {
    throw new AppError(404, "not_found", "Ese plan no existe");
  }
  return plan;
}

function assertCanManage(plan: Pick<LeanPlan, "areaId">, actor: Actor): void {
  if (!canManageMaintenancePlans(actor, String(plan.areaId))) {
    throw new AppError(403, "forbidden", "Los planes preventivos los gestiona el supervisor del área");
  }
}

async function areaMap(areaIds: readonly unknown[]): Promise<Map<string, AreaRef>> {
  const areas = await Area.find({ _id: { $in: [...new Set(areaIds.map(String))] } }).select("name color").lean();
  return new Map(areas.map((area) => [String(area._id), { id: String(area._id), name: area.name!, color: area.color! }]));
}

/** Equipos, cobertura y órdenes abiertas de una tanda de planes, y su vista. */
async function toViews(plans: readonly LeanPlan[], actor: Actor): Promise<PlanView[]> {
  const [areas, assets, coverage, open] = await Promise.all([
    areaMap(plans.map((plan) => plan.areaId)),
    Asset.find({ _id: { $in: plans.flatMap((plan) => (plan.assetId ? [plan.assetId] : [])) } })
      .select("number name status")
      .lean(),
    Promise.all(plans.map((plan) => Asset.countDocuments(coverageFilter(plan)))),
    WorkOrder.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { planId: { $in: plans.map((plan) => plan._id) }, ...OPEN_WORK_ORDER } },
      { $group: { _id: "$planId", count: { $sum: 1 } } },
    ]),
  ]);
  const assetById = new Map(assets.map((asset) => [String(asset._id), asset]));
  const openByPlan = new Map(open.map((row) => [String(row._id), row.count]));

  return plans.map((plan, index) => {
    const asset = plan.assetId ? assetById.get(String(plan.assetId)) : undefined;
    return {
      id: String(plan._id),
      title: plan.title,
      ...(plan.assetId ? { assetId: String(plan.assetId) } : {}),
      ...(plan.assetType ? { assetType: plan.assetType as PlanView["assetType"] } : {}),
      areaId: String(plan.areaId),
      area: areas.get(String(plan.areaId)) ?? unknownArea(plan.areaId),
      ...(asset ? { asset: { id: String(asset._id), number: asset.number, name: asset.name, status: asset.status } } : {}),
      checklist: plan.checklist,
      every: plan.every,
      unit: plan.unit,
      mode: plan.mode,
      startsOn: plan.startsOn,
      nextDueAt: plan.nextDueAt,
      ...(plan.lastCompletedAt ? { lastCompletedAt: plan.lastCompletedAt.toISOString() } : {}),
      leadDays: plan.leadDays,
      isActive: plan.isActive,
      coverage: coverage[index] ?? 0,
      generatesOn: generationDate(plan.nextDueAt, plan.leadDays),
      openOrders: openByPlan.get(String(plan._id)) ?? 0,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      permissions: { manage: canManageMaintenancePlans(actor, String(plan.areaId)) },
    };
  });
}

async function sendPlan(res: Response, planId: Types.ObjectId, actor: Actor, status = 200): Promise<void> {
  const plan = (await MaintenancePlan.findById(planId).lean()) as LeanPlan;
  const [view] = await toViews([plan], actor);
  res.status(status).json(view);
}

async function companyToday(): Promise<string> {
  return todayKey((await getSettings()).businessHours.timezone);
}

/**
 * La primera ronda de un plan `fixed` cuyo calendario ya empezó: la primera
 * fecha del calendario que no ha pasado (hoy incluido).
 */
const firstFixedFrom = (plan: Pick<LeanPlan, "startsOn" | "every" | "unit">, today: string) =>
  plan.startsOn >= today ? plan.startsOn : nextFixedDue(plan, plan.startsOn, addDaysToKey(today, -1));

// ── Lista ─────────────────────────────────────────────────────

/** Áreas donde quien mira puede crear planes: todas para el admin, la suya para el supervisor. */
async function manageableAreas(actor: Actor): Promise<AreaRef[]> {
  if (!isAdmin(actor) && !actor.isAreaSupervisor) return [];
  const areas = await Area.find(isAdmin(actor) ? { isActive: { $ne: false } } : { _id: actor.areaId })
    .select("name color")
    .sort({ name: 1 })
    .lean();
  return areas.map((area) => ({ id: String(area._id), name: area.name!, color: area.color! }));
}

router.get("/maintenance-plans", validateQuery(planListQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as ParsedPlanListQuery;

  const and: Record<string, unknown>[] = [scopeFilter(actor)];
  if (query.areaId) and.push({ areaId: oid(query.areaId) });
  if (query.state !== "all") and.push({ isActive: query.state === "active" });
  if (query.assetId) {
    const asset = await Asset.findById(query.assetId).select("type areaId").lean();
    and.push(
      asset
        ? { $or: [{ assetId: asset._id }, { assetType: asset.type, areaId: asset.areaId }] }
        : { _id: { $exists: false } },
    );
  }

  const plans = (await MaintenancePlan.find({ $and: and }).sort({ nextDueAt: 1, title: 1 }).lean()) as LeanPlan[];
  const [items, manageable, settings] = await Promise.all([toViews(plans, actor), manageableAreas(actor), getSettings()]);
  res.json({ items, manageableAreas: manageable, defaultLeadDays: settings.maintenance.preventiveLeadDays });
});

// ── Calendario ────────────────────────────────────────────────

/**
 * Los preventivos de un tramo de días (la rejilla de un mes o una semana): las OT que ya existen (con su estado y si están
 * vencidas) y las rondas futuras de los planes activos que todavía no se han
 * generado. De un plan `from_last` solo se conoce la ronda siguiente: las
 * demás dependen de cuándo se complete esa.
 */
router.get("/maintenance-plans/calendar", validateQuery(calendarQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as CalendarQuery;
  const { from, to } = query;
  const today = await companyToday();

  // El filtro del cliente se suma con `$and`: solo estrecha el alcance de la sesión.
  const scope = { $and: [scopeFilter(actor), ...(query.areaId ? [{ areaId: oid(query.areaId) }] : [])] };
  const [orders, plans] = await Promise.all([
    WorkOrder.find({ ...scope, type: "preventive", scheduledFor: { $gte: from, $lte: to } })
      .select("number title status type scheduledFor planId assetId areaId")
      .lean(),
    MaintenancePlan.find({ ...scope, isActive: true, nextDueAt: { $lte: to } }).lean() as Promise<LeanPlan[]>,
  ]);

  // Una ronda con alguna OT ya no se proyecta, aunque sus OT se hayan cancelado.
  const generated = new Set(orders.filter((order) => order.planId).map((order) => `${order.planId}|${order.scheduledFor}`));
  const [areas, assets, coverage] = await Promise.all([
    areaMap([...orders.map((order) => order.areaId), ...plans.map((plan) => plan.areaId)]),
    Asset.find({
      _id: { $in: [...orders.map((order) => order.assetId), ...plans.flatMap((plan) => (plan.assetId ? [plan.assetId] : []))] },
    })
      .select("number name")
      .lean(),
    Promise.all(plans.map((plan) => Asset.countDocuments(coverageFilter(plan)))),
  ]);
  const assetRef = (id: unknown) => {
    const asset = assets.find((item) => String(item._id) === String(id));
    return asset ? { asset: { id: String(asset._id), number: asset.number, name: asset.name } } : {};
  };

  const items: CalendarItem[] = orders
    .filter((order) => order.status !== "cancelled")
    .map((order) => ({
      date: order.scheduledFor!,
      ...(order.planId ? { planId: String(order.planId) } : {}),
      title: order.title,
      area: areas.get(String(order.areaId)) ?? unknownArea(order.areaId),
      kind: "order" as const,
      order: {
        id: String(order._id),
        number: order.number,
        status: order.status as WorkOrderStatus,
        overdue: isWorkOrderOverdue({ type: order.type, status: order.status as WorkOrderStatus, scheduledFor: order.scheduledFor ?? undefined }, today),
      },
      ...assetRef(order.assetId),
    }));

  plans.forEach((plan, index) => {
    const count = coverage[index] ?? 0;
    if (count === 0) return;
    const dates =
      plan.mode === "fixed"
        ? fixedOccurrences(plan, from, to)
        : plan.nextDueAt >= from
          ? [plan.nextDueAt]
          : [];
    for (const date of dates) {
      if (generated.has(`${plan._id}|${date}`)) continue;
      items.push({
        date,
        planId: String(plan._id),
        title: plan.title,
        area: areas.get(String(plan.areaId)) ?? unknownArea(plan.areaId),
        kind: "projected",
        ...(plan.assetId ? assetRef(plan.assetId) : { assetCount: count }),
      });
    }
  });

  items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "es"));
  res.json({ from, to, today, items });
});

// ── Ficha y alta ──────────────────────────────────────────────

router.get("/maintenance-plans/:id", async (req, res) => {
  const actor = res.locals.actor;
  const plan = await loadVisiblePlan(routeParam(req.params["id"]), actor);
  await sendPlan(res, plan._id, actor);
});

/**
 * Un plan de un equipo toma el área que lo mantiene; uno por tipo, la que se
 * indica. Con una fecha inicial pasada, un plan `fixed` arranca en la primera
 * fecha de su calendario que aún no pasó; uno `from_last` no tiene calendario
 * que seguir, así que empieza hoy o después.
 */
router.post("/maintenance-plans", validateBody(createPlanInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as CreatePlanInput & { checklist: string[] };

  let areaId: Types.ObjectId;
  if (input.assetId) {
    const asset = (await Asset.findById(input.assetId).lean()) as LeanAsset | null;
    if (!asset || !canViewAsset(actor, assetRefOf(asset))) {
      throw new AppError(422, "validation_error", "Ese equipo no existe");
    }
    if (asset.status === "retired") {
      throw new AppError(409, "asset_retired", "El equipo está dado de baja y ya no recibe preventivos");
    }
    areaId = asset.areaId;
  } else {
    const area = await Area.findById(input.areaId).select("_id").lean();
    if (!area) throw new AppError(422, "validation_error", "Esa área no existe");
    areaId = area._id;
  }
  assertCanManage({ areaId }, actor);

  const today = await companyToday();
  if (input.mode === "from_last" && input.startsOn < today) {
    throw new AppError(422, "validation_error", "Un plan que cuenta desde el último mantenimiento empieza hoy o después");
  }
  const settings = await getSettings();
  const plan = await MaintenancePlan.create({
    title: input.title,
    ...(input.assetId ? { assetId: oid(input.assetId) } : { assetType: input.assetType }),
    areaId,
    checklist: input.checklist,
    every: input.every,
    unit: input.unit,
    mode: input.mode,
    startsOn: input.startsOn,
    nextDueAt: input.mode === "fixed" ? firstFixedFrom(input, today) : input.startsOn,
    leadDays: input.leadDays ?? settings.maintenance.preventiveLeadDays,
    isActive: true,
    createdById: actor.id,
  });
  await sendPlan(res, plan._id, actor, 201);
});

// ── Edición ───────────────────────────────────────────────────

/**
 * Lo que cubre el plan no cambia. En `fixed`, cualquier cambio de la
 * recurrencia o de la próxima fecha **ancla el calendario** en la próxima
 * fecha: desde ahí cuentan las siguientes. La lista de verificación nueva vale
 * para las OT que se generen después; las abiertas conservan la suya.
 */
router.patch("/maintenance-plans/:id", validateBody(updatePlanInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as UpdatePlanInput;
  const plan = await loadVisiblePlan(routeParam(req.params["id"]), actor);
  assertCanManage(plan, actor);

  const today = await companyToday();
  if (input.nextDueAt !== undefined && input.nextDueAt < today) {
    throw new AppError(422, "validation_error", "La próxima fecha no puede ser pasada");
  }

  const $set: Record<string, unknown> = {};
  for (const key of ["title", "checklist", "every", "unit", "mode", "leadDays", "nextDueAt"] as const) {
    if (input[key] !== undefined) $set[key] = input[key];
  }
  const mode = input.mode ?? plan.mode;
  const recurrenceChanged = ["every", "unit", "mode", "nextDueAt"].some(
    (key) => input[key as keyof UpdatePlanInput] !== undefined && input[key as keyof UpdatePlanInput] !== plan[key as keyof LeanPlan],
  );
  if (mode === "fixed" && recurrenceChanged) $set["startsOn"] = input.nextDueAt ?? plan.nextDueAt;

  if (Object.keys($set).length) await MaintenancePlan.updateOne({ _id: plan._id }, { $set });
  await sendPlan(res, plan._id, actor);
});

/** Pausar no cancela las OT ya generadas: solo deja de generar las siguientes. */
router.post("/maintenance-plans/:id/pause", async (req, res) => {
  const actor = res.locals.actor;
  const plan = await loadVisiblePlan(routeParam(req.params["id"]), actor);
  assertCanManage(plan, actor);
  await MaintenancePlan.updateOne({ _id: plan._id }, { $set: { isActive: false } });
  await sendPlan(res, plan._id, actor);
});

/**
 * Reanudar un plan cuya fecha pasó mientras estaba en pausa no genera de golpe
 * lo atrasado: `fixed` salta a la primera fecha de su calendario desde hoy, y
 * `from_last` se programa para hoy.
 */
router.post("/maintenance-plans/:id/resume", async (req, res) => {
  const actor = res.locals.actor;
  const plan = await loadVisiblePlan(routeParam(req.params["id"]), actor);
  assertCanManage(plan, actor);
  if (plan.assetId) {
    const asset = await Asset.findById(plan.assetId).select("status").lean();
    if (!asset || asset.status === "retired") {
      throw new AppError(409, "asset_retired", "El equipo está dado de baja: este plan ya no puede reanudarse");
    }
  }

  const today = await companyToday();
  const nextDueAt =
    plan.nextDueAt >= today
      ? plan.nextDueAt
      : plan.mode === "fixed"
        ? nextFixedDue(plan, plan.nextDueAt, addDaysToKey(today, -1))
        : today;
  await MaintenancePlan.updateOne({ _id: plan._id }, { $set: { isActive: true, nextDueAt } });
  await sendPlan(res, plan._id, actor);
});

export default router;
