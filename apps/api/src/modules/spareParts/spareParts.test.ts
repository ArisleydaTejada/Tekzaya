import { weightedAverageCost } from "@tekzaya/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Types } from "mongoose";
import { nextNumber } from "../../models/counter.model";
import { Asset, SparePart, StockMovement } from "../../models/maintenance.models";
import { Notification } from "../../models/support.models";
import { connect, disconnect, loginAs, resetDatabase, type Fixture } from "../../test/fixtures";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

type Agent = Awaited<ReturnType<typeof loginAs>>;

/** El stock en caché y la suma del libro: tienen que ser siempre el mismo número. */
async function ledgerOf(partId: Types.ObjectId | string) {
  const part = await SparePart.findById(partId).lean();
  const movements = await StockMovement.find({ partId }).lean();
  return { stock: part!.stock, ledger: movements.reduce((sum, movement) => sum + movement.qty, 0) };
}

async function createPart(agent: Agent, body: Record<string, unknown> = {}) {
  const response = await agent.post("/api/v1/spare-parts").send({
    name: "Tóner HP 58A",
    areaId: String(fixture.areas.it),
    unit: "unit",
    minStock: 3,
    initialStock: { qty: 10, unitCost: 2000 },
    ...body,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as { id: string; number: number };
}

/** Una OT en curso del agente de IT, lista para consumir repuestos. */
async function orderInProgress(agent: Agent) {
  const asset = await Asset.create({
    name: "Impresora de Finanzas",
    type: "printer",
    location: "Piso 3",
    status: "operational",
    areaId: fixture.areas.it,
    number: await nextNumber("asset"),
  });
  const order = await agent
    .post("/api/v1/work-orders")
    .send({ assetId: String(asset._id), type: "corrective", title: "Imprime manchado", outOfService: false });
  await agent.post(`/api/v1/work-orders/${order.body.id}/take`);
  await agent.patch(`/api/v1/work-orders/${order.body.id}`).send({ status: "in_progress" });
  return order.body.id as string;
}

describe("catálogo y libro (DoD de A4)", () => {
  it("alta con existencias, entrada, consumo, devolución y ajuste: el stock es siempre la suma del libro", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const part = await createPart(supervisor);
    expect(await ledgerOf(part.id)).toEqual({ stock: 10, ledger: 10 });

    // Entrada de 10 a 30,00: el promedio pasa a 25,00.
    const entry = await supervisor
      .post(`/api/v1/spare-parts/${part.id}/movements`)
      .send({ kind: "in", qty: 10, unitCost: 3000, reason: "Factura 1182" });
    expect(entry.status).toBe(201);
    expect(entry.body).toMatchObject({ stock: 20, avgUnitCost: weightedAverageCost(10, 2000, 10, 3000), stockValue: 20 * 2500 });

    // Un técnico consume 4 en una OT, al costo de ese momento, y devuelve 1.
    const agent = await loginAs(fixture.users.agentIt.email);
    const orderId = await orderInProgress(agent);
    const used = await agent.post(`/api/v1/work-orders/${orderId}/parts`).send({ partId: part.id, qty: 4 });
    expect(used.body.partsUsed[0]).toMatchObject({ qty: 4, unitCost: 2500 });
    await agent.post(`/api/v1/work-orders/${orderId}/parts`).send({ partId: part.id, qty: 1 });
    const single = (await agent.get(`/api/v1/work-orders/${orderId}`)).body.partsUsed[1].id as string;
    await agent.delete(`/api/v1/work-orders/${orderId}/parts/${single}`);

    // Conteo físico: faltan 2.
    const adjusted = await supervisor
      .post(`/api/v1/spare-parts/${part.id}/movements`)
      .send({ kind: "adjust", qty: -2, reason: "Conteo físico: faltante" });
    expect(adjusted.body.stock).toBe(14);
    expect(await ledgerOf(part.id)).toEqual({ stock: 14, ledger: 14 });

    // El libro, más reciente primero, con el saldo de cada paso y la OT de los consumos.
    const ledger = await supervisor.get(`/api/v1/spare-parts/${part.id}/movements`);
    expect(ledger.body.items.map((item: { kind: string; qty: number; balance: number }) => [item.kind, item.qty, item.balance])).toEqual([
      ["adjust", -2, 14],
      ["return", 1, 16],
      ["consume", -1, 15],
      ["consume", -4, 16],
      ["in", 10, 20],
      ["in", 10, 10],
    ]);
    expect(ledger.body.items[3].workOrder).toBeDefined();
    expect(ledger.body.items[0].actor.name).toBe("Sonia Supervisora");

    // Con paginación, el saldo sigue cuadrando desde el stock de hoy.
    const page2 = await supervisor.get(`/api/v1/spare-parts/${part.id}/movements?page=2&limit=4`);
    expect(page2.body.items.map((item: { balance: number }) => item.balance)).toEqual([20, 10]);
  });

  it("un ajuste a la baja nunca deja el stock en negativo, y exige motivo", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const part = await createPart(supervisor, { initialStock: { qty: 2, unitCost: 1000 } });
    const url = `/api/v1/spare-parts/${part.id}/movements`;

    expect((await supervisor.post(url).send({ kind: "adjust", qty: -3, reason: "Merma" })).status).toBe(409);
    expect((await supervisor.post(url).send({ kind: "adjust", qty: -1 })).status).toBe(422);
    expect((await supervisor.post(url).send({ kind: "adjust", qty: 0, reason: "Nada" })).status).toBe(422);

    // Un sobrante entra al costo de hoy y no mueve el promedio.
    const extra = await supervisor.post(url).send({ kind: "adjust", qty: 3, reason: "Conteo físico: sobrante" });
    expect(extra.body).toMatchObject({ stock: 5, avgUnitCost: 1000 });
    expect(await ledgerOf(part.id)).toEqual({ stock: 5, ledger: 5 });
  });

  it("la devolución vuelve al costo con el que salió y el promedio lo refleja", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const part = await createPart(supervisor, { initialStock: { qty: 2, unitCost: 1000 } });
    const agent = await loginAs(fixture.users.agentIt.email);
    const orderId = await orderInProgress(agent);
    const used = await agent.post(`/api/v1/work-orders/${orderId}/parts`).send({ partId: part.id, qty: 2 });

    // Mientras estaba fuera se compró más caro.
    await supervisor.post(`/api/v1/spare-parts/${part.id}/movements`).send({ kind: "in", qty: 2, unitCost: 2000 });
    await agent.delete(`/api/v1/work-orders/${orderId}/parts/${used.body.partsUsed[0].id}`);

    // 2 a 20,00 + 2 devueltas a 10,00 = 4 a 15,00.
    const after = (await SparePart.findById(part.id).lean())!;
    expect(after).toMatchObject({ stock: 4, avgUnitCost: 1500 });
  });
});

describe("aviso de stock bajo", () => {
  it("avisa al supervisor la primera vez que se cruza el mínimo, y se rearma al reponer", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const part = await createPart(supervisor, { minStock: 3, initialStock: { qty: 4, unitCost: 1000 } });
    const agent = await loginAs(fixture.users.agentIt.email);
    const orderId = await orderInProgress(agent);
    const lowNotices = () => Notification.countDocuments({ type: "low_stock", userId: fixture.users.supIt.id });

    await agent.post(`/api/v1/work-orders/${orderId}/parts`).send({ partId: part.id, qty: 1 }); // 3: en el mínimo
    expect(await lowNotices()).toBe(0);
    await agent.post(`/api/v1/work-orders/${orderId}/parts`).send({ partId: part.id, qty: 1 }); // 2: lo cruza
    expect(await lowNotices()).toBe(1);
    await agent.post(`/api/v1/work-orders/${orderId}/parts`).send({ partId: part.id, qty: 1 }); // 1: ya avisado
    expect(await lowNotices()).toBe(1);

    const bell = await supervisor.get("/api/v1/notifications");
    expect(bell.body.items[0]).toMatchObject({
      type: "low_stock",
      title: "Stock bajo: Tóner HP 58A",
      sparePartId: part.id,
      sparePartNumber: part.number,
    });
    // El técnico que lo consumió no recibe el aviso.
    expect(await Notification.countDocuments({ type: "low_stock", userId: fixture.users.agentIt.id })).toBe(0);

    // Reponer quita la marca; volver a cruzar avisa otra vez.
    await supervisor.post(`/api/v1/spare-parts/${part.id}/movements`).send({ kind: "in", qty: 5, unitCost: 1000 });
    expect((await SparePart.findById(part.id).lean())!.lowStockNotifiedAt).toBeUndefined();
    await agent.post(`/api/v1/work-orders/${orderId}/parts`).send({ partId: part.id, qty: 4 });
    expect(await lowNotices()).toBe(2);
  });

  it("subir el mínimo por encima del stock también avisa", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const admin = await loginAs(fixture.users.admin.email);
    const part = await createPart(supervisor, { minStock: 1, initialStock: { qty: 4, unitCost: 1000 } });
    const raised = await admin.patch(`/api/v1/spare-parts/${part.id}`).send({ minStock: 6 });
    expect(raised.body.low).toBe(true);
    expect(await Notification.countDocuments({ type: "low_stock", userId: fixture.users.supIt.id })).toBe(1);
  });
});

describe("permisos y lista", () => {
  it("el área lo ve, el supervisor lo gestiona, RRHH lee y el resto no lo encuentra", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const part = await createPart(supervisor);
    const url = `/api/v1/spare-parts/${part.id}`;

    const agent = await loginAs(fixture.users.agentIt.email);
    expect((await agent.get(url)).body.permissions.manage).toBe(false);
    expect((await agent.post(`${url}/movements`).send({ kind: "in", qty: 1, unitCost: 100 })).status).toBe(403);
    expect((await agent.patch(url).send({ minStock: 0 })).status).toBe(403);
    expect(
      (await agent.post("/api/v1/spare-parts").send({ name: "Otro", areaId: String(fixture.areas.it), unit: "unit", minStock: 0 })).status,
    ).toBe(403);

    const employee = await loginAs(fixture.users.employeeVentas.email);
    expect((await employee.get(url)).status).toBe(404);
    expect((await employee.get("/api/v1/spare-parts")).body.total).toBe(0);
    // El supervisor de Ventas no da de alta en el almacén de IT.
    const supVentas = await loginAs(fixture.users.supVentas.email);
    expect(
      (await supVentas.post("/api/v1/spare-parts").send({ name: "Otro", areaId: String(fixture.areas.it), unit: "unit", minStock: 0 })).status,
    ).toBe(403);

    const rrhh = await loginAs(fixture.users.supRrhh.email);
    expect((await rrhh.get(url)).body.permissions.manage).toBe(false);
    expect((await rrhh.get(`${url}/movements`)).status).toBe(200);
    expect((await rrhh.post(`${url}/movements`).send({ kind: "in", qty: 1, unitCost: 100 })).status).toBe(403);
  });

  it("filtra bajo mínimo sin vaciar el resumen; un desactivado sale del selector de las OT", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    await createPart(supervisor, { name: "Tóner HP 58A", minStock: 4, initialStock: { qty: 1, unitCost: 11500 } });
    const rollers = await createPart(supervisor, { name: "Kit de rodillos", minStock: 2, initialStock: { qty: 5, unitCost: 3500 } });

    const low = await supervisor.get("/api/v1/spare-parts?low=true");
    expect(low.body.items.map((item: { name: string }) => item.name)).toEqual(["Tóner HP 58A"]);
    expect(low.body.summary).toEqual({ total: 2, low: 1, stockValue: 11500 + 5 * 3500 });
    expect(low.body.manageableAreas.map((area: { id: string }) => area.id)).toEqual([String(fixture.areas.it)]);
    expect((await supervisor.get("/api/v1/spare-parts?q=REP-2")).body.items[0].name).toBe("Kit de rodillos");

    await supervisor.patch(`/api/v1/spare-parts/${rollers.id}`).send({ isActive: false });
    expect((await supervisor.get("/api/v1/spare-parts")).body.total).toBe(1);
    expect((await supervisor.get("/api/v1/spare-parts?state=inactive")).body.items[0].name).toBe("Kit de rodillos");
    expect((await supervisor.post(`/api/v1/spare-parts/${rollers.id}/movements`).send({ kind: "in", qty: 1, unitCost: 1 })).status).toBe(409);

    const agent = await loginAs(fixture.users.agentIt.email);
    const orderId = await orderInProgress(agent);
    const options = await agent.get(`/api/v1/work-orders/${orderId}/part-options`);
    expect(options.body.items.map((item: { name: string }) => item.name)).toEqual(["Tóner HP 58A"]);
    expect((await agent.post(`/api/v1/work-orders/${orderId}/parts`).send({ partId: rollers.id, qty: 1 })).status).toBe(422);

    const csv = await supervisor.get("/api/v1/spare-parts/export?state=all");
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("Tóner HP 58A");
    expect(csv.text).toContain("Desactivado");
  });
});

describe("equipos en los que se usa", () => {
  it("se vinculan al darlo de alta, filtran la lista y solo valen los equipos del área", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const printer = await Asset.create({
      name: "Impresora de Ventas",
      type: "printer",
      location: "Piso 2",
      status: "operational",
      areaId: fixture.areas.it,
      number: await nextNumber("asset"),
    });
    const foreign = await Asset.create({
      name: "Montacargas",
      type: "vehicle",
      location: "Bodega",
      status: "operational",
      areaId: fixture.areas.ventas,
      number: await nextNumber("asset"),
    });

    const rejected = await supervisor.post("/api/v1/spare-parts").send({
      name: "Batería",
      areaId: String(fixture.areas.it),
      unit: "unit",
      minStock: 0,
      assetIds: [String(foreign._id)],
    });
    expect(rejected.status).toBe(422);

    const part = await createPart(supervisor, { assetIds: [String(printer._id)] });
    const detail = await supervisor.get(`/api/v1/spare-parts/${part.id}`);
    expect(detail.body.assets).toEqual([expect.objectContaining({ name: "Impresora de Ventas", status: "operational" })]);

    await createPart(supervisor, { name: "Cable de red" });
    const forPrinter = await supervisor.get(`/api/v1/spare-parts?assetId=${String(printer._id)}`);
    expect(forPrinter.body.items.map((item: { name: string }) => item.name)).toEqual(["Tóner HP 58A"]);

    const unlinked = await supervisor.patch(`/api/v1/spare-parts/${part.id}`).send({ assetIds: [] });
    expect(unlinked.body.assets).toEqual([]);
  });
});
