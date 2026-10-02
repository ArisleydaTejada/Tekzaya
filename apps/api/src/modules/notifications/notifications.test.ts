import type { Types } from "mongoose";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Notification } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";
import {
  connect,
  loginAs,
  resetDatabase,
  seedTicket,
  type Fixture,
} from "../../test/fixtures";

/**
 * La tabla del spec §8 dice **quién recibe** cada aviso. Lo que se prueba aquí es
 * eso: el destinatario correcto y, sobre todo, quién **no** lo recibe. Un aviso de
 * más es una fuga de información tan real como un endpoint mal protegido.
 */
describe("notificaciones", () => {
  let fx: Fixture;

  beforeAll(connect);

  beforeEach(async () => {
    fx = await resetDatabase();
  });

  const inboxOf = (userId: Types.ObjectId) =>
    Notification.find({ userId }).sort({ createdAt: 1 }).lean();

  describe("bandeja", () => {
    it("solo devuelve las propias y cuenta las no leídas", async () => {
      await Notification.insertMany([
        { userId: fx.users.agentIt.id, type: "ticket_assigned", title: "Para Aldo" },
        { userId: fx.users.agentIt.id, type: "sla_at_risk", title: "También para Aldo" },
        { userId: fx.users.supIt.id, type: "join_request", title: "Para Sonia" },
      ]);

      const agent = await loginAs(fx.users.agentIt.email);
      const { body } = await agent.get("/api/v1/notifications").expect(200);

      expect(body.total).toBe(2);
      expect(body.unread).toBe(2);
      expect(body.items.every((item: { title: string }) => item.title.includes("Aldo"))).toBe(true);
    });

    it("resuelve el número del ticket para que la campana enlace", async () => {
      const ticket = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
      });
      await Notification.create({
        userId: fx.users.agentIt.id,
        type: "ticket_assigned",
        title: "Te asignaron un ticket",
        ticketId: ticket._id,
      });

      const agent = await loginAs(fx.users.agentIt.email);
      const { body } = await agent.get("/api/v1/notifications").expect(200);
      expect(body.items[0].ticketNumber).toBe(ticket.number);
    });

    it("marcar como leídas vacía el contador y no borra nada", async () => {
      await Notification.insertMany([
        { userId: fx.users.agentIt.id, type: "ticket_assigned", title: "Uno" },
        { userId: fx.users.agentIt.id, type: "ticket_reply", title: "Dos" },
      ]);

      const agent = await loginAs(fx.users.agentIt.email);
      const marked = await agent.patch("/api/v1/notifications").send({ all: true }).expect(200);

      expect(marked.body.marked).toBe(2);
      expect(marked.body.unread).toBe(0);
      expect(await Notification.countDocuments({ userId: fx.users.agentIt.id })).toBe(2);
    });

    it("no se pueden marcar las de otra persona", async () => {
      const foreign = await Notification.create({
        userId: fx.users.supIt.id,
        type: "join_request",
        title: "De Sonia",
      });

      const agent = await loginAs(fx.users.agentIt.email);
      await agent
        .patch("/api/v1/notifications")
        .send({ ids: [String(foreign._id)] })
        .expect(200);

      const after = await Notification.findById(foreign._id).lean();
      expect(after?.readAt).toBeUndefined();
    });
  });

  describe("eventos del ciclo del ticket (spec §8)", () => {
    it("un ticket nuevo avisa al supervisor del área, no a quien lo creó", async () => {
      const agent = await loginAs(fx.users.employeeIt.email);
      await agent
        .post("/api/v1/tickets")
        .send({
          title: "No tengo acceso al CRM",
          description: "Desde esta mañana el CRM me rechaza la contraseña.",
          areaId: String(fx.areas.it),
        })
        .expect(201);

      const supervisor = await inboxOf(fx.users.supIt.id);
      expect(supervisor.map((item) => item.type)).toContain("ticket_created_in_area");
      expect(await inboxOf(fx.users.employeeIt.id)).toHaveLength(0);
    });

    it("crear en nombre de un compañero le avisa a él", async () => {
      const agent = await loginAs(fx.users.agentIt.email);
      await agent
        .post("/api/v1/tickets")
        .send({
          title: "La impresora de Elsa no imprime",
          description: "Elsa me pidió que lo reportara: la impresora no responde.",
          areaId: String(fx.areas.it),
          requesterId: String(fx.users.employeeIt.id),
        })
        .expect(201);

      const inbox = await inboxOf(fx.users.employeeIt.id);
      expect(inbox).toHaveLength(1);
      expect(inbox[0]!.type).toBe("ticket_created_for_you");
      expect(inbox[0]!.title).toContain("Aldo Agente");
    });

    it("asignar avisa solo a los responsables nuevos", async () => {
      const ticket = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "assigned",
      });

      const supervisor = await loginAs(fx.users.supIt.email);
      await supervisor
        .put(`/api/v1/tickets/${ticket._id}/assignees`)
        .send({ assigneeIds: [String(fx.users.agentIt.id), String(fx.users.employeeIt.id)] })
        .expect(200);

      // Aldo ya lo era: no se le repite el aviso.
      expect(
        (await inboxOf(fx.users.agentIt.id)).filter((item) => item.type === "ticket_assigned"),
      ).toHaveLength(0);
      expect(
        (await inboxOf(fx.users.employeeIt.id)).filter((item) => item.type === "ticket_assigned"),
      ).toHaveLength(1);
    });

    it("una respuesta pública del área avisa al solicitante; una nota interna no avisa a nadie", async () => {
      const ticket = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });

      const agent = await loginAs(fx.users.agentIt.email);
      await agent
        .post(`/api/v1/tickets/${ticket._id}/messages`)
        .send({ type: "public", body: "Ya estamos revisando tu acceso." })
        .expect(201);

      const afterPublic = await inboxOf(fx.users.employeeIt.id);
      expect(afterPublic.map((item) => item.type)).toEqual(["ticket_reply"]);

      await agent
        .post(`/api/v1/tickets/${ticket._id}/messages`)
        .send({ type: "internal", body: "Ojo: su cuenta está bloqueada en el directorio." })
        .expect(201);

      // La nota interna no genera ni un aviso: ni al solicitante (que no debe saber
      // que existe) ni al resto, que ya tiene el ticket en su lista.
      expect(await inboxOf(fx.users.employeeIt.id)).toHaveLength(1);
    });

    it("la respuesta del solicitante avisa a los responsables", async () => {
      const ticket = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });

      const requester = await loginAs(fx.users.employeeIt.email);
      await requester
        .post(`/api/v1/tickets/${ticket._id}/messages`)
        .send({ type: "public", body: "Sigue igual, acabo de probar otra vez." })
        .expect(201);

      expect((await inboxOf(fx.users.agentIt.id)).map((item) => item.type)).toContain(
        "ticket_reply",
      );
    });

    it("resolver avisa al solicitante con la invitación a la encuesta", async () => {
      const ticket = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });

      const agent = await loginAs(fx.users.agentIt.email);
      await agent
        .patch(`/api/v1/tickets/${ticket._id}`)
        .send({ status: "resolved", note: "Se restableció la contraseña del CRM." })
        .expect(200);

      const inbox = await inboxOf(fx.users.employeeIt.id);
      expect(inbox.map((item) => item.type)).toContain("ticket_resolved");
    });

    it("pasar a En espera pide la respuesta del solicitante", async () => {
      const ticket = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });

      const agent = await loginAs(fx.users.agentIt.email);
      await agent.patch(`/api/v1/tickets/${ticket._id}`).send({ status: "on_hold" }).expect(200);

      const inbox = await inboxOf(fx.users.employeeIt.id);
      expect(inbox.map((item) => item.type)).toContain("ticket_on_hold");
      expect(inbox[0]!.title).toBe("Necesitamos tu respuesta");
    });

    it("marcarse ausente con tickets abiertos avisa al supervisor", async () => {
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });

      const agent = await loginAs(fx.users.agentIt.email);
      await agent.patch("/api/v1/me/availability").send({ state: "away" }).expect(200);

      const inbox = await inboxOf(fx.users.supIt.id);
      expect(inbox.map((item) => item.type)).toContain("assignee_away");
    });

    it("marcarse ausente sin tickets abiertos no molesta a nadie", async () => {
      const agent = await loginAs(fx.users.agentIt.email);
      await agent.patch("/api/v1/me/availability").send({ state: "away" }).expect(200);
      expect(await inboxOf(fx.users.supIt.id)).toHaveLength(0);
    });
  });

  describe("encuesta de satisfacción (spec §7.6)", () => {
    async function resolvedTicket() {
      const ticket = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });
      const agent = await loginAs(fx.users.agentIt.email);
      await agent
        .patch(`/api/v1/tickets/${ticket._id}`)
        .send({ status: "resolved", note: "Listo." })
        .expect(200);
      return ticket;
    }

    it("la responde el solicitante y queda en el ticket", async () => {
      const ticket = await resolvedTicket();
      const requester = await loginAs(fx.users.employeeIt.email);

      const response = await requester
        .post(`/api/v1/tickets/${ticket._id}/csat`)
        .send({ rating: 4, comment: "Rápidos, gracias." })
        .expect(200);

      expect(response.body.csat.rating).toBe(4);
      expect(response.body.permissions.answerCsat).toBe(false);

      const saved = await Ticket.findById(ticket._id).lean();
      expect(saved?.csat?.rating).toBe(4);
      expect(saved?.csat?.comment).toBe("Rápidos, gracias.");
    });

    it("solo una vez por ticket", async () => {
      const ticket = await resolvedTicket();
      const requester = await loginAs(fx.users.employeeIt.email);

      await requester.post(`/api/v1/tickets/${ticket._id}/csat`).send({ rating: 5 }).expect(200);
      const second = await requester
        .post(`/api/v1/tickets/${ticket._id}/csat`)
        .send({ rating: 1 })
        .expect(409);

      expect(second.body.error.code).toBe("already_answered");
      expect((await Ticket.findById(ticket._id).lean())?.csat?.rating).toBe(5);
    });

    it("quien atendió el ticket no se califica a sí mismo", async () => {
      const ticket = await resolvedTicket();
      const agent = await loginAs(fx.users.agentIt.email);
      await agent.post(`/api/v1/tickets/${ticket._id}/csat`).send({ rating: 5 }).expect(403);
    });

    it("ni el administrador puntúa en nombre de otro", async () => {
      const ticket = await resolvedTicket();
      const admin = await loginAs(fx.users.admin.email);
      await admin.post(`/api/v1/tickets/${ticket._id}/csat`).send({ rating: 5 }).expect(403);
    });

    it("no se puede responder antes de que esté resuelto", async () => {
      const ticket = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        status: "in_progress",
      });
      const requester = await loginAs(fx.users.employeeIt.email);
      await requester.post(`/api/v1/tickets/${ticket._id}/csat`).send({ rating: 5 }).expect(403);
    });

    it("al cerrarse el ticket la encuesta ya no admite respuesta", async () => {
      const ticket = await resolvedTicket();
      const requester = await loginAs(fx.users.employeeIt.email);
      await requester.patch(`/api/v1/tickets/${ticket._id}`).send({ status: "closed" }).expect(200);

      await requester.post(`/api/v1/tickets/${ticket._id}/csat`).send({ rating: 5 }).expect(403);
    });
  });

  describe("exportación de la lista de tickets", () => {
    it("no filtra el contenido de las notas internas", async () => {
      const ticket = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });
      const agent = await loginAs(fx.users.agentIt.email);
      await agent
        .post(`/api/v1/tickets/${ticket._id}/messages`)
        .send({ type: "internal", body: "SECRETO-DEL-AREA" })
        .expect(201);

      const csv = await agent.get("/api/v1/tickets/export?scope=area").expect(200);
      expect(csv.text).toContain("Número,Título,Área");
      expect(csv.text).not.toContain("SECRETO-DEL-AREA");
    });

    it("el solicitante solo exporta lo que ya puede ver", async () => {
      await seedTicket({ areaId: fx.areas.ventas, requesterId: fx.users.employeeVentas.id });
      const mine = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        title: "Mi propio ticket",
      });

      const requester = await loginAs(fx.users.employeeIt.email);
      const csv = await requester.get("/api/v1/tickets/export?scope=mine").expect(200);

      expect(csv.text).toContain("Mi propio ticket");
      expect(csv.text.split("\r\n").filter(Boolean)).toHaveLength(2);
      expect(csv.text).toContain(`TK-${String(mine.number).padStart(6, "0")}`);
    });
  });
});
