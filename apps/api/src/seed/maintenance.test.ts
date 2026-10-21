import {
  asset as assetSchema,
  assetEvent as assetEventSchema,
  DEFAULT_SETTINGS,
  downtimeMinutes,
  maintenancePlan as planSchema,
  sparePart as sparePartSchema,
  stockMovement as stockMovementSchema,
  workOrder as workOrderSchema,
  workOrderCost,
  type AssetStatus,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Area } from "../models/area.model";
import {
  Asset,
  AssetEvent,
  MaintenancePlan,
  SparePart,
  StockMovement,
  WorkOrder,
} from "../models/maintenance.models";
import { Notification, Settings, SETTINGS_ID } from "../models/support.models";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { connect, disconnect, resetDatabase, seedTicket, type Fixture } from "../test/fixtures";
import { runPreventiveJob } from "../jobs/preventive.job";
import { seedMaintenance, type MaintenanceSeedSummary } from "./maintenance";

/**
 * La semilla del módulo 2 es material de defensa: MTBF, costos y stock tienen que
 * cuadrar, y añadirla no puede cambiar nada del módulo 1 (DoD de A0).
 */

let fixture: Fixture;
let summary: MaintenanceSeedSummary;
let ticketsBefore: unknown;
const now = new Date();

/** Del documento de Mongo a lo que viajaría por la API, para validar el contrato. */
function toWire(value: unknown): unknown {
  if (value instanceof Types.ObjectId) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "__v")
        .map(([key, item]) => [key === "_id" ? "id" : key, toWire(item)]),
    );
  }
  return value;
}

beforeAll(async () => {
  await connect();
  fixture = await resetDatabase();
  const maintenance = new Types.ObjectId();
  await Area.create({ _id: maintenance, name: "Mantenimiento", color: "#f5a623", isActive: true, categories: [] });
  await User.insertMany(
    [
      { name: "Pablo Planta", isAreaSupervisor: true },
      { name: "Rosa Llave", isAreaSupervisor: false },
    ].map((person, index) => ({
      ...person,
      email: `mant${index}@tekzaya.test`,
      passwordHash: "x",
      areaId: maintenance,
      role: "employee",
      status: "active",
      availability: { state: "available" },
    })),
  );
  await seedTicket({ areaId: fixture.areas.it, requesterId: fixture.users.employeeVentas.id });
  await seedTicket({
    areaId: fixture.areas.it,
    requesterId: fixture.users.employeeVentas.id,
    assigneeIds: [fixture.users.agentIt.id],
    status: "in_progress",
  });
  ticketsBefore = await Ticket.find().sort({ number: 1 }).lean();
  summary = await seedMaintenance(now);
});
afterAll(disconnect);

describe("semilla del módulo 2", () => {
  it("no toca los datos del módulo 1", async () => {
    expect(await Ticket.find().sort({ number: 1 }).lean()).toEqual(ticketsBefore);
    const settings = await Settings.findById(SETTINGS_ID).lean();
    expect(settings?.slaPolicies).toEqual(DEFAULT_SETTINGS.slaPolicies);
    expect(settings?.businessHours).toEqual(DEFAULT_SETTINGS.businessHours);
  });

  it("trae lo que la demo necesita", () => {
    expect(summary.assets).toBeGreaterThanOrEqual(50);
    expect(summary.workOrders).toBeGreaterThanOrEqual(100);
    expect(summary.parts).toBe(25);
    expect(summary.lowStock).toHaveLength(2);
    expect(summary.plans).toBe(8);
    expect(summary.overduePlans).toHaveLength(1);
    // Fallas repetidas: tres correctivas en 90 días (umbral por defecto) y
    // reparaciones por encima de la mitad del precio de compra (regla de A7).
    expect(summary.repeatedFailure.last90Days).toBeGreaterThanOrEqual(3);
    expect(summary.repeatedFailure.repairCost).toBeGreaterThanOrEqual(summary.repeatedFailure.purchaseCost / 2);
  });

  it("cumple el contrato compartido", async () => {
    for (const doc of await Asset.find().lean()) assetSchema.parse(toWire(doc));
    for (const doc of await AssetEvent.find().lean()) assetEventSchema.parse(toWire(doc));
    for (const doc of await WorkOrder.find().lean()) workOrderSchema.parse(toWire(doc));
    for (const doc of await MaintenancePlan.find().lean()) planSchema.parse(toWire(doc));
    for (const doc of await SparePart.find().lean()) sparePartSchema.parse(toWire(doc));
    for (const doc of await StockMovement.find().lean()) stockMovementSchema.parse(toWire(doc));
  });

  it("el stock es la suma de sus movimientos y nunca fue negativo", async () => {
    for (const part of await SparePart.find().lean()) {
      const movements = await StockMovement.find({ partId: part._id }).sort({ at: 1 }).lean();
      let running = 0;
      for (const movement of movements) {
        running += movement.qty;
        expect(running, `${part.name} en ${movement.at.toISOString()}`).toBeGreaterThanOrEqual(0);
      }
      expect(running).toBe(part.stock);
    }
  });

  it("el costo de cada OT cuadra, con el repuesto al costo con que salió del almacén", async () => {
    const consumed = await StockMovement.find({ kind: "consume" }).lean();
    for (const order of await WorkOrder.find().lean()) {
      expect(order.costTotal).toBe(workOrderCost(order).total);
      for (const use of order.partsUsed) {
        const movement = consumed.find(
          (item) => item.workOrderId?.equals(order._id) && item.partId.equals(use.partId) && item.qty === -use.qty,
        );
        expect(movement?.unitCost).toBe(use.unitCost);
      }
    }
  });

  it("nada ocurre en el futuro y el estado del activo coincide con su historial", async () => {
    const events = await AssetEvent.find().sort({ at: 1 }).lean();
    expect(events.every((event) => event.at <= now)).toBe(true);
    const orders = await WorkOrder.find().lean();
    expect(orders.every((order) => order.createdAt <= now && (!order.completedAt || order.completedAt <= now))).toBe(true);

    for (const asset of await Asset.find().lean()) {
      const changes = events.filter(
        (event) => event.assetId.equals(asset._id) && event.kind === "status_changed",
      );
      const last = (changes.at(-1)?.data as { to?: AssetStatus } | undefined)?.to ?? "operational";
      expect(asset.status, asset.name).toBe(last);
    }
  });

  it("el equipo de las fallas repetidas tiene tiempo de parada medible", async () => {
    const printer = await Asset.findOne({ name: "Impresora multifuncional de Ventas" }).lean();
    const events = await AssetEvent.find({ assetId: printer!._id }).sort({ at: 1 }).lean();
    const changes = events
      .filter((event) => event.kind === "created" || event.kind === "status_changed")
      .map((event) => ({
        status: (event.kind === "created" ? "operational" : (event.data as { to: AssetStatus }).to) as AssetStatus,
        at: event.at,
      }));
    const calendar = { hours: DEFAULT_SETTINGS.businessHours, holidays: [] };
    const year = new Date(now.getTime() - 365 * 86_400_000);
    expect(downtimeMinutes(changes, year, now, calendar)).toBeGreaterThan(0);
  });

  it("el primer trabajo de preventivos no repite avisos ni rondas de la semilla", async () => {
    const vencidos = await WorkOrder.countDocuments({ type: "preventive", overdueNotifiedAt: { $exists: true } });
    expect(vencidos).toBeGreaterThan(0);
    expect(await Notification.countDocuments({ type: "preventive_overdue" })).toBeGreaterThanOrEqual(vencidos);

    const first = await runPreventiveJob(now);
    expect(first.overdue).toBe(0);
    // Lo que la primera pasada tuviera pendiente, la segunda ya no lo repite.
    expect(await runPreventiveJob(now)).toEqual({ generated: 0, advanced: 0, overdue: 0 });
  });

  it("se puede repetir: vuelve a dejar el mismo módulo 2", async () => {
    const again = await seedMaintenance(now);
    expect(again.assets).toBe(summary.assets);
    expect(await Asset.countDocuments()).toBe(summary.assets);
    expect(await WorkOrder.countDocuments()).toBe(summary.workOrders);
  });
});
