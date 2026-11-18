import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Area } from "../../models/area.model";
import { Message } from "../../models/message.model";
import { Notification } from "../../models/support.models";
import { User } from "../../models/user.model";
import {
  connect,
  disconnect,
  loginAs,
  PASSWORD,
  resetDatabase,
  seedTicket,
  type Fixture,
} from "../../test/fixtures";

/**
 * Rol solicitante (docs/PLAN_ROL_SOLICITANTE.md). El riesgo es la fuga: pertenece
 * a IT pero no la atiende, así que nada de lo que IT trabaja debe llegarle.
 * Los solicitantes se crean aquí y no en el fixture común para no mover los
 * conteos de las demás pruebas.
 */

let fixture: Fixture;
let requester: { id: Types.ObjectId; email: string };

async function createRequester(areaId: Types.ObjectId, key: string) {
  const id = new Types.ObjectId();
  const email = `${key}@tekzaya.test`;
  await User.create({
    _id: id,
    name: "Sara Solicitante",
    email,
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    areaId,
    role: "requester",
    isAreaSupervisor: false,
    hasGlobalReadAccess: false,
    status: "active",
    availability: { state: "available" },
  });
  return { id, email };
}

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
  requester = await createRequester(fixture.areas.it, "requesterit");
});

describe("lo que no debe ver de su propia área", () => {
  it("ningún listado ni detalle devuelve tickets ajenos de su área", async () => {
    const ajeno = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
      title: "Ticket ajeno de IT",
    });
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      title: "Otro ajeno sin asignar",
    });
    const suyo = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: requester.id,
      title: "Mi impresora no imprime",
    });

    const agent = await loginAs(requester.email);

    for (const scope of ["mine", "all"]) {
      const list = await agent.get(`/api/v1/tickets?scope=${scope}`);
      expect(list.status).toBe(200);
      expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([String(suyo._id)]);
    }
    const settled = await agent.get("/api/v1/tickets?scope=settled");
    expect(settled.status).toBe(200);
    expect(settled.body.items).toHaveLength(0);
    const assigned = await agent.get("/api/v1/tickets?scope=assigned");
    expect(assigned.body.items ?? []).toHaveLength(0);

    for (const scope of ["area", "unassigned"]) {
      expect((await agent.get(`/api/v1/tickets?scope=${scope}`)).status).toBe(403);
    }
    expect((await agent.get(`/api/v1/tickets?scope=all&areaId=${fixture.areas.it}`)).status).toBe(403);

    expect((await agent.get(`/api/v1/tickets/${String(ajeno._id)}`)).status).toBe(404);
    expect((await agent.get(`/api/v1/tickets/${String(ajeno._id)}/messages`)).status).toBe(404);

    const csv = await agent.get("/api/v1/tickets/export?scope=all");
    expect(csv.status).toBe(200);
    expect(csv.text).not.toContain("Ticket ajeno de IT");
  });

  it("en su propio ticket no ve las notas internas, aunque lo atienda su área", async () => {
    const suyo = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: requester.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });
    await Message.create([
      { ticketId: suyo._id, authorId: fixture.users.agentIt.id, type: "public", body: "Ya lo revisamos" },
      { ticketId: suyo._id, authorId: fixture.users.agentIt.id, type: "internal", body: "Nota secreta" },
    ]);

    const agent = await loginAs(requester.email);
    const detail = await agent.get(`/api/v1/tickets/${String(suyo._id)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.permissions.viewInternalNotes).toBe(false);
    expect(detail.body.permissions.selfAssign).toBe(false);
    expect(detail.body.permissions.changeStatus).toBe(false);

    const messages = await agent.get(`/api/v1/tickets/${String(suyo._id)}/messages`);
    expect(messages.status).toBe(200);
    expect(JSON.stringify(messages.body)).not.toContain("Nota secreta");
  });

  it("no consulta miembros, carga, estadísticas ni reportes del área", async () => {
    const agent = await loginAs(requester.email);
    const it = String(fixture.areas.it);

    expect((await agent.get(`/api/v1/areas/${it}/members`)).status).toBe(403);
    expect((await agent.get(`/api/v1/areas/${it}/workload`)).status).toBe(403);
    expect((await agent.get(`/api/v1/stats/overview?scope=area`)).status).toBe(403);
    expect((await agent.get(`/api/v1/reports/tickets?scope=area`)).status).toBe(403);

    const availability = await agent.get("/api/v1/stats/availability?scope=me");
    expect(availability.status).toBe(200);
    expect(availability.body.items).toHaveLength(0);
  });

  it("no ve órdenes de trabajo de su área", async () => {
    const agent = await loginAs(requester.email);
    const orders = await agent.get("/api/v1/work-orders");
    expect([200, 404]).toContain(orders.status);
    if (orders.status === 200) expect(orders.body.items).toHaveLength(0);
  });
});

describe("reportes", () => {
  it("solo ofrece las plantillas de quien pide, no las de agente", async () => {
    const agent = await loginAs(requester.email);
    const catalog = await agent.get("/api/v1/reports/catalog");
    expect(catalog.status).toBe(200);
    const titles = catalog.body.templates.map((template: { title: string }) => template.title);
    expect(titles).toEqual(["Mis solicitudes"]);
  });

  it("solo ofrece medidas de quien pide, y rechaza las del área", async () => {
    const agent = await loginAs(requester.email);
    const catalog = await agent.get("/api/v1/reports/catalog");
    const keys = catalog.body.measures.map((measure: { key: string }) => measure.key);
    for (const hidden of ["sla_breached", "internal_messages", "ai_area_accuracy", "on_behalf_rate", "merged_duplicates"]) {
      expect(keys).not.toContain(hidden);
    }
    expect(keys).toContain("created");

    const query = await agent.post("/api/v1/reports/query").send({
      scope: "me",
      period: "month",
      widget: {
        id: "w1",
        title: "Notas",
        chart: "kpi",
        source: "tickets",
        measures: [{ key: "internal_messages" }],
        filters: {},
        sort: "value_desc",
        showValues: true,
        showLegend: true,
        showTarget: false,
        layout: { w: 1 },
      },
    });
    expect(query.status).toBe(403);
  });
});

describe("su tablero", () => {
  it("cuenta solo sus solicitudes", async () => {
    await seedTicket({ areaId: fixture.areas.it, requesterId: requester.id });
    await seedTicket({ areaId: fixture.areas.it, requesterId: requester.id, status: "on_hold" });
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: requester.id,
      status: "resolved",
      resolvedAt: new Date(),
      resolvedByIds: [fixture.users.agentIt.id],
      firstResponseAt: new Date(),
    });
    // Ajeno de su área: no cuenta para nada.
    await seedTicket({ areaId: fixture.areas.it, requesterId: fixture.users.employeeVentas.id });

    const agent = await loginAs(requester.email);
    const overview = await agent.get("/api/v1/stats/overview?scope=me&period=week");
    expect(overview.status).toBe(200);
    expect(overview.body.kpis).toEqual({
      kind: "requester",
      open: 2,
      awaitingMe: 1,
      unanswered: 2,
      resolved: 1,
      pendingSurveys: 1,
    });
  });
});

describe("crear tickets", () => {
  it("no crea en nombre de un compañero de su área", async () => {
    const agent = await loginAs(requester.email);
    const response = await agent.post("/api/v1/tickets").send({
      title: "La impresora no imprime",
      description: "Desde esta mañana la impresora del piso no imprime nada.",
      areaId: String(fixture.areas.it),
      requesterId: String(fixture.users.employeeIt.id),
    });
    expect(response.status).toBe(403);
  });

  it("no apunta a un área que no atiende tickets", async () => {
    await Area.updateOne({ _id: fixture.areas.ventas }, { $set: { receivesTickets: false } });
    const agent = await loginAs(requester.email);
    const response = await agent.post("/api/v1/tickets").send({
      title: "Necesito una cotización",
      description: "Quiero saber el precio del plan anual para un cliente.",
      areaId: String(fixture.areas.ventas),
    });
    expect(response.status).toBe(422);
  });

  it("crear un ticket hacia su área no le avisa como si fuera agente", async () => {
    const empleada = await loginAs(fixture.users.employeeVentas.email);
    const response = await empleada.post("/api/v1/tickets").send({
      title: "Se cayó el wifi",
      description: "Desde hace media hora nadie tiene conexión en el segundo piso.",
      areaId: String(fixture.areas.it),
    });
    expect(response.status).toBe(201);

    const avisos = await Notification.find({ userId: requester.id }).lean();
    expect(avisos).toHaveLength(0);
  });
});

describe("administración", () => {
  it("un solicitante no puede ser supervisor", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const invite = await admin.post("/api/v1/users").send({
      name: "Nuevo Solicitante",
      email: "nuevo@tekzaya.test",
      areaId: String(fixture.areas.ventas),
      role: "requester",
      isAreaSupervisor: true,
    });
    expect(invite.status).toBe(422);

    const supervisors = await admin
      .put(`/api/v1/admin/areas/${String(fixture.areas.it)}/supervisors`)
      .send({ userIds: [String(requester.id)] });
    expect(supervisors.status).toBe(422);
  });

  it("no se hace solicitante a quien tiene tickets activos asignados", async () => {
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });
    const admin = await loginAs(fixture.users.admin.email);

    const blocked = await admin
      .patch(`/api/v1/users/${String(fixture.users.agentIt.id)}`)
      .send({ role: "requester" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error?.code ?? blocked.body.code).toBe("has_open_tickets");

    const ok = await admin
      .patch(`/api/v1/users/${String(fixture.users.supVentas.id)}`)
      .send({ role: "requester" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe("requester");
    expect(ok.body.user.isAreaSupervisor).toBe(false);
  });

  it("el área sabe cuántos agentes tiene, sin contar solicitantes", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const areas = await admin.get("/api/v1/admin/areas");
    const it = areas.body.items.find((area: { id: string }) => area.id === String(fixture.areas.it));
    expect(it.receivesTickets).toBe(true);
    expect(it.agentCount).toBe(it.memberCount - 1);
  });
});

describe("áreas que no atienden tickets", () => {
  it("el correo inválido se señala en su campo", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const response = await admin.post("/api/v1/users").send({
      name: "Manolo Gómez",
      email: "manolo.gomez@das",
      areaId: String(fixture.areas.ventas),
    });
    expect(response.status).toBe(422);
    expect(response.body.error.fields.email[0]).toMatch(/correo/i);
  });

  it("en un área que no atiende tickets solo se invita como solicitante", async () => {
    await Area.updateOne({ _id: fixture.areas.ventas }, { $set: { receivesTickets: false } });
    const admin = await loginAs(fixture.users.admin.email);
    const base = { name: "Manolo Gómez", areaId: String(fixture.areas.ventas) };

    const employee = await admin.post("/api/v1/users").send({ ...base, email: "manolo@tekzaya.test" });
    expect(employee.status).toBe(422);
    expect(employee.body.error.code).toBe("role_outside_service_area");

    const hr = await admin.post("/api/v1/users").send({
      ...base,
      email: "rrhh@tekzaya.test",
      isAreaSupervisor: true,
      hasGlobalReadAccess: true,
    });
    expect(hr.status).toBe(422);
    expect(hr.body.error.code).toBe("role_outside_service_area");

    const requesterInvite = await admin
      .post("/api/v1/users")
      .send({ ...base, email: "manolo@tekzaya.test", role: "requester" });
    expect(requesterInvite.status).toBe(201);
  });

  it("al dejar de atender tickets, sus empleados pasan a solicitantes", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const response = await admin
      .patch(`/api/v1/admin/areas/${String(fixture.areas.ventas)}`)
      .send({ receivesTickets: false });
    expect(response.status).toBe(200);

    const people = await User.find({ areaId: fixture.areas.ventas }).lean();
    const byId = new Map(people.map((person) => [String(person._id), person]));
    expect(byId.get(String(fixture.users.employeeVentas.id))?.role).toBe("requester");
    expect(byId.get(String(fixture.users.supVentas.id))?.role).toBe("requester");
    expect(byId.get(String(fixture.users.supVentas.id))?.isAreaSupervisor).toBe(false);
    // RRHH tampoco se queda: en un área sin tickets no hay nada que supervisar.
    expect(byId.get(String(fixture.users.supRrhh.id))?.role).toBe("requester");
    expect(byId.get(String(fixture.users.supRrhh.id))?.hasGlobalReadAccess).toBe(false);
  });

  it("no deja de atender tickets si su gente tiene tickets activos asignados", async () => {
    await seedTicket({
      areaId: fixture.areas.ventas,
      requesterId: fixture.users.employeeIt.id,
      assigneeIds: [fixture.users.employeeVentas.id],
      status: "in_progress",
    });
    const admin = await loginAs(fixture.users.admin.email);
    const response = await admin
      .patch(`/api/v1/admin/areas/${String(fixture.areas.ventas)}`)
      .send({ receivesTickets: false });
    expect(response.status).toBe(409);
    expect((await Area.findById(fixture.areas.ventas).lean())?.receivesTickets).not.toBe(false);
  });
});
