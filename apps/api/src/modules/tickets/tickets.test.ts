import { formatTicketNumber } from "@tekzaya/shared";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Message } from "../../models/message.model";
import { Ticket } from "../../models/ticket.model";
import {
  app,
  connect,
  disconnect,
  loginAs,
  resetDatabase,
  seedTicket,
  type Fixture,
} from "../../test/fixtures";
import request from "supertest";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

describe("acceso a los tickets", () => {
  it("un empleado no ve el ticket de un área ajena, ni con scope=all", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.agentIt.id,
    });

    const ventas = await loginAs(fixture.users.employeeVentas.email);
    const detail = await ventas.get(`/api/v1/tickets/${String(ticket._id)}`);
    expect(detail.status).toBe(404);

    const list = await ventas.get("/api/v1/tickets?scope=all&limit=100");
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(0);
  });

  it("el solicitante ve su ticket aunque lo atienda otra área", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
    });

    const ventas = await loginAs(fixture.users.employeeVentas.email);
    const detail = await ventas.get(`/api/v1/tickets/${String(ticket._id)}`);
    expect(detail.status).toBe(200);
    expect(detail.body.title).toBe(ticket.get("title"));
  });

  it("scope=area de otra área se rechaza salvo para el administrador", async () => {
    const ventas = await loginAs(fixture.users.employeeVentas.email);
    const rejected = await ventas.get(
      `/api/v1/tickets?scope=area&areaId=${String(fixture.areas.it)}`,
    );
    expect(rejected.status).toBe(403);

    const admin = await loginAs(fixture.users.admin.email);
    const allowed = await admin.get(
      `/api/v1/tickets?scope=area&areaId=${String(fixture.areas.ventas)}`,
    );
    expect(allowed.status).toBe(200);
  });

  it("sin sesión no se listan tickets", async () => {
    const response = await request(app).get("/api/v1/tickets");
    expect(response.status).toBe(401);
  });
});

describe("notas internas", () => {
  /**
   * La regla del spec §4.3 que da nombre a la fase: pertenecer al área destino no
   * basta para leer las notas internas del propio ticket.
   */
  it("el solicitante no las recibe ni perteneciendo al área destino", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeIt.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const nota = await agente
      .post(`/api/v1/tickets/${String(ticket._id)}/messages`)
      .send({ type: "internal", body: "El switch del piso 2 está fallando otra vez." });
    expect(nota.status).toBe(201);

    const solicitante = await loginAs(fixture.users.employeeIt.email);
    const conversacion = await solicitante.get(`/api/v1/tickets/${String(ticket._id)}/messages`);

    expect(conversacion.status).toBe(200);
    expect(conversacion.body.items.some((m: { type: string }) => m.type === "internal")).toBe(false);
    expect(JSON.stringify(conversacion.body)).not.toContain("switch del piso 2");

    const detalle = await solicitante.get(`/api/v1/tickets/${String(ticket._id)}`);
    expect(detalle.body.permissions.viewInternalNotes).toBe(false);
    // El rastro de la IA tampoco viaja hacia el solicitante.
    expect(detalle.body.ai).toBeUndefined();
  });

  it("un compañero del área que no es el solicitante sí las lee", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    await agente
      .post(`/api/v1/tickets/${String(ticket._id)}/messages`)
      .send({ type: "internal", body: "Escalado al proveedor." });

    const compañero = await loginAs(fixture.users.supIt.email);
    const conversacion = await compañero.get(`/api/v1/tickets/${String(ticket._id)}/messages`);
    expect(conversacion.body.items.some((m: { type: string }) => m.type === "internal")).toBe(true);
  });

  it("el solicitante no puede escribir una nota interna en su propio ticket", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeIt.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const solicitante = await loginAs(fixture.users.employeeIt.email);
    const response = await solicitante
      .post(`/api/v1/tickets/${String(ticket._id)}/messages`)
      .send({ type: "internal", body: "Nota que no debería poder escribir" });

    expect(response.status).toBe(403);
  });

  it("alguien de otra área no puede responder en el ticket", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.agentIt.id,
    });

    const ventas = await loginAs(fixture.users.employeeVentas.email);
    const response = await ventas
      .post(`/api/v1/tickets/${String(ticket._id)}/messages`)
      .send({ type: "public", body: "Hola" });

    expect(response.status).toBe(404);
  });
});

describe("creación", () => {
  it("crea el ticket con número, SLA y el primer mensaje de la conversación", async () => {
    const ventas = await loginAs(fixture.users.employeeVentas.email);
    const response = await ventas.post("/api/v1/tickets").send({
      title: "No tengo acceso al correo",
      description: "Desde esta mañana el correo corporativo rechaza mi contraseña.",
      areaId: String(fixture.areas.it),
      categoryId: String(fixture.categories.redes),
    });

    expect(response.status).toBe(201);
    expect(response.body.number).toBe(1);
    expect(formatTicketNumber(response.body.number)).toBe("TK-000001");
    expect(response.body.status).toBe("open");
    expect(response.body.priority).toBe("medium");
    expect(new Date(response.body.resolutionDueAt).getTime()).toBeGreaterThan(Date.now());
    expect(response.body.requester.id).toBe(String(fixture.users.employeeVentas.id));

    const conversacion = await ventas.get(`/api/v1/tickets/${response.body.id}/messages`);
    expect(conversacion.body.items).toHaveLength(1);
    expect(conversacion.body.items[0].body).toContain("correo corporativo");
  });

  it("rechaza una categoría que no pertenece al área elegida", async () => {
    const ventas = await loginAs(fixture.users.employeeVentas.email);
    const response = await ventas.post("/api/v1/tickets").send({
      title: "Categoría cruzada",
      description: "La categoría enviada es de otra área distinta.",
      areaId: String(fixture.areas.ventas),
      categoryId: String(fixture.categories.redes),
    });

    expect(response.status).toBe(422);
  });

  it("crear en nombre de un compañero solo vale dentro de la misma área", async () => {
    const ventas = await loginAs(fixture.users.employeeVentas.email);

    const ajeno = await ventas.post("/api/v1/tickets").send({
      title: "En nombre de alguien de otra área",
      description: "El solicitante pertenece a un área distinta a la mía.",
      areaId: String(fixture.areas.it),
      requesterId: String(fixture.users.agentIt.id),
    });
    expect(ajeno.status).toBe(403);

    const propio = await ventas.post("/api/v1/tickets").send({
      title: "En nombre de mi compañera de área",
      description: "Lo registro yo porque ella no tiene acceso al sistema ahora.",
      areaId: String(fixture.areas.it),
      requesterId: String(fixture.users.supVentas.id),
    });
    expect(propio.status).toBe(201);
    expect(propio.body.requester.id).toBe(String(fixture.users.supVentas.id));
    expect(propio.body.createdBy.id).toBe(String(fixture.users.employeeVentas.id));
  });
});

describe("ciclo de vida", () => {
  it("rechaza con 409 una transición que el ciclo de vida no permite", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "open",
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const response = await agente
      .patch(`/api/v1/tickets/${String(ticket._id)}`)
      .send({ status: "closed" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("invalid_transition");
  });

  it("resolver exige explicar cómo se resolvió", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const sinNota = await agente
      .patch(`/api/v1/tickets/${String(ticket._id)}`)
      .send({ status: "resolved" });
    expect(sinNota.status).toBe(422);
  });

  it("cambiar la prioridad es cosa del supervisor y exige motivo", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const denegado = await agente
      .patch(`/api/v1/tickets/${String(ticket._id)}`)
      .send({ priority: "urgent", reason: "Afecta a todo el piso" });
    expect(denegado.status).toBe(403);

    const supervisora = await loginAs(fixture.users.supIt.email);
    const sinMotivo = await supervisora
      .patch(`/api/v1/tickets/${String(ticket._id)}`)
      .send({ priority: "urgent" });
    expect(sinMotivo.status).toBe(422);

    const antes = await supervisora.get(`/api/v1/tickets/${String(ticket._id)}`);
    const conMotivo = await supervisora
      .patch(`/api/v1/tickets/${String(ticket._id)}`)
      .send({ priority: "urgent", reason: "Afecta a todo el piso" });

    expect(conMotivo.status).toBe(200);
    expect(conMotivo.body.priority).toBe("urgent");
    // Urgente tiene un plazo mucho más corto: el SLA se recalcula, no se hereda.
    expect(new Date(conMotivo.body.resolutionDueAt).getTime()).toBeLessThan(
      new Date(antes.body.resolutionDueAt).getTime(),
    );
  });

  it("al salir de «En espera» el plazo se corre y el reloj no penaliza la pausa", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const enEspera = await agente
      .patch(`/api/v1/tickets/${String(ticket._id)}`)
      .send({ status: "on_hold" });
    expect(enEspera.status).toBe(200);

    // La pausa se retrasa tres días para que tenga horas laborables dentro; en
    // tiempo real la prueba dura milisegundos y el reloj no llegaría a moverse.
    const pausedSince = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    await Ticket.updateOne(
      { _id: ticket._id },
      { $set: { "sla.onHoldSince": pausedSince } },
    );

    // El solicitante responde: el ticket vuelve solo a manos del área.
    const solicitante = await loginAs(fixture.users.employeeVentas.email);
    await solicitante
      .post(`/api/v1/tickets/${String(ticket._id)}/messages`)
      .send({ type: "public", body: "Ya probé lo que me pediste y sigue igual." });

    const despues = await agente.get(`/api/v1/tickets/${String(ticket._id)}`);
    expect(despues.body.status).toBe("in_progress");
    expect(new Date(despues.body.sla.resolutionDueAt).getTime()).toBeGreaterThan(
      new Date(enEspera.body.sla.resolutionDueAt).getTime(),
    );
    expect(despues.body.sla.pausedMs).toBeGreaterThan(0);
  });

  it("recorrido completo: crear, conversar y resolver", async () => {
    const solicitante = await loginAs(fixture.users.employeeVentas.email);
    const creado = await solicitante.post("/api/v1/tickets").send({
      title: "La impresora de Ventas no responde",
      description: "Manda los trabajos a la cola pero no imprime nada desde ayer.",
      areaId: String(fixture.areas.it),
    });
    expect(creado.status).toBe(201);
    const id = creado.body.id as string;

    const supervisora = await loginAs(fixture.users.supIt.email);
    const asignado = await supervisora
      .put(`/api/v1/tickets/${id}/assignees`)
      .send({ assigneeIds: [String(fixture.users.agentIt.id)] });
    expect(asignado.status).toBe(200);
    expect(asignado.body.status).toBe("assigned");
    expect(asignado.body.assignees).toHaveLength(1);

    const agente = await loginAs(fixture.users.agentIt.email);
    const respuesta = await agente
      .post(`/api/v1/tickets/${id}/messages`)
      .send({ type: "public", body: "Ya vamos para allá a revisar la impresora." });
    expect(respuesta.status).toBe(201);

    const conPrimeraRespuesta = await agente.get(`/api/v1/tickets/${id}`);
    expect(conPrimeraRespuesta.body.sla.firstResponseAt).toBeDefined();
    expect(conPrimeraRespuesta.body.responseState).toBe("on_time");

    const resuelto = await agente
      .patch(`/api/v1/tickets/${id}`)
      .send({ status: "resolved", note: "Era un atasco de papel; ya imprime." });
    expect(resuelto.status).toBe(200);
    expect(resuelto.body.status).toBe("resolved");
    expect(resuelto.body.sla.resolvedAt).toBeDefined();

    // El solicitante confirma y el ticket se cierra.
    const cerrado = await solicitante.patch(`/api/v1/tickets/${id}`).send({ status: "closed" });
    expect(cerrado.status).toBe(200);
    expect(cerrado.body.status).toBe("closed");

    // El historial guarda cada paso, más los mensajes de sistema (spec §13).
    expect(cerrado.body.history.map((entry: { status: string }) => entry.status)).toEqual([
      "open",
      "assigned",
      "resolved",
      "closed",
    ]);
    const sistema = await Message.countDocuments({ ticketId: new Types.ObjectId(id), type: "system" });
    expect(sistema).toBeGreaterThanOrEqual(3);
  });

  it("un ticket cerrado ya no admite mensajes", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "closed",
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const response = await agente
      .post(`/api/v1/tickets/${String(ticket._id)}/messages`)
      .send({ type: "public", body: "Un añadido tardío" });

    expect(response.status).toBe(409);
  });
});

describe("responsables", () => {
  it("solo el supervisor del área asigna, pero cualquiera del área puede tomar", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const denegado = await agente
      .put(`/api/v1/tickets/${String(ticket._id)}/assignees`)
      .send({ assigneeIds: [String(fixture.users.agentIt.id)] });
    expect(denegado.status).toBe(403);

    const tomado = await agente.post(`/api/v1/tickets/${String(ticket._id)}/take`);
    expect(tomado.status).toBe(200);
    expect(tomado.body.status).toBe("assigned");
    expect(tomado.body.assignees[0].id).toBe(String(fixture.users.agentIt.id));
  });

  it("no se puede asignar a alguien de otra área", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
    });

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .put(`/api/v1/tickets/${String(ticket._id)}/assignees`)
      .send({ assigneeIds: [String(fixture.users.employeeVentas.id)] });

    expect(response.status).toBe(422);
  });
});

describe("listado", () => {
  it("cada alcance devuelve lo suyo", async () => {
    await seedTicket({ areaId: fixture.areas.it, requesterId: fixture.users.employeeVentas.id });
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeIt.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });
    await seedTicket({ areaId: fixture.areas.ventas, requesterId: fixture.users.agentIt.id });

    const agente = await loginAs(fixture.users.agentIt.email);

    const area = await agente.get("/api/v1/tickets?scope=area");
    expect(area.body.total).toBe(2);

    const asignados = await agente.get("/api/v1/tickets?scope=assigned");
    expect(asignados.body.total).toBe(1);

    const mios = await agente.get("/api/v1/tickets?scope=mine");
    expect(mios.body.total).toBe(1);
    expect(mios.body.items[0].area.name).toBe("Ventas");

    const sinAsignar = await agente.get("/api/v1/tickets?scope=unassigned");
    expect(sinAsignar.body.total).toBe(1);
  });

  it("busca por número y por título, y filtra por estado", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      title: "Pantalla azul al arrancar",
    });
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      title: "Teclado sin responder",
      status: "in_progress",
    });

    const agente = await loginAs(fixture.users.agentIt.email);

    const porNumero = await agente.get(
      `/api/v1/tickets?scope=area&q=${formatTicketNumber(ticket.get("number"))}`,
    );
    expect(porNumero.body.items).toHaveLength(1);
    expect(porNumero.body.items[0].title).toBe("Pantalla azul al arrancar");

    const porTitulo = await agente.get("/api/v1/tickets?scope=area&q=teclado");
    expect(porTitulo.body.items).toHaveLength(1);

    const porEstado = await agente.get("/api/v1/tickets?scope=area&status=in_progress");
    expect(porEstado.body.items).toHaveLength(1);
    expect(porEstado.body.items[0].status).toBe("in_progress");
  });

  // ── Orden por columna (cabeceras de la tabla) ────────────────

  describe("orden por columna", () => {
    async function tresTickets() {
      await seedTicket({
        areaId: fixture.areas.it,
        requesterId: fixture.users.employeeVentas.id,
        title: "Zumbido en el proyector",
        priority: "low",
      });
      await seedTicket({
        areaId: fixture.areas.it,
        requesterId: fixture.users.employeeIt.id,
        title: "Arranque lento",
        priority: "urgent",
      });
      await seedTicket({
        areaId: fixture.areas.it,
        requesterId: fixture.users.agentIt.id,
        title: "Monitor parpadeando",
        priority: "medium",
      });
      return loginAs(fixture.users.agentIt.email);
    }

    it("ordena por título en los dos sentidos", async () => {
      const agente = await tresTickets();

      const asc = await agente.get("/api/v1/tickets?scope=area&sort=title&dir=asc");
      expect(asc.body.items.map((item: { title: string }) => item.title)).toEqual([
        "Arranque lento",
        "Monitor parpadeando",
        "Zumbido en el proyector",
      ]);

      const desc = await agente.get("/api/v1/tickets?scope=area&sort=title&dir=desc");
      expect(desc.body.items[0].title).toBe("Zumbido en el proyector");
    });

    /** Lo que el orden alfabético se cargaría: "high" iría antes que "urgent". */
    it("la prioridad se ordena por urgencia, no por su texto", async () => {
      const agente = await tresTickets();

      const response = await agente.get("/api/v1/tickets?scope=area&sort=priority&dir=asc");
      expect(response.body.items.map((item: { priority: string }) => item.priority)).toEqual([
        "urgent",
        "medium",
        "low",
      ]);
    });

    it("ordena por el nombre del solicitante, que vive en otra colección", async () => {
      const agente = await tresTickets();

      const response = await agente.get("/api/v1/tickets?scope=area&sort=requester&dir=asc");
      expect(
        response.body.items.map((item: { requester: { name: string } }) => item.requester.name),
      ).toEqual(["Aldo Agente", "Elsa Empleada", "Vito Ventas"]);
    });

    it("los atajos de siempre siguen funcionando", async () => {
      const agente = await tresTickets();

      const recientes = await agente.get("/api/v1/tickets?scope=area&sort=recent");
      expect(recientes.body.items[0].title).toBe("Monitor parpadeando");

      const antiguos = await agente.get("/api/v1/tickets?scope=area&sort=oldest");
      expect(antiguos.body.items[0].title).toBe("Zumbido en el proyector");
    });
  });
});

// ── El reloj del SLA de un ticket entregado (spec §5.3) ────────

describe("SLA de los tickets ya cerrados", () => {
  it("el detalle dice cuándo paró el reloj, no cuánto lleva vencido", async () => {
    const hace60Dias = new Date(Date.now() - 60 * 86_400_000);
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
      createdAt: hace60Dias,
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const resuelto = await agente
      .patch(`/api/v1/tickets/${String(ticket._id)}`)
      .send({ status: "resolved", note: "Era el cable de red" });

    expect(resuelto.status).toBe(200);
    // Con esto la interfaz deja de contar días contra un ticket entregado.
    expect(resuelto.body.sla.settledAt).toBeTruthy();
    expect(resuelto.body.sla.settledAt).toBe(resuelto.body.sla.resolvedAt);
  });

  it("un ticket cancelado también deja de correr", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
      createdAt: new Date(Date.now() - 30 * 86_400_000),
    });

    const supervisora = await loginAs(fixture.users.supIt.email);
    const cancelado = await supervisora
      .patch(`/api/v1/tickets/${String(ticket._id)}`)
      .send({ status: "cancelled" });

    // No hay `resolvedAt`, así que la fecha sale del historial de estados.
    expect(cancelado.body.sla.resolvedAt).toBeUndefined();
    expect(cancelado.body.sla.settledAt).toBeTruthy();
  });
});
