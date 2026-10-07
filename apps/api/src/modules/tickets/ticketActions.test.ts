import { formatTicketNumber } from "@tekzaya/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Message } from "../../models/message.model";
import { Notification } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";
import {
  connect,
  disconnect,
  loginAs,
  resetDatabase,
  seedTicket,
  type Fixture,
} from "../../test/fixtures";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

describe("transferir a otra área", () => {
  it("devuelve el ticket a Abierto en el área nueva, sin responsables ni categoría", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });
    await Ticket.updateOne({ _id: ticket._id }, { $set: { categoryId: fixture.categories.redes } });

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .post(`/api/v1/tickets/${String(ticket._id)}/transfer`)
      .send({ areaId: String(fixture.areas.ventas), reason: "Es una consulta comercial" });

    expect(response.status).toBe(200);
    expect(response.body.area.name).toBe("Ventas");
    expect(response.body.status).toBe("open");
    expect(response.body.assignees).toHaveLength(0);
    expect(response.body.categoryName).toBeUndefined();

    // El supervisor del área nueva se entera; nadie más tiene por qué mirarlo.
    const avisos = await Notification.find({ type: "ticket_transferred" }).lean();
    expect(avisos.map((aviso) => String(aviso.userId))).toEqual([
      String(fixture.users.supVentas.id),
    ]);
  });

  it("el reloj del SLA no se reinicia al cambiar de área", async () => {
    const createdAt = new Date(Date.now() - 6 * 3_600_000);
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
      createdAt,
    });
    const antes = ticket.get("sla").resolutionDueAt as Date;

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .post(`/api/v1/tickets/${String(ticket._id)}/transfer`)
      .send({ areaId: String(fixture.areas.ventas), reason: "Área equivocada" });

    // El solicitante no tiene la culpa de que llegara mal clasificado.
    expect(new Date(response.body.sla.resolutionDueAt).getTime()).toBe(antes.getTime());
  });

  it("rechaza transferir al área en la que ya está", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .post(`/api/v1/tickets/${String(ticket._id)}/transfer`)
      .send({ areaId: String(fixture.areas.it), reason: "Sin sentido" });

    expect(response.status).toBe(422);
  });

  it("un miembro del área que no lo atiende no puede transferirlo", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const compañera = await loginAs(fixture.users.employeeIt.email);
    const response = await compañera
      .post(`/api/v1/tickets/${String(ticket._id)}/transfer`)
      .send({ areaId: String(fixture.areas.ventas), reason: "Me parece de Ventas" });

    expect(response.status).toBe(403);
  });
});

describe("fusión de duplicados", () => {
  async function escenario() {
    const principal = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
      title: "Se cayó el wifi en el segundo piso",
    });
    const duplicado = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeIt.id,
      status: "open",
      title: "No hay wifi en el segundo piso",
    });
    return { principal, duplicado };
  }

  it("absorbe el duplicado y suma su solicitante al principal", async () => {
    const { principal, duplicado } = await escenario();

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .post(`/api/v1/tickets/${String(principal._id)}/merge`)
      .send({ duplicateIds: [String(duplicado._id)], reason: "Mismo fallo de wifi" });

    expect(response.status).toBe(200);
    expect(response.body.mergedTickets).toHaveLength(1);
    expect(response.body.additionalRequesters.map((p: { id: string }) => p.id)).toContain(
      String(fixture.users.employeeIt.id),
    );

    const absorbido = await Ticket.findById(duplicado._id).lean();
    expect(absorbido!.status).toBe("merged");
    expect(String(absorbido!.mergedIntoId)).toBe(String(principal._id));
  });

  /**
   * El riesgo que introduce la fusión: alguien que solo reportó un problema pasa
   * a estar dentro de un ticket del área. Sigue siendo solicitante.
   */
  it("el solicitante heredado ve el principal pero NO sus notas internas", async () => {
    const { principal, duplicado } = await escenario();

    const agente = await loginAs(fixture.users.agentIt.email);
    await agente
      .post(`/api/v1/tickets/${String(principal._id)}/messages`)
      .send({ type: "internal", body: "CONFIDENCIAL: el switch está fuera de garantía" });

    const supervisora = await loginAs(fixture.users.supIt.email);
    await supervisora
      .post(`/api/v1/tickets/${String(principal._id)}/merge`)
      .send({ duplicateIds: [String(duplicado._id)], reason: "Mismo fallo de wifi" });

    const heredado = await loginAs(fixture.users.employeeIt.email);
    const detalle = await heredado.get(`/api/v1/tickets/${String(principal._id)}`);
    expect(detalle.status).toBe(200);
    expect(detalle.body.permissions.viewInternalNotes).toBe(false);

    const conversacion = await heredado.get(`/api/v1/tickets/${String(principal._id)}/messages`);
    expect(JSON.stringify(conversacion.body)).not.toContain("CONFIDENCIAL");
  });

  it("la conversación del principal incluye los mensajes del duplicado, marcados", async () => {
    const { principal, duplicado } = await escenario();

    const supervisora = await loginAs(fixture.users.supIt.email);
    await supervisora
      .post(`/api/v1/tickets/${String(principal._id)}/merge`)
      .send({ duplicateIds: [String(duplicado._id)], reason: "Mismo fallo" });

    const agente = await loginAs(fixture.users.agentIt.email);
    const conversacion = await agente.get(`/api/v1/tickets/${String(principal._id)}/messages`);

    const heredados = conversacion.body.items.filter(
      (message: { fromTicket?: { number: number } }) => message.fromTicket,
    );
    expect(heredados.length).toBeGreaterThan(0);
    expect(heredados[0].fromTicket.number).toBe(duplicado.get("number"));
  });

  it("no se fusionan tickets de áreas distintas", async () => {
    const principal = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });
    const otraArea = await seedTicket({
      areaId: fixture.areas.ventas,
      requesterId: fixture.users.employeeIt.id,
    });

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .post(`/api/v1/tickets/${String(principal._id)}/merge`)
      .send({ duplicateIds: [String(otraArea._id)], reason: "Parecen lo mismo" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("different_area");
  });

  it("deshacer la fusión devuelve el ticket a su estado previo y conserva el historial", async () => {
    const { principal, duplicado } = await escenario();

    const supervisora = await loginAs(fixture.users.supIt.email);
    await supervisora
      .post(`/api/v1/tickets/${String(principal._id)}/merge`)
      .send({ duplicateIds: [String(duplicado._id)], reason: "Mismo fallo de wifi" });

    const response = await supervisora
      .post(`/api/v1/tickets/${String(principal._id)}/unmerge`)
      .send({ duplicateId: String(duplicado._id) });

    expect(response.status).toBe(200);
    expect(response.body.mergedTickets).toHaveLength(0);
    expect(response.body.additionalRequesters).toHaveLength(0);

    const separado = await supervisora.get(`/api/v1/tickets/${String(duplicado._id)}`);
    expect(separado.body.status).toBe("open");
    expect(separado.body.mergedInto).toBeUndefined();
    // El paso por la fusión no se borra: queda en el historial (spec §13).
    expect(separado.body.history.map((entry: { status: string }) => entry.status)).toEqual([
      "open",
      "merged",
      "open",
    ]);
  });

  it("deshacer la fusión no es cosa de cualquier responsable", async () => {
    const { principal, duplicado } = await escenario();

    const supervisora = await loginAs(fixture.users.supIt.email);
    await supervisora
      .post(`/api/v1/tickets/${String(principal._id)}/merge`)
      .send({ duplicateIds: [String(duplicado._id)], reason: "Mismo fallo" });

    const agente = await loginAs(fixture.users.agentIt.email);
    const response = await agente
      .post(`/api/v1/tickets/${String(principal._id)}/unmerge`)
      .send({ duplicateId: String(duplicado._id) });

    expect(response.status).toBe(403);
  });

  it("propone duplicados del área por parecido de título", async () => {
    const { principal } = await escenario();
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeIt.id,
      title: "No hay wifi en el segundo piso",
    });
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeIt.id,
      title: "Solicito una licencia de diseño",
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const response = await agente.get(
      `/api/v1/tickets/${String(principal._id)}/duplicate-candidates`,
    );

    expect(response.status).toBe(200);
    const titulos = response.body.items.map((item: { title: string }) => item.title);
    expect(titulos).toContain("No hay wifi en el segundo piso");
    expect(titulos).not.toContain("Se cayó el wifi en el segundo piso"); // él mismo
  });

  // ── Fusionar escribiendo el número ──────────────────────────

  it("busca por número el ticket con el que fusionar", async () => {
    const { principal, duplicado } = await escenario();

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .get(`/api/v1/tickets/${String(principal._id)}/merge-lookup`)
      .query({ number: formatTicketNumber(duplicado.get("number")) });

    expect(response.status).toBe(200);
    expect(response.body.candidate.id).toBe(String(duplicado._id));
    expect(response.body.candidate.requesterName).toBe("Elsa Empleada");
  });

  it("acepta el número suelto, sin el prefijo", async () => {
    const { principal, duplicado } = await escenario();

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .get(`/api/v1/tickets/${String(principal._id)}/merge-lookup`)
      .query({ number: String(duplicado.get("number")) });

    expect(response.status).toBe(200);
    expect(response.body.candidate.id).toBe(String(duplicado._id));
  });

  it("no deja fusionar un ticket consigo mismo ni con uno de otra área", async () => {
    const { principal } = await escenario();
    const ajeno = await seedTicket({
      areaId: fixture.areas.ventas,
      requesterId: fixture.users.employeeVentas.id,
      title: "Falta una cotización",
    });

    const admin = await loginAs(fixture.users.admin.email);

    const propio = await admin
      .get(`/api/v1/tickets/${String(principal._id)}/merge-lookup`)
      .query({ number: formatTicketNumber(principal.get("number")) });
    expect(propio.status).toBe(422);

    const otraArea = await admin
      .get(`/api/v1/tickets/${String(principal._id)}/merge-lookup`)
      .query({ number: formatTicketNumber(ajeno.get("number")) });
    expect(otraArea.status).toBe(422);
    expect(otraArea.body.error.code).toBe("different_area");
  });

  it("dice qué número no existe en vez de un 404 pelado", async () => {
    const { principal } = await escenario();

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .get(`/api/v1/tickets/${String(principal._id)}/merge-lookup`)
      .query({ number: "TK-999999" });

    expect(response.status).toBe(404);
    expect(response.body.error.message).toContain("TK-999999");
  });

  /**
   * Lo que pide el ajuste: el duplicado queda cerrado diciendo con cuál se
   * fusionó, y el principal se queda con su ficha para poder leerla sin salir.
   */
  it("deja un mensaje en cada ticket y la ficha del duplicado en el principal", async () => {
    const { principal, duplicado } = await escenario();

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora
      .post(`/api/v1/tickets/${String(principal._id)}/merge`)
      .send({ duplicateIds: [String(duplicado._id)], reason: "Mismo fallo de wifi" });

    // En el principal: la ficha del duplicado, no solo su número.
    const [ficha] = response.body.mergedTickets;
    expect(ficha.number).toBe(duplicado.get("number"));
    expect(ficha.requesterName).toBe("Elsa Empleada");
    expect(ficha.description).toBeTruthy();
    expect(ficha.mergedAt).toBeTruthy();

    const enPrincipal = await Message.findOne({
      ticketId: principal._id,
      "systemEvent.kind": "merged",
    }).lean();
    expect(enPrincipal!.systemEvent!.to).toBe(formatTicketNumber(duplicado.get("number")));

    // En el duplicado: el mensaje contrario, y el ticket fuera de circulación.
    const enDuplicado = await Message.findOne({
      ticketId: duplicado._id,
      "systemEvent.kind": "merged_into",
    }).lean();
    expect(enDuplicado!.systemEvent!.to).toBe(formatTicketNumber(principal.get("number")));

    const absorbido = await Ticket.findById(duplicado._id).lean();
    expect(absorbido!.status).toBe("merged");
  });
});

describe("«Unirme»", () => {
  it("avisa al supervisor y queda en el hilo", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const compañera = await loginAs(fixture.users.employeeIt.email);
    const response = await compañera
      .post(`/api/v1/tickets/${String(ticket._id)}/join-request`)
      .send({ message: "Ya vi este fallo la semana pasada" });

    expect(response.status).toBe(200);

    const avisos = await Notification.find({ type: "join_request" }).lean();
    expect(avisos.map((aviso) => String(aviso.userId))).toEqual([String(fixture.users.supIt.id)]);

    const conversacion = await compañera.get(`/api/v1/tickets/${String(ticket._id)}/messages`);
    const evento = conversacion.body.items.find(
      (message: { systemEvent?: { kind: string } }) => message.systemEvent?.kind === "join_requested",
    );
    expect(evento).toBeDefined();
    expect(evento.systemEvent.to).toBe("Elsa Empleada");
  });

  it("sin responsables no se pide unirse: se toma", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      status: "open",
    });

    const compañera = await loginAs(fixture.users.employeeIt.email);
    const response = await compañera.post(`/api/v1/tickets/${String(ticket._id)}/join-request`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.message).toContain("tómalo");
  });
});

describe("carga del área", () => {
  it("sugiere a la persona disponible con menos carga ponderada", async () => {
    // La supervisora carga con un urgente (peso 4); el agente, con dos bajos (2).
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.supIt.id],
      status: "in_progress",
      priority: "urgent",
    });
    for (let i = 0; i < 2; i++) {
      await seedTicket({
        areaId: fixture.areas.it,
        requesterId: fixture.users.employeeVentas.id,
        assigneeIds: [fixture.users.agentIt.id],
        status: "in_progress",
        priority: "low",
      });
    }

    const supervisora = await loginAs(fixture.users.supIt.email);
    const response = await supervisora.get(`/api/v1/areas/${String(fixture.areas.it)}/workload`);

    expect(response.status).toBe(200);
    const porNombre = new Map<string, any>(
      response.body.items.map((item: { name: string }) => [item.name, item]),
    );
    expect(porNombre.get("Sonia Supervisora").load).toBe(4);
    expect(porNombre.get("Sonia Supervisora").urgentOrHigh).toBe(1);
    expect(porNombre.get("Aldo Agente").load).toBe(2);
    expect(porNombre.get("Aldo Agente").openTickets).toBe(2);

    // Elsa y Ana no tienen nada; la sugerida es una de ellas, nunca la más cargada.
    const sugerida = response.body.items.find((item: { suggested: boolean }) => item.suggested);
    expect(sugerida.load).toBe(0);
  });

  it("no se consulta la carga de otra área", async () => {
    const ventas = await loginAs(fixture.users.employeeVentas.email);
    const response = await ventas.get(`/api/v1/areas/${String(fixture.areas.it)}/workload`);
    expect(response.status).toBe(403);
  });
});
