import { addDaysToKey } from "@tekzaya/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Asset, WorkOrder } from "../../models/maintenance.models";
import { connect, disconnect, loginAs, resetDatabase, type Fixture } from "../../test/fixtures";
import { todayKey } from "./asset.view";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

type Agent = Awaited<ReturnType<typeof loginAs>>;

async function create(agent: Agent, body: Record<string, unknown>) {
  return agent.post("/api/v1/assets").send({ type: "laptop", location: "Piso 1 · Ventas", ...body });
}

describe("recorrido del supervisor (DoD de A1)", () => {
  it("crea un activo con foto, lo mueve y lo da de baja; los tres pasos quedan en la línea de tiempo", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const upload = await supervisor
      .post("/api/v1/attachments")
      .attach("file", PNG, { filename: "laptop.png", contentType: "image/png" });
    expect(upload.status).toBe(201);

    const created = await create(supervisor, {
      name: "Laptop de Vito",
      brand: "Dell",
      model: "Latitude 5440",
      areaId: String(fixture.areas.it),
      usedByAreaId: String(fixture.areas.ventas),
      custodianId: String(fixture.users.employeeVentas.id),
      purchaseCost: 112_900,
      warrantyUntil: "2028-01-31",
      photoId: upload.body.id,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.number).toBe(1);
    expect(created.body.status).toBe("operational");
    expect(created.body.custodian.name).toBe("Vito Ventas");
    expect(created.body.permissions).toEqual({ manage: true, viewDetails: true });
    const id = created.body.id as string;

    const moved = await supervisor.patch(`/api/v1/assets/${id}`).send({ location: "Piso 3 · Finanzas" });
    expect(moved.status).toBe(200);
    expect(moved.body.location).toBe("Piso 3 · Finanzas");

    const retired = await supervisor
      .post(`/api/v1/assets/ACT-0001/retire`)
      .send({ reason: "Pantalla rota; la reparación cuesta más que el equipo." });
    expect(retired.status).toBe(200);
    expect(retired.body.status).toBe("retired");
    expect(retired.body.permissions.manage).toBe(false);

    const events = await supervisor.get(`/api/v1/assets/${id}/events`);
    expect(events.status).toBe(200);
    expect(events.body.items.map((event: { kind: string }) => event.kind)).toEqual([
      "retired",
      "status_changed",
      "moved",
      "created",
    ]);
    const move = events.body.items[2];
    expect(move.data).toMatchObject({ from: "Piso 1 · Ventas", to: "Piso 3 · Finanzas" });
    expect(move.actor.name).toBe("Sonia Supervisora");

    // Dado de baja ya no se edita ni se vuelve a dar de baja.
    expect((await supervisor.patch(`/api/v1/assets/${id}`).send({ location: "Otro" })).status).toBe(409);
    expect((await supervisor.post(`/api/v1/assets/${id}/retire`).send({ reason: "Otra vez" })).status).toBe(409);
  });

  it("cambiar la persona a cargo deja su paso con los dos nombres", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const created = await create(supervisor, {
      name: "Laptop",
      areaId: String(fixture.areas.it),
      custodianId: String(fixture.users.employeeIt.id),
    });
    await supervisor
      .patch(`/api/v1/assets/${created.body.id}`)
      .send({ custodianId: String(fixture.users.agentIt.id) });
    const events = await supervisor.get(`/api/v1/assets/${created.body.id}/events`);
    expect(events.body.items[0]).toMatchObject({
      kind: "custodian_changed",
      data: { fromName: "Elsa Empleada", toName: "Aldo Agente" },
    });

    // `null` la quita: no es lo mismo que no tocarla.
    const cleared = await supervisor.patch(`/api/v1/assets/${created.body.id}`).send({ custodianId: null });
    expect(cleared.body.custodian).toBeUndefined();
  });
});

describe("quién ve qué", () => {
  let laptopVito: string;
  let serverIt: string;

  beforeEach(async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    laptopVito = (
      await create(supervisor, {
        name: "Laptop de Vito",
        areaId: String(fixture.areas.it),
        usedByAreaId: String(fixture.areas.ventas),
        custodianId: String(fixture.users.employeeVentas.id),
        purchaseCost: 100_000,
      })
    ).body.id;
    await create(supervisor, {
      name: "Impresora de Ventas",
      type: "printer",
      areaId: String(fixture.areas.it),
      usedByAreaId: String(fixture.areas.ventas),
      purchaseCost: 40_000,
    });
    serverIt = (
      await create(supervisor, {
        name: "Servidor",
        type: "server",
        areaId: String(fixture.areas.it),
        location: "Cuarto de servidores",
        purchaseCost: 250_000,
      })
    ).body.id;
  });

  it("el empleado de Ventas solo ve lo que usa su área o tiene a cargo, y nunca un precio", async () => {
    const empleado = await loginAs(fixture.users.employeeVentas.email);
    const list = await empleado.get("/api/v1/assets");
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { name: string }) => item.name).sort()).toEqual([
      "Impresora de Ventas",
      "Laptop de Vito",
    ]);
    expect(list.body.items.every((item: object) => !("purchaseCost" in item))).toBe(true);
    expect(list.body.items.every((item: { permissions: { viewDetails: boolean } }) => !item.permissions.viewDetails)).toBe(true);

    const detail = await empleado.get(`/api/v1/assets/${laptopVito}`);
    expect(detail.status).toBe(200);
    expect(detail.body.purchaseCost).toBeUndefined();
    expect(detail.body.openWorkOrders).toBeUndefined();

    // Lo ajeno no existe para él, y la historia de lo suyo es del área que lo mantiene.
    expect((await empleado.get(`/api/v1/assets/${serverIt}`)).status).toBe(404);
    expect((await empleado.get(`/api/v1/assets/${laptopVito}/events`)).status).toBe(403);

    // Pedir el área de otro como filtro no amplía nada.
    const widened = await empleado.get(`/api/v1/assets?areaId=${String(fixture.areas.it)}`);
    expect(widened.body.total).toBe(2);

    // Tampoco en el CSV.
    const csv = await empleado.get("/api/v1/assets/export");
    expect(csv.status).toBe(200);
    expect(csv.text).not.toContain("1000.00");
    expect(csv.text).not.toContain("Servidor");
  });

  it("el técnico del área responsable y RRHH ven todo con costos; solo el supervisor gestiona", async () => {
    for (const email of [fixture.users.agentIt.email, fixture.users.supRrhh.email]) {
      const agent = await loginAs(email);
      const list = await agent.get("/api/v1/assets");
      expect(list.body.total).toBe(3);
      expect(list.body.items.every((item: { purchaseCost?: number }) => item.purchaseCost !== undefined)).toBe(true);
      expect(list.body.items.every((item: { permissions: { manage: boolean } }) => !item.permissions.manage)).toBe(true);
      expect((await agent.get(`/api/v1/assets/${serverIt}/events`)).status).toBe(200);
      expect((await agent.patch(`/api/v1/assets/${serverIt}`).send({ location: "Otro" })).status).toBe(403);
    }
  });

  it("filtra, busca y resume por estado sin vaciar el resumen", async () => {
    const tecnico = await loginAs(fixture.users.agentIt.email);
    const printers = await tecnico.get("/api/v1/assets?type=printer");
    expect(printers.body.items.map((item: { name: string }) => item.name)).toEqual(["Impresora de Ventas"]);

    const byNumber = await tecnico.get("/api/v1/assets?q=ACT-0003");
    expect(byNumber.body.items.map((item: { name: string }) => item.name)).toEqual(["Servidor"]);

    const retiredOnly = await tecnico.get("/api/v1/assets?status=retired");
    expect(retiredOnly.body.total).toBe(0);
    expect(retiredOnly.body.statusCounts).toEqual({ operational: 3, in_repair: 0, retired: 0 });
    expect(retiredOnly.body.currency).toBe("USD");
  });

  it("«área que lo usa» encuentra también los equipos que usa su propia área responsable", async () => {
    const tecnico = await loginAs(fixture.users.agentIt.email);
    const usedByIt = await tecnico.get(`/api/v1/assets?usedByAreaId=${String(fixture.areas.it)}`);
    // El servidor no tiene "área que lo usa": la usa IT, que lo mantiene.
    expect(usedByIt.body.items.map((item: { name: string }) => item.name)).toEqual(["Servidor"]);

    const usedByVentas = await tecnico.get(`/api/v1/assets?usedByAreaId=${String(fixture.areas.ventas)}`);
    expect(usedByVentas.body.total).toBe(2);

    const csv = await tecnico.get(`/api/v1/assets/export?usedByAreaId=${String(fixture.areas.it)}`);
    expect(csv.text).toMatch(/Servidor.*IT y Sistemas.*IT y Sistemas/);
  });
});

describe("reglas de gestión", () => {
  it("solo el supervisor del área responsable y el admin dan de alta", async () => {
    const body = { name: "Laptop", areaId: String(fixture.areas.it) };
    expect((await create(await loginAs(fixture.users.agentIt.email), body)).status).toBe(403);
    expect((await create(await loginAs(fixture.users.supVentas.email), body)).status).toBe(403);
    expect((await create(await loginAs(fixture.users.supRrhh.email), body)).status).toBe(403);
    expect((await create(await loginAs(fixture.users.admin.email), body)).status).toBe(201);
  });

  it("no pasa un equipo a un área que no supervisa", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const created = await create(supervisor, { name: "Laptop", areaId: String(fixture.areas.it) });
    const response = await supervisor
      .patch(`/api/v1/assets/${created.body.id}`)
      .send({ areaId: String(fixture.areas.ventas) });
    expect(response.status).toBe(403);
  });

  it("con órdenes de trabajo abiertas no se da de baja", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const created = await create(supervisor, { name: "Impresora", type: "printer", areaId: String(fixture.areas.it) });
    await WorkOrder.create({
      number: 1,
      type: "corrective",
      title: "Atasco",
      assetId: created.body.id,
      areaId: fixture.areas.it,
      status: "in_progress",
    });
    const response = await supervisor.post(`/api/v1/assets/${created.body.id}/retire`).send({ reason: "Vieja" });
    expect(response.status).toBe(409);
    expect(response.body.error.message).toMatch(/1 orden de trabajo abierta/);
  });

  it("la foto tiene que ser una imagen propia y suelta, y la ve quien ve el equipo", async () => {
    const other = await loginAs(fixture.users.agentIt.email);
    const foreign = await other
      .post("/api/v1/attachments")
      .attach("file", PNG, { filename: "ajena.png", contentType: "image/png" });
    const supervisor = await loginAs(fixture.users.supIt.email);
    const stolen = await create(supervisor, { name: "Laptop", areaId: String(fixture.areas.it), photoId: foreign.body.id });
    expect(stolen.status).toBe(422);

    const own = await supervisor
      .post("/api/v1/attachments")
      .attach("file", PNG, { filename: "foto.png", contentType: "image/png" });
    const created = await create(supervisor, {
      name: "Laptop de Vito",
      areaId: String(fixture.areas.it),
      custodianId: String(fixture.users.employeeVentas.id),
      photoId: own.body.id,
    });
    expect(created.status).toBe(201);

    // La ve Vito (la tiene a cargo); no la ve la supervisora de Ventas, que no usa el equipo.
    expect((await (await loginAs(fixture.users.employeeVentas.email)).get(`/api/v1/attachments/${own.body.id}`)).status).toBe(200);
    expect((await (await loginAs(fixture.users.supVentas.email)).get(`/api/v1/attachments/${own.body.id}`)).status).toBe(404);
  });

  it("marca las garantías por vencer con la antelación configurada", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const today = todayKey("America/La_Paz");
    await create(supervisor, { name: "Por vencer", areaId: String(fixture.areas.it), warrantyUntil: addDaysToKey(today, 10) });
    await create(supervisor, { name: "Vigente", areaId: String(fixture.areas.it), warrantyUntil: addDaysToKey(today, 200) });
    await create(supervisor, { name: "Vencida", areaId: String(fixture.areas.it), warrantyUntil: addDaysToKey(today, -1) });

    const expiring = await supervisor.get("/api/v1/assets?warranty=expiring");
    expect(expiring.body.items.map((item: { name: string; warranty: string }) => [item.name, item.warranty])).toEqual([
      ["Por vencer", "expiring"],
    ]);
    expect(await Asset.countDocuments()).toBe(3);
  });
});
