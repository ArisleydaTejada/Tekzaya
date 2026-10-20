import { workOrderCost, type AssetType } from "@tekzaya/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Types } from "mongoose";
import { nextNumber } from "../../models/counter.model";
import { Asset, AssetEvent, SparePart, StockMovement, WorkOrder } from "../../models/maintenance.models";
import { Message } from "../../models/message.model";
import { Notification } from "../../models/support.models";
import { User } from "../../models/user.model";
import { connect, disconnect, loginAs, resetDatabase, type Fixture } from "../../test/fixtures";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

type Agent = Awaited<ReturnType<typeof loginAs>>;

async function seedAsset(fields: { name?: string; areaId?: Types.ObjectId; type?: AssetType } = {}) {
  return Asset.create({
    name: "Impresora de Ventas",
    type: "printer",
    location: "Piso 2",
    status: "operational",
    areaId: fixture.areas.it,
    usedByAreaId: fixture.areas.ventas,
    number: await nextNumber("asset"),
    ...fields,
  });
}

/** Un repuesto con su entrada inicial en el libro: el stock es la suma de movimientos. */
async function seedPart(stock: number, avgUnitCost: number, name = "Unidad fusora") {
  const part = await SparePart.create({
    number: await nextNumber("spare_part"),
    name,
    areaId: fixture.areas.it,
    unit: "unit",
    stock,
    minStock: 1,
    avgUnitCost,
  });
  await StockMovement.create({
    partId: part._id,
    kind: "in",
    qty: stock,
    unitCost: avgUnitCost,
    actorId: fixture.users.supIt.id,
    at: new Date(Date.now() - 86_400_000),
  });
  return part;
}

async function stockMatchesLedger(partId: Types.ObjectId) {
  const part = await SparePart.findById(partId).lean();
  const movements = await StockMovement.find({ partId }).lean();
  return { stock: part!.stock, ledger: movements.reduce((sum, movement) => sum + movement.qty, 0) };
}

async function openOrder(agent: Agent, assetId: Types.ObjectId, body: Record<string, unknown> = {}) {
  const response = await agent.post("/api/v1/work-orders").send({
    assetId: String(assetId),
    type: "corrective",
    title: "No toma el papel de la bandeja 2",
    outOfService: true,
    ...body,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body as { id: string; number: number };
}

/** Tomarla y empezar: el camino normal hasta "En progreso". */
async function start(agent: Agent, orderId: string) {
  expect((await agent.post(`/api/v1/work-orders/${orderId}/take`)).status).toBe(200);
  const started = await agent.patch(`/api/v1/work-orders/${orderId}`).send({ status: "in_progress" });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  return started;
}

describe("una orden de principio a fin (DoD de A3)", () => {
  it("tomar, un repuesto, un externo y completar: el costo cuadra y la parada es exacta", async () => {
    const printer = await seedAsset();
    const fuser = await seedPart(3, 1999);
    const agent = await loginAs(fixture.users.agentIt.email);

    const order = await openOrder(agent, printer._id);
    expect(order).toMatchObject({ status: "pending", type: "corrective", costTotal: 0 });
    expect((await Asset.findById(printer._id).lean())!.status).toBe("in_repair");

    const started = await start(agent, order.id);
    expect(started.body.status).toBe("in_progress");
    expect(started.body.assignees.map((person: { id: string }) => person.id)).toEqual([
      String(fixture.users.agentIt.id),
    ]);
    expect(started.body.startedAt).toBeDefined();

    const part = await agent.post(`/api/v1/work-orders/${order.id}/parts`).send({ partId: String(fuser._id), qty: 1 });
    expect(part.status, JSON.stringify(part.body)).toBe(201);
    expect(part.body.partsUsed[0]).toMatchObject({ qty: 1, unitCost: 1999, part: { name: "Unidad fusora" } });

    // Un técnico externo que cobra por hora: 1 h 30 min a 30,00 son 45,00.
    const external = await agent.post(`/api/v1/work-orders/${order.id}/external-costs`).send({
      vendor: "Servicios Láser SRL",
      description: "Calibración",
      pricing: "hourly",
      hourlyRate: 3000,
      minutes: 90,
    });
    expect(external.status, JSON.stringify(external.body)).toBe(201);
    expect(external.body.externalCosts[0]).toMatchObject({ pricing: "hourly", hourlyRate: 3000, minutes: 90, amount: 4500 });

    // Una compra posterior más cara no cambia lo que costó la pieza ya consumida.
    await SparePart.updateOne({ _id: fuser._id }, { $set: { avgUnitCost: 2600 } });

    const done = await agent
      .post(`/api/v1/work-orders/${order.id}/complete`)
      .send({ completionNotes: "Se cambió la unidad fusora y se calibró el rodillo." });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.status).toBe("completed");

    // Repuesto + externo, a mano: 19,99 + 1,5 h × 30,00 = 64,99.
    const expected = 1999 + 4500;
    expect(done.body.cost).toEqual({ parts: 1999, external: 4500, total: expected });
    expect(done.body.costTotal).toBe(expected);
    expect((await WorkOrder.findById(order.id).lean())!.costTotal).toBe(expected);

    // El equipo estuvo En reparación exactamente entre la apertura y el cierre.
    const stored = (await WorkOrder.findById(order.id).lean())!;
    const changes = await AssetEvent.find({ assetId: printer._id, kind: "status_changed" }).sort({ at: 1 }).lean();
    expect(changes.map((event) => event.data)).toEqual([
      { from: "operational", to: "in_repair" },
      { from: "in_repair", to: "operational" },
    ]);
    expect(changes[0]!.at.getTime()).toBe(stored.createdAt.getTime());
    expect(changes[1]!.at.getTime()).toBe(stored.completedAt!.getTime());
    expect((await Asset.findById(printer._id).lean())!.status).toBe("operational");
    expect(await AssetEvent.find({ assetId: printer._id }).sort({ at: 1, _id: 1 }).distinct("kind")).toEqual(
      expect.arrayContaining(["failure", "repair", "status_changed"]),
    );

    // El stock bajó uno y sigue siendo la suma de su libro.
    expect(await stockMatchesLedger(fuser._id)).toEqual({ stock: 2, ledger: 2 });
  });

  it("un servicio externo con precio total: las horas son opcionales", async () => {
    const agent = await loginAs(fixture.users.agentIt.email);
    const order = await openOrder(agent, (await seedAsset())._id, { outOfService: false });
    await start(agent, order.id);
    const url = `/api/v1/work-orders/${order.id}/external-costs`;

    const closed = await agent.post(url).send({ vendor: "Técnico de Canon", pricing: "total", amount: 12000 });
    expect(closed.status).toBe(201);
    expect(closed.body.externalCosts[0]).toMatchObject({ pricing: "total", amount: 12000 });
    expect(closed.body.externalCosts[0].minutes).toBeUndefined();

    const withHours = await agent.post(url).send({ vendor: "Electricista", pricing: "total", amount: 8000, minutes: 240 });
    // Con precio cerrado, las 4 h son un dato: no multiplican nada.
    expect(withHours.body.externalCosts[1]).toMatchObject({ pricing: "total", minutes: 240, amount: 8000 });
    expect(withHours.body.costTotal).toBe(20000);

    // Por hora, las horas son obligatorias; y el monto lo calcula el servidor.
    expect((await agent.post(url).send({ vendor: "Plomero", pricing: "hourly", hourlyRate: 2000 })).status).toBe(422);
    const forged = await agent.post(url).send({ vendor: "Plomero", pricing: "hourly", hourlyRate: 2000, minutes: 60, amount: 1 });
    expect(forged.body.externalCosts[2].amount).toBe(2000);
  });

  it("el costo guardado en la base cuadra con workOrderCost (medio centavo por hora → arriba)", async () => {
    const agent = await loginAs(fixture.users.agentIt.email);
    const order = await openOrder(agent, (await seedAsset())._id, { outOfService: false });
    await start(agent, order.id);
    // 1 min a 1,50/h son 2,5 centavos: se redondea una vez, a 3.
    const response = await agent
      .post(`/api/v1/work-orders/${order.id}/external-costs`)
      .send({ vendor: "Proveedor", pricing: "hourly", hourlyRate: 150, minutes: 1 });

    const stored = (await WorkOrder.findById(order.id).lean())!;
    const expected = workOrderCost(stored).total;
    expect(expected).toBe(3);
    expect(stored.costTotal).toBe(expected);
    expect(response.body.costTotal).toBe(expected);
  });
});

describe("transiciones", () => {
  it("lo que no está en la tabla responde 409", async () => {
    const agent = await loginAs(fixture.users.agentIt.email);
    const order = await openOrder(agent, (await seedAsset())._id);

    // Pendiente no salta a En progreso: primero alguien la toma.
    expect((await agent.patch(`/api/v1/work-orders/${order.id}`).send({ status: "in_progress" })).status).toBe(403);
    const supervisor = await loginAs(fixture.users.supIt.email);
    expect((await supervisor.patch(`/api/v1/work-orders/${order.id}`).send({ status: "in_progress" })).status).toBe(409);

    await agent.post(`/api/v1/work-orders/${order.id}/take`);
    // Asignada no se completa sin haber empezado.
    const early = await agent.post(`/api/v1/work-orders/${order.id}/complete`).send({ completionNotes: "Listo, cambiado." });
    expect(early.status).toBe(409);

    // En espera exige decir qué falta.
    expect((await agent.patch(`/api/v1/work-orders/${order.id}`).send({ status: "on_hold" })).status).toBe(422);
    const held = await agent.patch(`/api/v1/work-orders/${order.id}`).send({ status: "on_hold", holdReason: "parts" });
    expect(held.body).toMatchObject({ status: "on_hold", holdReason: "parts" });
    expect((await agent.post(`/api/v1/work-orders/${order.id}/complete`).send({ completionNotes: "Listo, cambiado." })).status).toBe(409);

    const resumed = await agent.patch(`/api/v1/work-orders/${order.id}`).send({ status: "in_progress" });
    expect(resumed.body.status).toBe("in_progress");
    expect(resumed.body.holdReason).toBeUndefined();

    // Completar exige notas.
    expect((await agent.post(`/api/v1/work-orders/${order.id}/complete`).send({ completionNotes: "" })).status).toBe(422);
    expect((await agent.post(`/api/v1/work-orders/${order.id}/complete`).send({ completionNotes: "Rodillo nuevo." })).status).toBe(200);

    // Terminada, ya no cambia nada.
    expect((await agent.patch(`/api/v1/work-orders/${order.id}`).send({ status: "cancelled" })).status).toBe(409);
    expect((await agent.post(`/api/v1/work-orders/${order.id}/external-costs`).send({ vendor: "Técnico", pricing: "total", amount: 1000 })).status).toBe(409);
    expect((await supervisor.put(`/api/v1/work-orders/${order.id}/assignees`).send({ assigneeIds: [] })).status).toBe(409);

    const history = (await WorkOrder.findById(order.id).lean())!.statusHistory.map((step) => step.status);
    expect(history).toEqual(["pending", "assigned", "on_hold", "in_progress", "completed"]);
  });

  it("asignar mueve Pendiente ↔ Asignada, y una orden en curso no se queda sin nadie", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const order = await openOrder(supervisor, (await seedAsset())._id);
    const agentId = String(fixture.users.agentIt.id);

    const assigned = await supervisor.put(`/api/v1/work-orders/${order.id}/assignees`).send({ assigneeIds: [agentId] });
    expect(assigned.body.status).toBe("assigned");
    const back = await supervisor.put(`/api/v1/work-orders/${order.id}/assignees`).send({ assigneeIds: [] });
    expect(back.body.status).toBe("pending");

    await supervisor.put(`/api/v1/work-orders/${order.id}/assignees`).send({ assigneeIds: [agentId] });
    const agent = await loginAs(fixture.users.agentIt.email);
    await agent.patch(`/api/v1/work-orders/${order.id}`).send({ status: "in_progress" });
    expect((await supervisor.put(`/api/v1/work-orders/${order.id}/assignees`).send({ assigneeIds: [] })).status).toBe(409);
  });
});

describe("permisos", () => {
  it("el empleado de otra área no ve la orden; RRHH la lee sin poder tocarla", async () => {
    const agent = await loginAs(fixture.users.agentIt.email);
    const order = await openOrder(agent, (await seedAsset())._id);

    const employee = await loginAs(fixture.users.employeeVentas.email);
    expect((await employee.get(`/api/v1/work-orders/${order.id}`)).status).toBe(404);
    expect((await employee.get("/api/v1/work-orders")).body.total).toBe(0);

    const rrhh = await loginAs(fixture.users.supRrhh.email);
    const read = await rrhh.get(`/api/v1/work-orders/OT-${String(order.number).padStart(4, "0")}`);
    expect(read.status).toBe(200);
    expect(read.body.permissions).toEqual({ take: false, work: false, assign: false, retireAsset: false });
    expect((await rrhh.post(`/api/v1/work-orders/${order.id}/take`)).status).toBe(403);
    expect((await rrhh.patch(`/api/v1/work-orders/${order.id}`).send({ status: "cancelled" })).status).toBe(403);
  });

  it("cualquier técnico la toma, pero solo quien la atiende le carga costos; asignar es del supervisor", async () => {
    const supervisor = await loginAs(fixture.users.supIt.email);
    const order = await openOrder(supervisor, (await seedAsset())._id);
    await supervisor
      .put(`/api/v1/work-orders/${order.id}/assignees`)
      .send({ assigneeIds: [String(fixture.users.agentIt.id)] });

    // Aviso al responsable nuevo, con el número de la orden para la campana.
    const notice = await Notification.findOne({ userId: fixture.users.agentIt.id, type: "work_order_assigned" }).lean();
    expect(notice).toBeTruthy();
    const agent = await loginAs(fixture.users.agentIt.email);
    const bell = await agent.get("/api/v1/notifications");
    expect(bell.body.items[0]).toMatchObject({ workOrderId: order.id, workOrderNumber: order.number });

    const colleague = await loginAs(fixture.users.employeeIt.email);
    expect((await colleague.get(`/api/v1/work-orders/${order.id}`)).body.permissions).toMatchObject({ take: true, work: false });
    expect((await colleague.post(`/api/v1/work-orders/${order.id}/external-costs`).send({ vendor: "Técnico", pricing: "total", amount: 1000 })).status).toBe(403);
    expect((await colleague.put(`/api/v1/work-orders/${order.id}/assignees`).send({ assigneeIds: [] })).status).toBe(403);
    const taken = await colleague.post(`/api/v1/work-orders/${order.id}/take`);
    expect(taken.body.assignees).toHaveLength(2);
    expect(taken.body.permissions.work).toBe(true);
  });

  it("no se asigna a alguien ausente ni de otra área", async () => {
    await User.updateOne({ _id: fixture.users.agentIt.id }, { $set: { availability: { state: "away", reason: "vacation" } } });
    const supervisor = await loginAs(fixture.users.supIt.email);
    const order = await openOrder(supervisor, (await seedAsset())._id);
    const away = await supervisor
      .put(`/api/v1/work-orders/${order.id}/assignees`)
      .send({ assigneeIds: [String(fixture.users.agentIt.id)] });
    expect(away.status).toBe(422);
    const outsider = await supervisor
      .put(`/api/v1/work-orders/${order.id}/assignees`)
      .send({ assigneeIds: [String(fixture.users.employeeVentas.id)] });
    expect(outsider.status).toBe(422);
  });

  it("solo el área que mantiene el equipo abre órdenes sobre él", async () => {
    const printer = await seedAsset();
    const supVentas = await loginAs(fixture.users.supVentas.email);
    const response = await supVentas
      .post("/api/v1/work-orders")
      .send({ assetId: String(printer._id), type: "corrective", title: "Se atasca el papel", outOfService: false });
    expect(response.status).toBe(403);
  });
});

describe("repuestos", () => {
  it("sin stock suficiente responde 409; quitarlo de la orden lo devuelve al almacén", async () => {
    const fuser = await seedPart(1, 1999);
    const agent = await loginAs(fixture.users.agentIt.email);
    const order = await openOrder(agent, (await seedAsset())._id);
    await start(agent, order.id);

    const many = await agent.post(`/api/v1/work-orders/${order.id}/parts`).send({ partId: String(fuser._id), qty: 2 });
    expect(many.status).toBe(409);
    expect(many.body.error.message).toMatch(/Solo queda 1 unidad/);

    const one = await agent.post(`/api/v1/work-orders/${order.id}/parts`).send({ partId: String(fuser._id), qty: 1 });
    expect(one.body.costTotal).toBe(1999);
    expect(await stockMatchesLedger(fuser._id)).toEqual({ stock: 0, ledger: 0 });

    const usageId = one.body.partsUsed[0].id as string;
    const removed = await agent.delete(`/api/v1/work-orders/${order.id}/parts/${usageId}`);
    expect(removed.body.partsUsed).toEqual([]);
    expect(removed.body.costTotal).toBe(0);
    expect(await stockMatchesLedger(fuser._id)).toEqual({ stock: 1, ledger: 1 });
    expect(await StockMovement.find({ partId: fuser._id }).distinct("kind")).toEqual(
      expect.arrayContaining(["in", "consume", "return"]),
    );
    expect((await agent.delete(`/api/v1/work-orders/${order.id}/parts/${usageId}`)).status).toBe(404);
  });

  it("dos consumos simultáneos del último: uno pasa y el otro recibe 409", async () => {
    const fuser = await seedPart(1, 1999);
    const supervisor = await loginAs(fixture.users.supIt.email);
    const order = await openOrder(supervisor, (await seedAsset())._id);
    await supervisor
      .put(`/api/v1/work-orders/${order.id}/assignees`)
      .send({ assigneeIds: [String(fixture.users.agentIt.id)] });
    const agent = await loginAs(fixture.users.agentIt.email);
    await agent.patch(`/api/v1/work-orders/${order.id}`).send({ status: "in_progress" });

    const statuses = (
      await Promise.all([
        agent.post(`/api/v1/work-orders/${order.id}/parts`).send({ partId: String(fuser._id), qty: 1 }),
        supervisor.post(`/api/v1/work-orders/${order.id}/parts`).send({ partId: String(fuser._id), qty: 1 }),
      ])
    ).map((response) => response.status);
    expect(statuses.sort()).toEqual([201, 409]);
    expect(await stockMatchesLedger(fuser._id)).toEqual({ stock: 0, ledger: 0 });
  });

  it("cancelar devuelve lo consumido y libera el equipo", async () => {
    const fuser = await seedPart(2, 1999);
    const printer = await seedAsset();
    const agent = await loginAs(fixture.users.agentIt.email);
    const order = await openOrder(agent, printer._id);
    await start(agent, order.id);
    await agent.post(`/api/v1/work-orders/${order.id}/parts`).send({ partId: String(fuser._id), qty: 2 });

    const cancelled = await agent
      .patch(`/api/v1/work-orders/${order.id}`)
      .send({ status: "cancelled", reason: "Era un atasco, no una avería" });
    expect(cancelled.body.status).toBe("cancelled");
    expect(cancelled.body.history.at(-1)).toMatchObject({ status: "cancelled", reason: "Era un atasco, no una avería" });
    expect(await stockMatchesLedger(fuser._id)).toEqual({ stock: 2, ledger: 2 });
    expect((await Asset.findById(printer._id).lean())!.status).toBe("operational");
  });
});

describe("el equipo y el ticket", () => {
  it("con dos órdenes que lo paran, vuelve a Operativo al cerrar la última", async () => {
    const printer = await seedAsset();
    const agent = await loginAs(fixture.users.agentIt.email);
    const first = await openOrder(agent, printer._id);
    const second = await openOrder(agent, printer._id, { title: "Ruido en el motor principal" });
    // La parada ya corría: la segunda no escribe otro "fuera de servicio".
    expect(await AssetEvent.countDocuments({ assetId: printer._id, kind: "status_changed" })).toBe(1);

    await start(agent, first.id);
    await agent.post(`/api/v1/work-orders/${first.id}/complete`).send({ completionNotes: "Bandeja ajustada." });
    expect((await Asset.findById(printer._id).lean())!.status).toBe("in_repair");

    await start(agent, second.id);
    const done = await agent.post(`/api/v1/work-orders/${second.id}/complete`).send({ completionNotes: "Motor lubricado." });
    expect(done.body.asset.status).toBe("operational");
  });

  it("sin arreglo: solo el supervisor da de baja el equipo al completar", async () => {
    const printer = await seedAsset();
    const agent = await loginAs(fixture.users.agentIt.email);
    const order = await openOrder(agent, printer._id);
    await start(agent, order.id);
    const denied = await agent
      .post(`/api/v1/work-orders/${order.id}/complete`)
      .send({ completionNotes: "La placa está quemada.", retireAsset: true });
    expect(denied.status).toBe(403);

    const supervisor = await loginAs(fixture.users.supIt.email);
    const done = await supervisor
      .post(`/api/v1/work-orders/${order.id}/complete`)
      .send({ completionNotes: "La placa está quemada; no compensa repararla.", retireAsset: true });
    expect(done.status).toBe(200);
    const asset = (await Asset.findById(printer._id).lean())!;
    expect(asset.status).toBe("retired");
    expect(asset.retiredReason).toMatch(/placa/);
    const kinds = (await AssetEvent.find({ assetId: printer._id }).sort({ at: 1, _id: 1 }).lean()).map((event) => event.kind);
    expect(kinds).toEqual(["failure", "status_changed", "repair", "status_changed", "retired"]);
  });

  it("al completar la OT, el ticket recibe el aviso y no se resuelve solo", async () => {
    const printer = await seedAsset();
    const employee = await loginAs(fixture.users.employeeVentas.email);
    const ticket = await employee.post("/api/v1/tickets").send({
      title: "La impresora no imprime",
      description: "Desde ayer no saca ninguna hoja.",
      areaId: String(fixture.areas.it),
      assetId: String(printer._id),
    });
    const agent = await loginAs(fixture.users.agentIt.email);
    const converted = await agent.post(`/api/v1/tickets/${ticket.body.id}/work-order`).send({ outOfService: true });
    const orderId = converted.body.workOrders[0].id as string;

    await start(agent, orderId);
    const detail = await agent.get(`/api/v1/work-orders/${orderId}`);
    expect(detail.body.ticket).toMatchObject({ id: ticket.body.id, number: ticket.body.number });
    await agent.post(`/api/v1/work-orders/${orderId}/complete`).send({ completionNotes: "Cambio de rodillo." });

    const system = await Message.find({ ticketId: ticket.body.id, type: "system" }).lean();
    expect(system.map((message) => message.systemEvent?.kind)).toContain("work_order_completed");
    const after = await employee.get(`/api/v1/tickets/${ticket.body.id}`);
    expect(after.body.status).not.toBe("resolved");
    expect(after.body.asset.status).toBe("operational");
  });
});

describe("lista", () => {
  it("bandejas, filtros y recuento por estado", async () => {
    const printer = await seedAsset();
    const laptop = await seedAsset({ name: "Laptop de Vito", type: "laptop" });
    const agent = await loginAs(fixture.users.agentIt.email);
    const mine = await openOrder(agent, printer._id);
    await openOrder(agent, laptop._id, { type: "preventive", title: "Limpieza interna", outOfService: false });
    await agent.post(`/api/v1/work-orders/${mine.id}/take`);

    const all = await agent.get("/api/v1/work-orders");
    expect(all.body.total).toBe(2);
    expect(all.body.statusCounts).toMatchObject({ pending: 1, assigned: 1, completed: 0 });

    const assigned = await agent.get("/api/v1/work-orders?scope=mine");
    expect(assigned.body.items.map((item: { id: string }) => item.id)).toEqual([mine.id]);
    const unassigned = await agent.get("/api/v1/work-orders?scope=unassigned");
    expect(unassigned.body.items[0].asset.name).toBe("Laptop de Vito");

    expect((await agent.get("/api/v1/work-orders?q=laptop")).body.total).toBe(1);
    expect((await agent.get("/api/v1/work-orders?type=preventive")).body.total).toBe(1);
    // El filtro de estado no vacía el recuento: las cabeceras siguen mostrando todo.
    const filtered = await agent.get("/api/v1/work-orders?status=assigned");
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.statusCounts.pending).toBe(1);
  });
});
