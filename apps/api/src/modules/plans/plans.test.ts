import { addDaysToKey, addPeriod, type AssetType } from "@tekzaya/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Types } from "mongoose";
import { runPreventiveJob } from "../../jobs/preventive.job";
import { nextNumber } from "../../models/counter.model";
import { Asset, MaintenancePlan, WorkOrder } from "../../models/maintenance.models";
import { Notification } from "../../models/support.models";
import { connect, disconnect, loginAs, resetDatabase, type Fixture } from "../../test/fixtures";
import { todayKey } from "../assets/asset.view";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

/** La zona de la semilla de pruebas (Configuración por defecto). */
const ZONE = "America/La_Paz";
/** Mediodía en La Paz del día indicado: la hora que se le inyecta al trabajo. */
const noonOf = (key: string) => new Date(`${key}T16:00:00Z`);
const today = () => todayKey(ZONE);

async function seedAsset(fields: { name?: string; areaId?: Types.ObjectId; type?: AssetType; status?: "operational" | "in_repair" | "retired" } = {}) {
  return Asset.create({
    name: "Aire acondicionado de la sala de servidores",
    type: "air_conditioner",
    location: "Planta baja",
    status: "operational",
    areaId: fixture.areas.it,
    number: await nextNumber("asset"),
    ...fields,
  });
}

async function seedPlan(fields: Record<string, unknown>) {
  return MaintenancePlan.create({
    title: "Limpieza de filtros",
    areaId: fixture.areas.it,
    checklist: ["Desmontar filtros", "Lavar y secar"],
    every: 3,
    unit: "month",
    mode: "fixed",
    leadDays: 7,
    isActive: true,
    ...fields,
  });
}

const planOf = async (id: Types.ObjectId) => (await MaintenancePlan.findById(id).lean())!;

describe("el trabajo diario de preventivos (DoD de A5)", () => {
  it("genera exactamente una OT por plan vencido, en los dos modos, y no repite", async () => {
    const hvac = await seedAsset();
    const ups = await seedAsset({ name: "UPS del rack", type: "ups" });
    const fixed = await seedPlan({ assetId: hvac._id, startsOn: "2026-01-15", nextDueAt: "2026-04-15" });
    const fromLast = await seedPlan({
      title: "Prueba de baterías",
      assetId: ups._id,
      mode: "from_last",
      every: 2,
      startsOn: "2026-02-10",
      nextDueAt: "2026-04-12",
    });
    // Todavía no toca: se genera siete días antes, el 26 de abril.
    await seedPlan({ title: "Revisión de drenaje", assetId: hvac._id, startsOn: "2026-05-03", nextDueAt: "2026-05-03" });

    const first = await runPreventiveJob(noonOf("2026-04-10"));
    expect(first).toMatchObject({ generated: 2, advanced: 1 });

    const orders = await WorkOrder.find({ type: "preventive" }).lean();
    expect(orders.map((order) => [String(order.planId), order.scheduledFor]).sort()).toEqual(
      [
        [String(fixed._id), "2026-04-15"],
        [String(fromLast._id), "2026-04-12"],
      ].sort(),
    );
    const order = orders.find((item) => String(item.planId) === String(fixed._id))!;
    expect(order).toMatchObject({ status: "pending", outOfService: false, title: "Limpieza de filtros" });
    expect(order.checklist.map((item) => item.label)).toEqual(["Desmontar filtros", "Lavar y secar"]);
    expect(order.createdById).toBeUndefined();

    // `fixed` pasa a la siguiente fecha de su calendario; `from_last` espera a que se complete.
    expect((await planOf(fixed._id)).nextDueAt).toBe("2026-07-15");
    expect((await planOf(fromLast._id)).nextDueAt).toBe("2026-04-12");

    // La misma pasada otra vez, y al día siguiente: nada nuevo.
    expect(await runPreventiveJob(noonOf("2026-04-10"))).toMatchObject({ generated: 0, advanced: 0 });
    expect(await runPreventiveJob(noonOf("2026-04-11"))).toMatchObject({ generated: 0, advanced: 0 });
    expect(await WorkOrder.countDocuments({ type: "preventive" })).toBe(2);
  });

  it("un plan por tipo abre una OT por equipo y se salta los dados de baja", async () => {
    await seedAsset({ name: "Impresora 1", type: "printer" });
    await seedAsset({ name: "Impresora 2", type: "printer" });
    await seedAsset({ name: "Impresora vieja", type: "printer", status: "retired" });
    await seedAsset({ name: "Impresora de Ventas", type: "printer", areaId: fixture.areas.ventas });
    const plan = await seedPlan({ assetType: "printer", every: 6, startsOn: "2026-04-15", nextDueAt: "2026-04-15" });

    expect((await runPreventiveJob(noonOf("2026-04-10"))).generated).toBe(2);
    const assets = await WorkOrder.find({ planId: plan._id }).distinct("assetId");
    expect(assets).toHaveLength(2);

    // El aviso al supervisor es uno por ronda, no uno por impresora.
    const avisos = await Notification.find({ type: "preventive_due" }).lean();
    expect(avisos.map((aviso) => String(aviso.userId))).toEqual([String(fixture.users.supIt.id)]);
    expect(avisos[0]!.title).toBe("2 preventivos programados");
  });

  it("no apila preventivos: el equipo con la OT anterior abierta no recibe otra", async () => {
    const hvac = await seedAsset();
    const plan = await seedPlan({ assetId: hvac._id, every: 1, startsOn: "2026-03-15", nextDueAt: "2026-04-15" });
    await WorkOrder.create({
      number: await nextNumber("work_order"),
      type: "preventive",
      title: "Limpieza de filtros",
      assetId: hvac._id,
      areaId: fixture.areas.it,
      planId: plan._id,
      status: "assigned",
      assigneeIds: [fixture.users.agentIt.id],
      scheduledFor: "2026-03-15",
      outOfService: false,
    });

    expect(await runPreventiveJob(noonOf("2026-04-10"))).toMatchObject({ generated: 0, advanced: 1 });
    expect((await planOf(plan._id)).nextDueAt).toBe("2026-05-15");
  });

  it("si el trabajo estuvo parado, `fixed` abre la ronda vencida y salta a la siguiente desde hoy", async () => {
    const hvac = await seedAsset();
    const plan = await seedPlan({ assetId: hvac._id, every: 1, startsOn: "2026-01-31", nextDueAt: "2026-02-28" });

    expect((await runPreventiveJob(noonOf("2026-05-10"))).generated).toBe(1);
    expect((await WorkOrder.findOne({ planId: plan._id }).lean())!.scheduledFor).toBe("2026-02-28");
    // El calendario cuenta desde el 31 de enero: el 31 de mayo, no el 28.
    expect((await planOf(plan._id)).nextDueAt).toBe("2026-05-31");
  });

  it("un plan en pausa no genera nada", async () => {
    const hvac = await seedAsset();
    await seedPlan({ assetId: hvac._id, startsOn: "2026-04-15", nextDueAt: "2026-04-15", isActive: false });
    expect(await runPreventiveJob(noonOf("2026-04-10"))).toMatchObject({ generated: 0, advanced: 0 });
  });

  it("avisa del preventivo vencido una sola vez, a quien lo atiende y al supervisor", async () => {
    const hvac = await seedAsset();
    await WorkOrder.create({
      number: await nextNumber("work_order"),
      type: "preventive",
      title: "Limpieza de filtros",
      assetId: hvac._id,
      areaId: fixture.areas.it,
      status: "assigned",
      assigneeIds: [fixture.users.agentIt.id],
      scheduledFor: "2026-04-09",
      outOfService: false,
    });

    // El mismo día programado todavía no está vencido.
    expect((await runPreventiveJob(noonOf("2026-04-09"))).overdue).toBe(0);
    expect((await runPreventiveJob(noonOf("2026-04-10"))).overdue).toBe(1);
    expect((await runPreventiveJob(noonOf("2026-04-11"))).overdue).toBe(0);

    const avisos = await Notification.find({ type: "preventive_overdue" }).lean();
    expect(new Set(avisos.map((aviso) => String(aviso.userId)))).toEqual(
      new Set([String(fixture.users.agentIt.id), String(fixture.users.supIt.id)]),
    );
  });
});

describe("completar un preventivo y la fecha siguiente", () => {
  async function completeLate(mode: "fixed" | "from_last") {
    const hvac = await seedAsset();
    // La ronda era hace diez días: se completa tarde, hoy.
    const due = addDaysToKey(today(), -10);
    const plan = await seedPlan({ assetId: hvac._id, mode, every: 1, startsOn: due, nextDueAt: due });
    await runPreventiveJob();
    const order = (await WorkOrder.findOne({ planId: plan._id }).lean())!;
    const afterOpening = (await planOf(plan._id)).nextDueAt;

    const agent = await loginAs(fixture.users.agentIt.email);
    expect((await agent.post(`/api/v1/work-orders/${order._id}/take`)).status).toBe(200);
    expect((await agent.patch(`/api/v1/work-orders/${order._id}`).send({ status: "in_progress" })).status).toBe(200);
    const done = await agent
      .post(`/api/v1/work-orders/${order._id}/complete`)
      .send({ completionNotes: "Filtros lavados y equipo probado." });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body.plan).toEqual({ id: String(plan._id), title: "Limpieza de filtros" });
    return { plan: await planOf(plan._id), due, afterOpening };
  }

  it("`from_last` cuenta desde el día en que se completó", async () => {
    const { plan, due, afterOpening } = await completeLate("from_last");
    expect(afterOpening).toBe(due);
    expect(plan.nextDueAt).toBe(addPeriod(today(), 1, "month"));
    expect(plan.lastCompletedAt).toBeTruthy();
  });

  it("`fixed` no se mueve por completar tarde", async () => {
    const { plan, due, afterOpening } = await completeLate("fixed");
    expect(afterOpening).toBe(addPeriod(due, 1, "month"));
    expect(plan.nextDueAt).toBe(afterOpening);
    expect(plan.lastCompletedAt).toBeTruthy();
  });

  it("`from_last`: si la ronda entera se cancela, la siguiente cuenta desde hoy", async () => {
    const hvac = await seedAsset();
    const due = addDaysToKey(today(), -3);
    const plan = await seedPlan({ assetId: hvac._id, mode: "from_last", every: 2, unit: "week", startsOn: due, nextDueAt: due });
    await runPreventiveJob();
    const order = (await WorkOrder.findOne({ planId: plan._id }).lean())!;

    const supervisor = await loginAs(fixture.users.supIt.email);
    const cancelled = await supervisor
      .patch(`/api/v1/work-orders/${order._id}`)
      .send({ status: "cancelled", reason: "El equipo se reemplaza la semana que viene" });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect((await planOf(plan._id)).nextDueAt).toBe(addDaysToKey(today(), 14));
  });
});

describe("planes por la API", () => {
  it("el supervisor crea un plan de equipo y uno por tipo; el área sale del equipo", async () => {
    const hvac = await seedAsset();
    const supervisor = await loginAs(fixture.users.supIt.email);

    const own = await supervisor.post("/api/v1/maintenance-plans").send({
      title: "Limpieza de filtros",
      assetId: String(hvac._id),
      every: 3,
      unit: "month",
      mode: "fixed",
      startsOn: addDaysToKey(today(), 20),
      checklist: ["Desmontar filtros"],
    });
    expect(own.status, JSON.stringify(own.body)).toBe(201);
    expect(own.body).toMatchObject({
      areaId: String(fixture.areas.it),
      nextDueAt: addDaysToKey(today(), 20),
      leadDays: 7,
      coverage: 1,
      generatesOn: addDaysToKey(today(), 13),
      asset: { id: String(hvac._id) },
      permissions: { manage: true },
    });

    await seedAsset({ name: "Impresora 1", type: "printer" });
    const byType = await supervisor.post("/api/v1/maintenance-plans").send({
      title: "Limpieza de cabezales",
      assetType: "printer",
      areaId: String(fixture.areas.it),
      every: 6,
      unit: "month",
      mode: "from_last",
      startsOn: today(),
      leadDays: 0,
    });
    expect(byType.status, JSON.stringify(byType.body)).toBe(201);
    expect(byType.body).toMatchObject({ coverage: 1, leadDays: 0 });

    // Un equipo y un tipo a la vez no es un plan.
    const both = await supervisor.post("/api/v1/maintenance-plans").send({
      title: "Ambos",
      assetId: String(hvac._id),
      assetType: "printer",
      areaId: String(fixture.areas.it),
      every: 1,
      unit: "month",
      mode: "fixed",
      startsOn: today(),
    });
    expect(both.status).toBe(422);
  });

  it("con fecha inicial pasada, `fixed` arranca en la siguiente de su calendario y `from_last` se rechaza", async () => {
    const hvac = await seedAsset();
    const supervisor = await loginAs(fixture.users.supIt.email);
    const startsOn = addDaysToKey(today(), -10);
    const body = { title: "Revisión semanal", assetId: String(hvac._id), every: 1, unit: "week", startsOn };

    const fixed = await supervisor.post("/api/v1/maintenance-plans").send({ ...body, mode: "fixed" });
    expect(fixed.status).toBe(201);
    expect(fixed.body.nextDueAt).toBe(addDaysToKey(today(), 4));

    const fromLast = await supervisor.post("/api/v1/maintenance-plans").send({ ...body, mode: "from_last" });
    expect(fromLast.status).toBe(422);
  });

  it("permisos: el técnico y RRHH ven sin gestionar; otra área ni lo ve", async () => {
    const hvac = await seedAsset();
    const plan = await seedPlan({ assetId: hvac._id, startsOn: today(), nextDueAt: today() });
    const body = { title: "Nuevo", assetId: String(hvac._id), every: 1, unit: "month", mode: "fixed", startsOn: today() };

    const tecnico = await loginAs(fixture.users.agentIt.email);
    const list = await tecnico.get("/api/v1/maintenance-plans");
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].permissions.manage).toBe(false);
    expect(list.body.manageableAreas).toEqual([]);
    expect((await tecnico.post("/api/v1/maintenance-plans").send(body)).status).toBe(403);
    expect((await tecnico.post(`/api/v1/maintenance-plans/${plan._id}/pause`)).status).toBe(403);

    const rrhh = await loginAs(fixture.users.supRrhh.email);
    expect((await rrhh.get(`/api/v1/maintenance-plans/${plan._id}`)).status).toBe(200);
    expect((await rrhh.patch(`/api/v1/maintenance-plans/${plan._id}`).send({ title: "Otro" })).status).toBe(403);

    const ventas = await loginAs(fixture.users.supVentas.email);
    expect((await ventas.get("/api/v1/maintenance-plans")).body.items).toEqual([]);
    expect((await ventas.get(`/api/v1/maintenance-plans/${plan._id}`)).status).toBe(404);
    // Pedir el área de IT en el filtro no amplía el alcance.
    const calendar = await ventas.get(
      `/api/v1/maintenance-plans/calendar?from=${addDaysToKey(today(), -20)}&to=${addDaysToKey(today(), 20)}&areaId=${fixture.areas.it}`,
    );
    expect(calendar.status).toBe(200);
    expect(calendar.body.items).toEqual([]);
  });

  it("editar `fixed` ancla el calendario en la próxima fecha; pausar y reanudar", async () => {
    const hvac = await seedAsset();
    const plan = await seedPlan({ assetId: hvac._id, startsOn: "2026-01-31", nextDueAt: addDaysToKey(today(), 5) });
    const supervisor = await loginAs(fixture.users.supIt.email);

    const next = addDaysToKey(today(), 9);
    const edited = await supervisor.patch(`/api/v1/maintenance-plans/${plan._id}`).send({ nextDueAt: next, every: 2, unit: "week" });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    expect(edited.body).toMatchObject({ startsOn: next, nextDueAt: next, every: 2, unit: "week" });
    expect(
      (await supervisor.patch(`/api/v1/maintenance-plans/${plan._id}`).send({ nextDueAt: addDaysToKey(today(), -1) })).status,
    ).toBe(422);

    expect((await supervisor.post(`/api/v1/maintenance-plans/${plan._id}/pause`)).body.isActive).toBe(false);
    // En pausa se le pasó la fecha: al reanudar salta a la siguiente de su calendario.
    await MaintenancePlan.updateOne({ _id: plan._id }, { $set: { startsOn: addDaysToKey(today(), -15), nextDueAt: addDaysToKey(today(), -1) } });
    const resumed = await supervisor.post(`/api/v1/maintenance-plans/${plan._id}/resume`);
    expect(resumed.body).toMatchObject({ isActive: true, nextDueAt: addDaysToKey(today(), 13) });
  });

  it("dar de baja el equipo pausa su plan, y ya no se puede reanudar", async () => {
    const hvac = await seedAsset();
    const plan = await seedPlan({ assetId: hvac._id, startsOn: today(), nextDueAt: today() });
    const supervisor = await loginAs(fixture.users.supIt.email);

    const retired = await supervisor.post(`/api/v1/assets/${hvac._id}/retire`).send({ reason: "Reemplazado por un equipo nuevo" });
    expect(retired.status, JSON.stringify(retired.body)).toBe(200);
    expect((await planOf(plan._id)).isActive).toBe(false);
    expect((await supervisor.post(`/api/v1/maintenance-plans/${plan._id}/resume`)).status).toBe(409);
  });
});

describe("calendario de preventivos", () => {
  it("las OT del mes y las rondas que faltan por generar", async () => {
    const hvac = await seedAsset();
    await seedAsset({ name: "Impresora 1", type: "printer" });
    await seedAsset({ name: "Impresora 2", type: "printer" });
    const month = today().slice(0, 7);
    const first = `${month}-01`;

    // Semanal y fijo: varias rondas en el mes; la primera ya tiene su OT.
    const weekly = await seedPlan({ title: "Revisión semanal", assetId: hvac._id, every: 1, unit: "week", startsOn: first, nextDueAt: addDaysToKey(first, 7) });
    await WorkOrder.create({
      number: await nextNumber("work_order"),
      type: "preventive",
      title: "Revisión semanal",
      assetId: hvac._id,
      areaId: fixture.areas.it,
      planId: weekly._id,
      status: "completed",
      assigneeIds: [],
      scheduledFor: first,
      outOfService: false,
    });
    // Por tipo y desde el último: solo la ronda siguiente.
    await seedPlan({ title: "Cabezales", assetType: "printer", mode: "from_last", every: 1, startsOn: addDaysToKey(first, 10), nextDueAt: addDaysToKey(first, 10) });

    const agent = await loginAs(fixture.users.agentIt.email);
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const response = await agent.get(`/api/v1/maintenance-plans/calendar?from=${first}&to=${last}`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    // Más de seis semanas de una vez no.
    expect((await agent.get(`/api/v1/maintenance-plans/calendar?from=${first}&to=${addDaysToKey(first, 42)}`)).status).toBe(422);

    const items = response.body.items as { date: string; kind: string; title: string; assetCount?: number; order?: { status: string } }[];
    const semanal = items.filter((item) => item.title === "Revisión semanal");
    expect(semanal[0]).toMatchObject({ date: first, kind: "order", order: { status: "completed" } });
    expect(semanal.slice(1).every((item) => item.kind === "projected")).toBe(true);
    expect(semanal.slice(1).map((item) => item.date)).toEqual(
      [7, 14, 21, 28].map((days) => addDaysToKey(first, days)).filter((date) => date.startsWith(month)),
    );
    expect(items.filter((item) => item.title === "Cabezales")).toEqual([
      expect.objectContaining({ date: addDaysToKey(first, 10), kind: "projected", assetCount: 2 }),
    ]);
  });
});
