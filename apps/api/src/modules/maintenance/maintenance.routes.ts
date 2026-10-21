import {
  addDaysToKey,
  isAdmin,
  maintenanceDashboardQuery,
  wallClockIn,
  zonedTimeToUtc,
  type AreaRef,
  type MaintenanceDashboard,
  type MaintenanceDashboardQuery,
  type PartUnit,
} from "@tekzaya/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { validateQuery } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { Asset, SparePart, WorkOrder } from "../../models/maintenance.models";
import { todayKey } from "../assets/asset.view";
import { getSettings } from "../settings/settings.service";
import { OPEN_WORK_ORDER } from "../workOrders/workOrder.lifecycle";
import { repeatedFailures, warrantyExpiring } from "./alerts";

/**
 * Plan A6: el panel de mantenimiento. Lo ve quien ve las órdenes de trabajo —el
 * área que mantiene equipos, RRHH y el admin—, con el mismo alcance: el área
 * propia, o todas (o una a elegir) para quien tiene lectura global.
 */
const router = Router();

const oid = (value: string) => new Types.ObjectId(value);
const areaRefOf = (area: { _id: unknown; name?: string | null; color?: string | null }): AreaRef => ({
  id: String(area._id),
  name: area.name ?? "Área",
  color: area.color ?? "#7c8cae",
});

/** Lunes y domingo de la semana en curso, como fechas de calendario de la empresa. */
function weekKeys(today: string): { monday: string; sunday: string } {
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const monday = addDaysToKey(today, -((weekday + 6) % 7));
  return { monday, sunday: addDaysToKey(monday, 6) };
}

router.get("/maintenance/dashboard", validateQuery(maintenanceDashboardQuery), async (_req, res) => {
  const actor = res.locals.actor;
  const query = res.locals.query as MaintenanceDashboardQuery;
  const global = isAdmin(actor) || actor.hasGlobalReadAccess;

  // Sin lectura global, el panel es el del área propia y solo si mantiene equipos:
  // al resto le responde 404, como las órdenes de trabajo.
  let areaId: string | undefined;
  if (global) {
    areaId = query.areaId;
  } else {
    if (query.areaId && query.areaId !== actor.areaId) {
      throw new AppError(403, "forbidden", "Solo puedes ver el panel de tu área");
    }
    if (!(await Asset.exists({ areaId: oid(actor.areaId) }))) {
      throw new AppError(404, "not_found", "Tu área no mantiene equipos");
    }
    areaId = actor.areaId;
  }
  const byArea = areaId ? { areaId: oid(areaId) } : {};

  const settings = await getSettings();
  const zone = settings.businessHours.timezone;
  const now = new Date();
  const today = todayKey(zone, now);
  const week = weekKeys(today);
  const clock = wallClockIn(now, zone);
  const monthStart = zonedTimeToUtc({ ...clock, day: 1 }, 0, 0, zone);

  const [open, weekPreventives, overdue, lowStock, cost, warranty, repeated, area, maintainingAreas] = await Promise.all([
    WorkOrder.countDocuments({ ...byArea, ...OPEN_WORK_ORDER }),
    WorkOrder.find({
      ...byArea,
      type: "preventive",
      status: { $ne: "cancelled" },
      scheduledFor: { $gte: week.monday, $lte: week.sunday },
    })
      .select("status")
      .lean(),
    WorkOrder.countDocuments({ ...byArea, type: "preventive", scheduledFor: { $lt: today }, ...OPEN_WORK_ORDER }),
    SparePart.find({ ...byArea, isActive: true, $expr: { $lt: ["$stock", "$minStock"] } })
      .select("number name unit stock minStock")
      .sort({ stock: 1, name: 1 })
      .lean(),
    WorkOrder.aggregate<{ total: number }>([
      { $match: { ...byArea, status: "completed", completedAt: { $gte: monthStart, $lte: now } } },
      { $group: { _id: null, total: { $sum: "$costTotal" } } },
    ]),
    warrantyExpiring(settings.maintenance, today, byArea),
    repeatedFailures(settings.maintenance, now, byArea),
    areaId ? Area.findById(areaId).select("name color").lean() : null,
    global ? Asset.distinct("areaId") : [],
  ]);

  const areas = global
    ? (await Area.find({ _id: { $in: maintainingAreas } }).select("name color").sort({ name: 1 }).lean()).map(areaRefOf)
    : [];

  const response: MaintenanceDashboard = {
    ...(area ? { area: areaRefOf(area) } : {}),
    areas,
    currency: settings.maintenance.currency,
    kpis: {
      openWorkOrders: open,
      preventivesThisWeek: {
        total: weekPreventives.length,
        done: weekPreventives.filter((order) => order.status === "completed").length,
      },
      preventivesOverdue: overdue,
      lowStockParts: lowStock.length,
      monthCost: cost[0]?.total ?? 0,
    },
    alerts: {
      warranty: warranty.map((asset) => ({
        id: String(asset._id),
        number: asset.number,
        name: asset.name,
        warrantyUntil: asset.warrantyUntil!,
      })),
      repeatedFailures: repeated.map((asset) => ({
        id: String(asset._id),
        number: asset.number,
        name: asset.name,
        failures: asset.failures,
      })),
      lowStock: lowStock.map((part) => ({
        id: String(part._id),
        number: part.number,
        name: part.name,
        unit: part.unit as PartUnit,
        stock: part.stock,
        minStock: part.minStock,
      })),
    },
    rules: {
      warrantyAlertDays: settings.maintenance.warrantyAlertDays,
      repeatedFailure: settings.maintenance.repeatedFailure,
    },
  };
  res.json(response);
});

export default router;
