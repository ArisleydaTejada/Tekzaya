import { addDaysToKey, type MaintenanceDashboard } from "@tekzaya/shared";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMaintenanceAlerts } from "../../jobs/maintenanceAlerts.job";
import { nextNumber } from "../../models/counter.model";
import { Asset, SparePart, WorkOrder } from "../../models/maintenance.models";
import { Notification } from "../../models/support.models";
import { connect, disconnect, loginAs, resetDatabase, type Fixture } from "../../test/fixtures";
import { todayKey } from "../assets/asset.view";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

const DAY = 86_400_000;
const today = () => todayKey("America/La_Paz", new Date());

async function seedAsset(fields: Record<string, unknown> = {}) {
  return Asset.create({
    name: "Impresora de Ventas",
    type: "printer",
    location: "Piso 2",
    status: "operational",
    areaId: fixture.areas.it,
    number: await nextNumber("asset"),
    ...fields,
  });
}

/** Correctivas con su fecha: se insertan tal cual para fijar `createdAt` en el pasado. */
async function seedFailures(assetId: Types.ObjectId, daysAgo: number[], status = "completed") {
  await WorkOrder.collection.insertMany(
    await Promise.all(
      daysAgo.map(async (days) => ({
        number: await nextNumber("work_order"),
        type: "corrective",
        title: "No imprime",
        assetId,
        areaId: fixture.areas.it,
        status,
        assigneeIds: [],
        outOfService: false,
        checklist: [],
        partsUsed: [],
        externalCosts: [],
        statusHistory: [],
        costTotal: 1000,
        createdAt: new Date(Date.now() - days * DAY),
        updatedAt: new Date(),
        ...(status === "completed" ? { completedAt: new Date(Date.now() - days * DAY + 3_600_000) } : {}),
      })),
    ),
  );
}

describe("alertas de equipos (plan A6)", () => {
  it("garantía por vencer: un aviso por equipo, y editarla lo rearma", async () => {
    const asset = await seedAsset({ warrantyUntil: addDaysToKey(today(), 10) });
    await seedAsset({ name: "Lejana", warrantyUntil: addDaysToKey(today(), 200) });
    await seedAsset({ name: "Vencida", warrantyUntil: addDaysToKey(today(), -5) });

    expect(await runMaintenanceAlerts()).toMatchObject({ warranty: 1 });
    expect(await runMaintenanceAlerts()).toMatchObject({ warranty: 0 });
    const sent = await Notification.find({ type: "warranty_expiring" }).lean();
    expect(sent).toHaveLength(1);
    expect(String(sent[0]!.userId)).toBe(String(fixture.users.supIt.id));
    expect(String(sent[0]!.assetId)).toBe(String(asset._id));

    // La bandeja enlaza al equipo por su número.
    const inbox = await (await loginAs(fixture.users.supIt.email)).get("/api/v1/notifications");
    expect(inbox.body.items[0]).toMatchObject({ type: "warranty_expiring", assetNumber: asset.number });

    // Renovada, pero aún dentro del aviso: es una garantía nueva y vuelve a avisar.
    const supervisor = await loginAs(fixture.users.supIt.email);
    const edited = await supervisor.patch(`/api/v1/assets/${asset._id}`).send({ warrantyUntil: addDaysToKey(today(), 20) });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(await runMaintenanceAlerts()).toMatchObject({ warranty: 1 });
  });

  it("fallas repetidas: 3 correctivas en 90 días avisan una vez; las canceladas no cuentan", async () => {
    const repeated = await seedAsset();
    await seedFailures(repeated._id, [5, 30, 60]);
    const almost = await seedAsset({ name: "Casi" });
    await seedFailures(almost._id, [5, 30]);
    await seedFailures(almost._id, [10], "cancelled");
    const old = await seedAsset({ name: "Vieja" });
    await seedFailures(old._id, [5, 30, 120]);

    expect(await runMaintenanceAlerts()).toMatchObject({ repeated: 1 });
    expect(await runMaintenanceAlerts()).toMatchObject({ repeated: 0 });
    const sent = await Notification.find({ type: "repeated_failures" }).lean();
    expect(sent.map((item) => String(item.assetId))).toEqual([String(repeated._id)]);
    expect(sent[0]!.body).toMatch(/3 fallas en 90 días/);
  });

  it("pasada la ventana, si el equipo sigue fallando es un problema nuevo", async () => {
    const asset = await seedAsset({ repeatedFailuresNotifiedAt: new Date(Date.now() - 100 * DAY) });
    await seedFailures(asset._id, [1, 2, 3]);
    expect(await runMaintenanceAlerts()).toMatchObject({ repeated: 1 });
  });

  it("los equipos dados de baja no avisan", async () => {
    const asset = await seedAsset({ status: "retired", warrantyUntil: addDaysToKey(today(), 3) });
    await seedFailures(asset._id, [1, 2, 3]);
    expect(await runMaintenanceAlerts()).toEqual({ warranty: 0, repeated: 0 });
  });
});

describe("panel de mantenimiento (plan A6)", () => {
  it("KPI y alertas del área que mantiene los equipos", async () => {
    const asset = await seedAsset({ warrantyUntil: addDaysToKey(today(), 10) });
    await seedFailures(asset._id, [5, 30, 60]);
    await seedFailures(asset._id, [0], "in_progress");
    await SparePart.create({ number: await nextNumber("spare_part"), name: "Tóner", areaId: fixture.areas.it, unit: "unit", stock: 1, minStock: 3, avgUnitCost: 0 });

    const response = await (await loginAs(fixture.users.agentIt.email)).get("/api/v1/maintenance/dashboard");
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const body = response.body as MaintenanceDashboard;
    expect(body.area?.id).toBe(String(fixture.areas.it));
    expect(body.kpis).toMatchObject({ openWorkOrders: 1, lowStockParts: 1 });
    expect(body.alerts.warranty.map((item) => item.name)).toEqual(["Impresora de Ventas"]);
    expect(body.alerts.repeatedFailures[0]).toMatchObject({ name: "Impresora de Ventas", failures: 4 });
    expect(body.alerts.lowStock[0]).toMatchObject({ name: "Tóner", stock: 1, minStock: 3 });
  });

  it("un área que no mantiene equipos no tiene panel; nadie lee el de otra", async () => {
    await seedAsset();
    expect((await (await loginAs(fixture.users.employeeVentas.email)).get("/api/v1/maintenance/dashboard")).status).toBe(404);
    expect((await (await loginAs(fixture.users.supVentas.email)).get("/api/v1/maintenance/dashboard")).status).toBe(404);
    const other = await (await loginAs(fixture.users.agentIt.email)).get(`/api/v1/maintenance/dashboard?areaId=${String(fixture.areas.ventas)}`);
    expect(other.status).toBe(403);
  });

  it("el admin ve todas las áreas y puede elegir una", async () => {
    await seedAsset();
    const admin = await loginAs(fixture.users.admin.email);
    const all = (await admin.get("/api/v1/maintenance/dashboard")).body as MaintenanceDashboard;
    expect(all.area).toBeUndefined();
    expect(all.areas.map((area) => area.id)).toEqual([String(fixture.areas.it)]);
    const one = (await admin.get(`/api/v1/maintenance/dashboard?areaId=${String(fixture.areas.it)}`)).body as MaintenanceDashboard;
    expect(one.area?.id).toBe(String(fixture.areas.it));
  });
});
