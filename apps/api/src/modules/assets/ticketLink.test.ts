import type { AssetStatus, AssetType } from "@tekzaya/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Types } from "mongoose";
import { nextNumber } from "../../models/counter.model";
import { Asset, AssetEvent, WorkOrder } from "../../models/maintenance.models";
import { Message } from "../../models/message.model";
import { connect, disconnect, loginAs, resetDatabase, type Fixture } from "../../test/fixtures";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

type Agent = Awaited<ReturnType<typeof loginAs>>;

async function seedAsset(fields: {
  name: string;
  areaId: Types.ObjectId;
  usedByAreaId?: Types.ObjectId;
  custodianId?: Types.ObjectId;
  type?: AssetType;
  status?: AssetStatus;
}) {
  return Asset.create({
    type: "laptop",
    location: "Piso 1",
    status: "operational",
    number: await nextNumber("asset"),
    ...fields,
  });
}

/** Los equipos de siempre: la laptop de Vito y la impresora de Ventas, que mantiene IT. */
async function seedVentasEquipment() {
  const laptop = await seedAsset({
    name: "Laptop de Vito",
    areaId: fixture.areas.it,
    usedByAreaId: fixture.areas.ventas,
    custodianId: fixture.users.employeeVentas.id,
  });
  const printer = await seedAsset({
    name: "Impresora de Ventas",
    type: "printer",
    areaId: fixture.areas.it,
    usedByAreaId: fixture.areas.ventas,
  });
  const server = await seedAsset({ name: "Servidor de archivos", type: "server", areaId: fixture.areas.it });
  return { laptop, printer, server };
}

async function createTicket(agent: Agent, body: Record<string, unknown>) {
  return agent.post("/api/v1/tickets").send({
    title: "La laptop no enciende",
    description: "Desde esta mañana no da imagen al encenderla.",
    areaId: String(fixture.areas.it),
    ...body,
  });
}

describe("de la queja a la orden de trabajo (DoD de A2)", () => {
  it("crear ticket con equipo → convertir en OT → la falla queda en la historia y los dos se enlazan", async () => {
    const { laptop } = await seedVentasEquipment();
    const employee = await loginAs(fixture.users.employeeVentas.email);

    const created = await createTicket(employee, { assetId: String(laptop._id) });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.asset).toMatchObject({ number: laptop.number, name: "Laptop de Vito", canOpen: true });
    // El empleado no ve las averías del equipo ni puede abrir la OT.
    expect(created.body.asset.recentFailures).toBeUndefined();
    expect(created.body.permissions).toMatchObject({ linkAsset: true, createWorkOrder: false });
    const ticketId = created.body.id as string;

    const agent = await loginAs(fixture.users.agentIt.email);
    const seen = await agent.get(`/api/v1/tickets/${ticketId}`);
    expect(seen.body.permissions.createWorkOrder).toBe(true);
    expect(seen.body.asset.recentFailures).toEqual([]);

    const converted = await agent.post(`/api/v1/tickets/${ticketId}/work-order`).send({ outOfService: true });
    expect(converted.status, JSON.stringify(converted.body)).toBe(201);
    expect(converted.body.workOrders).toHaveLength(1);
    expect(converted.body.workOrders[0]).toMatchObject({ number: 1, type: "corrective", status: "pending" });
    expect(converted.body.asset.status).toBe("in_repair");
    expect(converted.body.asset.recentFailures[0]).toMatchObject({
      title: "La laptop no enciende",
      workOrder: { number: 1, status: "pending" },
    });
    // Con una OT abierta ya no se abre otra, y el equipo ya no se cambia.
    expect(converted.body.permissions).toMatchObject({ createWorkOrder: false, linkAsset: false });

    // La OT enlaza al ticket…
    const order = await WorkOrder.findOne({ number: 1 }).lean();
    expect(String(order!.ticketId)).toBe(ticketId);
    expect(String(order!.areaId)).toBe(String(fixture.areas.it));
    expect(order!.outOfService).toBe(true);

    // …y la falla aparece en la línea de tiempo del equipo, con el ticket de origen.
    const events = await agent.get(`/api/v1/assets/${laptop._id}/events`);
    expect(events.body.items.map((event: { kind: string }) => event.kind)).toEqual(["status_changed", "failure"]);
    const failure = events.body.items.find((event: { kind: string }) => event.kind === "failure");
    expect(failure.workOrder.number).toBe(1);
    expect(failure.ticket).toEqual({ id: ticketId, number: created.body.number });

    // El ticket lo cuenta en su conversación, y el solicitante no ve la OT.
    const system = await Message.find({ ticketId, type: "system" }).lean();
    expect(system.map((message) => message.systemEvent?.kind)).toContain("work_order_created");
    expect(system.find((message) => message.systemEvent?.kind === "work_order_created")!.systemEvent!.to).toBe(
      "OT-0001",
    );
    const asRequester = await employee.get(`/api/v1/tickets/${ticketId}`);
    expect(asRequester.body.workOrders).toBeUndefined();
    expect(asRequester.body.asset.status).toBe("in_repair");

    expect((await agent.post(`/api/v1/tickets/${ticketId}/work-order`).send({ outOfService: false })).status).toBe(409);
    expect((await employee.patch(`/api/v1/tickets/${ticketId}/asset`).send({ assetId: null })).status).toBe(409);
  });

  it("si el equipo sigue funcionando, la falla queda sin tiempo de parada", async () => {
    const { printer } = await seedVentasEquipment();
    const employee = await loginAs(fixture.users.employeeVentas.email);
    const created = await createTicket(employee, { title: "Imprime con rayas", assetId: String(printer._id) });

    const supervisor = await loginAs(fixture.users.supIt.email);
    const converted = await supervisor
      .post(`/api/v1/tickets/${created.body.id}/work-order`)
      .send({ outOfService: false, title: "Cambiar tambor de la impresora" });
    expect(converted.status).toBe(201);
    expect(converted.body.asset.status).toBe("operational");
    expect(converted.body.workOrders[0].title).toBe("Cambiar tambor de la impresora");
    expect(await AssetEvent.find({ assetId: printer._id }).distinct("kind")).toEqual(["failure"]);
  });

  it("dos conversiones a la vez abren una sola orden", async () => {
    const { laptop } = await seedVentasEquipment();
    const employee = await loginAs(fixture.users.employeeVentas.email);
    const created = await createTicket(employee, { assetId: String(laptop._id) });

    const [agent, supervisor] = await Promise.all([
      loginAs(fixture.users.agentIt.email),
      loginAs(fixture.users.supIt.email),
    ]);
    const statuses = (
      await Promise.all([
        agent.post(`/api/v1/tickets/${created.body.id}/work-order`).send({ outOfService: true }),
        supervisor.post(`/api/v1/tickets/${created.body.id}/work-order`).send({ outOfService: true }),
      ])
    ).map((response) => response.status);
    expect(statuses.sort()).toEqual([201, 409]);
    expect(await WorkOrder.countDocuments({})).toBe(1);
    expect(await AssetEvent.countDocuments({ kind: "failure" })).toBe(1);
  });
});

describe("quién vincula y quién convierte", () => {
  it("el empleado solo vincula equipos que usa", async () => {
    const { server } = await seedVentasEquipment();
    const employee = await loginAs(fixture.users.employeeVentas.email);
    expect((await createTicket(employee, { assetId: String(server._id) })).status).toBe(422);

    // Uno que ve pero no usa: lo mantiene IT y solo IT lo vincula.
    const agent = await loginAs(fixture.users.agentIt.email);
    const own = await createTicket(agent, { assetId: String(server._id) });
    expect(own.status).toBe(201);
  });

  it("un equipo dado de baja no recibe tickets", async () => {
    const retired = await seedAsset({
      name: "Laptop vieja",
      areaId: fixture.areas.it,
      custodianId: fixture.users.employeeVentas.id,
      status: "retired",
    });
    const employee = await loginAs(fixture.users.employeeVentas.email);
    expect((await createTicket(employee, { assetId: String(retired._id) })).status).toBe(422);
  });

  it("el área del ticket no convierte un equipo que mantiene otra", async () => {
    const { laptop } = await seedVentasEquipment();
    const employee = await loginAs(fixture.users.employeeVentas.email);
    // Ticket mandado a Ventas con un equipo que mantiene IT.
    const created = await createTicket(employee, {
      areaId: String(fixture.areas.ventas),
      assetId: String(laptop._id),
    });
    expect(created.status).toBe(201);

    const supVentas = await loginAs(fixture.users.supVentas.email);
    const seen = await supVentas.get(`/api/v1/tickets/${created.body.id}`);
    expect(seen.body.permissions.createWorkOrder).toBe(false);
    // Ve el equipo vinculado (lo usa su área), pero no sus averías.
    expect(seen.body.asset.recentFailures).toBeUndefined();
    expect((await supVentas.post(`/api/v1/tickets/${created.body.id}/work-order`).send({ outOfService: true })).status).toBe(403);
    expect((await employee.post(`/api/v1/tickets/${created.body.id}/work-order`).send({ outOfService: true })).status).toBe(403);
  });

  it("convertir exige un equipo vinculado", async () => {
    const employee = await loginAs(fixture.users.employeeVentas.email);
    const created = await createTicket(employee, {});
    const agent = await loginAs(fixture.users.agentIt.email);
    expect(created.body.permissions.createWorkOrder).toBe(false);
    expect((await agent.post(`/api/v1/tickets/${created.body.id}/work-order`).send({ outOfService: true })).status).toBe(422);
  });

  it("el técnico vincula, cambia y quita equipos de su área; cada paso queda en la conversación", async () => {
    const { laptop, server } = await seedVentasEquipment();
    const employee = await loginAs(fixture.users.employeeVentas.email);
    const created = await createTicket(employee, {});
    const id = created.body.id as string;

    const agent = await loginAs(fixture.users.agentIt.email);
    const linked = await agent.patch(`/api/v1/tickets/${id}/asset`).send({ assetId: String(laptop._id) });
    expect(linked.status).toBe(200);
    expect(linked.body.asset.name).toBe("Laptop de Vito");

    const changed = await agent.patch(`/api/v1/tickets/${id}/asset`).send({ assetId: String(server._id) });
    expect(changed.body.asset.name).toBe("Servidor de archivos");
    // El solicitante ve qué equipo le señalaron, aunque no pueda abrir su ficha.
    const asRequester = await employee.get(`/api/v1/tickets/${id}`);
    expect(asRequester.body.asset).toMatchObject({ name: "Servidor de archivos", canOpen: false });
    // Y no puede quitar un equipo que vinculó IT y que él no usa.
    expect(asRequester.body.permissions.linkAsset).toBe(false);
    expect((await employee.patch(`/api/v1/tickets/${id}/asset`).send({ assetId: null })).status).toBe(403);

    const removed = await agent.patch(`/api/v1/tickets/${id}/asset`).send({ assetId: null });
    expect(removed.body.asset).toBeUndefined();

    const events = (await Message.find({ ticketId: id, type: "system" }).sort({ createdAt: 1, _id: 1 }).lean()).map(
      (message) => message.systemEvent,
    );
    expect(events).toEqual([
      expect.objectContaining({ kind: "asset_linked", to: `ACT-000${laptop.number} · Laptop de Vito` }),
      expect.objectContaining({
        kind: "asset_linked",
        from: `ACT-000${laptop.number} · Laptop de Vito`,
        to: `ACT-000${server.number} · Servidor de archivos`,
      }),
      expect.objectContaining({ kind: "asset_unlinked", from: `ACT-000${server.number} · Servidor de archivos` }),
    ]);
  });

  it("en un ticket terminado ya no se vincula nada", async () => {
    const { laptop } = await seedVentasEquipment();
    const employee = await loginAs(fixture.users.employeeVentas.email);
    const created = await createTicket(employee, {});
    await employee.patch(`/api/v1/tickets/${created.body.id}`).send({ status: "cancelled" });
    expect((await employee.patch(`/api/v1/tickets/${created.body.id}/asset`).send({ assetId: String(laptop._id) })).status).toBe(409);
  });
});

describe("selector de equipos", () => {
  it("al crear, ofrece primero lo que la persona tiene a cargo y luego lo que usa su área", async () => {
    await seedVentasEquipment();
    await seedAsset({ name: "Aire de la sala", type: "air_conditioner", areaId: fixture.areas.ventas, status: "retired" });
    const employee = await loginAs(fixture.users.employeeVentas.email);

    const options = await employee.get("/api/v1/assets/link-options");
    expect(options.status).toBe(200);
    expect(options.body.person.name).toBe("Vito Ventas");
    expect(options.body.items.map((item: { name: string; group: string }) => [item.name, item.group])).toEqual([
      ["Laptop de Vito", "custodian"],
      ["Impresora de Ventas", "area"],
    ]);
    // El área responsable viaja con cada equipo, para sugerirla en el formulario.
    expect(options.body.items[1].area.name).toBe("IT y Sistemas");

    const search = await employee.get("/api/v1/assets/link-options?q=impres");
    expect(search.body.items.map((item: { name: string }) => item.name)).toEqual(["Impresora de Ventas"]);
  });

  it("en un ticket ajeno, el técnico ve los equipos del solicitante primero y el resto de su área después", async () => {
    await seedVentasEquipment();
    const employee = await loginAs(fixture.users.employeeVentas.email);
    const created = await createTicket(employee, {});

    const agent = await loginAs(fixture.users.agentIt.email);
    const options = await agent.get(`/api/v1/assets/link-options?ticketId=${created.body.id}`);
    expect(options.body.person.name).toBe("Vito Ventas");
    expect(options.body.items.map((item: { name: string; group: string }) => [item.name, item.group])).toEqual([
      ["Laptop de Vito", "custodian"],
      ["Impresora de Ventas", "area"],
      ["Servidor de archivos", "other"],
    ]);
  });
});
