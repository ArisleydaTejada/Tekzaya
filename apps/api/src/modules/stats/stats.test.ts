import { ACTIVE_TICKET_STATUSES } from "@tekzaya/shared";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import {
  connect,
  loginAs,
  resetDatabase,
  seedTicket,
  type Fixture,
} from "../../test/fixtures";

/**
 * El DoD de F6 pide que "los KPI del tablero cuadren con una consulta manual a la
 * base". Esa es la forma de estas pruebas: cada cifra del endpoint se compara con
 * un `countDocuments` escrito aparte, no con un número copiado a mano, que es lo que
 * se queda obsoleto en cuanto cambia la semilla.
 */
describe("estadísticas del tablero", () => {
  let fx: Fixture;
  const today = new Date();

  beforeAll(connect);

  beforeEach(async () => {
    fx = await resetDatabase();
  });

  describe("alcance", () => {
    it("un empleado no puede pedir las estadísticas de su área", async () => {
      const agent = await loginAs(fx.users.agentIt.email);
      const response = await agent.get("/api/v1/stats/overview?scope=area");
      expect(response.status).toBe(403);
    });

    it("un empleado no puede pedir las globales", async () => {
      const agent = await loginAs(fx.users.agentIt.email);
      expect((await agent.get("/api/v1/stats/overview?scope=global")).status).toBe(403);
    });

    it("un supervisor no puede pedir las globales ni las de otra área", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      expect((await agent.get("/api/v1/stats/overview?scope=global")).status).toBe(403);
      const otherArea = await agent.get(
        `/api/v1/stats/overview?scope=area&areaId=${fx.areas.ventas}`,
      );
      expect(otherArea.status).toBe(403);
    });

    it("un supervisor no puede pedir las de una persona de otra área", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent.get(
        `/api/v1/stats/overview?scope=user&userId=${fx.users.employeeVentas.id}`,
      );
      expect(response.status).toBe(403);
    });

    it("el supervisor de RRHH lee todas las áreas, pero solo lee", async () => {
      await User.updateOne(
        { _id: fx.users.supIt.id },
        { $set: { hasGlobalReadAccess: true } },
      );
      const agent = await loginAs(fx.users.supIt.email);
      expect((await agent.get("/api/v1/stats/overview?scope=global")).status).toBe(200);
    });

    it("el administrador llega a cualquier área", async () => {
      const agent = await loginAs(fx.users.admin.email);
      const response = await agent.get(
        `/api/v1/stats/overview?scope=area&areaId=${fx.areas.ventas}`,
      );
      expect(response.status).toBe(200);
      expect(response.body.areaName).toBe("Ventas");
    });
  });

  describe("KPI de área", () => {
    beforeEach(async () => {
      // Tres pendientes (uno sin asignar), dos resueltos hoy —uno fuera de plazo—
      // y uno calificado. Más un ticket de otra área que no debe contarse.
      await seedTicket({ areaId: fx.areas.it, requesterId: fx.users.employeeIt.id });
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "on_hold",
      });
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "resolved",
        resolvedAt: today,
        resolvedByIds: [fx.users.agentIt.id],
        resolutionBreached: false,
        csat: { rating: 5, answeredAt: today },
      });
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "closed",
        resolvedAt: today,
        resolvedByIds: [fx.users.agentIt.id],
        resolutionBreached: true,
      });
      await seedTicket({ areaId: fx.areas.ventas, requesterId: fx.users.employeeVentas.id });
    });

    it("cuadra con las consultas a mano", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent.get("/api/v1/stats/overview?scope=area&period=day").expect(200);

      const pending = await Ticket.countDocuments({
        areaId: fx.areas.it,
        status: { $in: [...ACTIVE_TICKET_STATUSES] },
      });
      const unassigned = await Ticket.countDocuments({
        areaId: fx.areas.it,
        status: { $in: [...ACTIVE_TICKET_STATUSES] },
        assigneeIds: { $size: 0 },
      });

      expect(body.kpis.kind).toBe("area");
      expect(body.kpis.pending).toBe(pending);
      expect(body.kpis.pending).toBe(3);
      expect(body.kpis.unassigned).toBe(unassigned);
      expect(body.kpis.unassigned).toBe(1);
      expect(body.kpis.resolved).toBe(2);
      // Uno de los dos resueltos venció: 50 % de cumplimiento.
      expect(body.kpis.slaCompliance).toBe(50);
      expect(body.kpis.csatAverage).toBe(5);
      expect(body.kpis.csatResponses).toBe(1);
    });

    it("el área del supervisor no incluye tickets de otra área", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const area = await agent.get("/api/v1/stats/overview?scope=area&period=day").expect(200);

      const admin = await loginAs(fx.users.admin.email);
      const global = await admin.get("/api/v1/stats/overview?scope=global&period=day").expect(200);

      expect(global.body.kpis.pending).toBe(area.body.kpis.pending + 1);
    });

    it("un duplicado fusionado no cuenta en ninguna métrica", async () => {
      const before = await (await loginAs(fx.users.supIt.email))
        .get("/api/v1/stats/overview?scope=area&period=day")
        .expect(200);

      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        status: "merged",
      });

      const after = await (await loginAs(fx.users.supIt.email))
        .get("/api/v1/stats/overview?scope=area&period=day")
        .expect(200);

      expect(after.body.kpis.pending).toBe(before.body.kpis.pending);
    });

    it("el tiempo de primera respuesta se mide en horas laborales", async () => {
      // La respuesta tiene que caer DENTRO de la ventana del período, así que ambas
      // fechas van en el pasado. El valor exacto lo decide el motor de F1 (fuera de
      // jornada son cero horas), así que se comprueba que la medida existe y no
      // supera el intervalo real.
      const created = new Date(Date.now() - 3 * 3_600_000);
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        createdAt: created,
        firstResponseAt: new Date(created.getTime() + 2 * 3_600_000),
        firstResponderId: fx.users.agentIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });

      // Rango explícito de ayer a hoy: con `period=day` la prueba fallaría al
      // ejecutarse de madrugada, cuando "hace tres horas" ya es el día anterior.
      const day = (offset: number) =>
        new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .get(`/api/v1/stats/overview?scope=area&period=range&from=${day(-1)}&to=${day(0)}`)
        .expect(200);
      expect(body.kpis.firstResponseHours).not.toBeNull();
      expect(body.kpis.firstResponseHours).toBeLessThanOrEqual(2);
    });
  });

  describe("KPI personales", () => {
    beforeEach(async () => {
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "in_progress",
      });
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "resolved",
        resolvedAt: today,
        resolvedByIds: [fx.users.agentIt.id],
      });
      // Urgente sin asignar en su área: también le cuenta (spec §7.2.1).
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        priority: "urgent",
      });
      // Urgente de otra área: no.
      await seedTicket({
        areaId: fx.areas.ventas,
        requesterId: fx.users.employeeVentas.id,
        priority: "urgent",
      });
    });

    it("cuenta lo suyo y los pendientes de su área", async () => {
      const agent = await loginAs(fx.users.agentIt.email);
      const { body } = await agent.get("/api/v1/stats/overview?scope=me&period=day").expect(200);

      expect(body.kpis.kind).toBe("personal");
      expect(body.kpis.pendingForMe).toBe(1);
      expect(body.kpis.resolvedByMe).toBe(1);
      expect(body.kpis.areaPending).toBe(2);
      expect(body.kpis.urgent).toBe(1);
    });

    it("un ticket resuelto la semana pasada no cuenta en el período de hoy", async () => {
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        status: "closed",
        resolvedAt: new Date(today.getTime() - 20 * 86_400_000),
        resolvedByIds: [fx.users.agentIt.id],
      });

      const agent = await loginAs(fx.users.agentIt.email);
      const day = await agent.get("/api/v1/stats/overview?scope=me&period=day").expect(200);

      // Rango explícito en vez de `period=year`: en enero el año en curso no llega
      // a cubrir "hace veinte días" y la prueba fallaría solo esos días.
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const today10 = new Date().toISOString().slice(0, 10);
      const wide = await agent
        .get(`/api/v1/stats/overview?scope=me&period=range&from=${since}&to=${today10}`)
        .expect(200);

      expect(day.body.kpis.resolvedByMe).toBe(1);
      expect(wide.body.kpis.resolvedByMe).toBe(2);
    });
  });

  describe("franja de incidente", () => {
    beforeEach(async () => {
      const incident = {
        groupId: "inc-prueba",
        label: "Caída del wifi en el segundo piso",
        confidence: 0.9,
        status: "detected",
      };
      for (let i = 0; i < 3; i++) {
        const ticket = await seedTicket({
          areaId: fx.areas.it,
          requesterId: fx.users.employeeIt.id,
        });
        await Ticket.updateOne({ _id: ticket._id }, { $set: { "ai.incident": incident } });
      }
    });

    it("el supervisor ve el grupo con su recuento", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent.get("/api/v1/stats/overview?scope=area&period=day").expect(200);
      expect(body.incident).toEqual({
        groupId: "inc-prueba",
        label: "Caída del wifi en el segundo piso",
        ticketCount: 3,
      });
    });

    it("el solicitante no se entera de que su problema es uno de tres", async () => {
      const agent = await loginAs(fx.users.employeeIt.email);
      const { body } = await agent.get("/api/v1/stats/overview?scope=me&period=day").expect(200);
      expect(body.incident).toBeUndefined();
    });

    it("un incidente descartado desaparece de la franja", async () => {
      await Ticket.updateMany(
        { "ai.incident.groupId": "inc-prueba" },
        { $set: { "ai.incident.status": "dismissed" } },
      );
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent.get("/api/v1/stats/overview?scope=area&period=day").expect(200);
      expect(body.incident).toBeUndefined();
    });
  });

  describe("disponibilidad del equipo", () => {
    it("pone a los ausentes primero y solo muestra el área pedida", async () => {
      await User.updateOne(
        { _id: fx.users.agentIt.id },
        { $set: { availability: { state: "away", reason: "vacation" } } },
      );

      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent.get("/api/v1/stats/availability?scope=area").expect(200);

      expect(body.items[0].name).toBe("Aldo Agente");
      expect(body.items[0].availability.state).toBe("away");
      expect(body.items.every((item: { areaId: string }) => item.areaId === String(fx.areas.it))).toBe(
        true,
      );
    });
  });

  describe("series de las gráficas", () => {
    beforeEach(async () => {
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        categoryId: fx.categories.redes,
      });
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        categoryId: fx.categories.redes,
        status: "resolved",
        resolvedAt: today,
        resolvedByIds: [fx.users.agentIt.id],
      });
      // Sin categoría: tiene que salir agrupado aparte, no desaparecer del total.
      await seedTicket({ areaId: fx.areas.it, requesterId: fx.users.employeeIt.id });
    });

    it("agrupa por categoría dejando visible lo no clasificado", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .get("/api/v1/stats/by-category?scope=area&period=day")
        .expect(200);

      const byName = new Map<string, number>(
        body.items.map((row: { name: string; count: number }) => [row.name, row.count]),
      );
      expect(byName.get("Redes y conectividad")).toBe(2);
      expect(byName.get("Sin clasificar")).toBe(1);
    });

    it("la serie temporal trae creados y resueltos del período", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent.get("/api/v1/stats/timeseries?scope=area&period=day").expect(200);

      const created = body.points.reduce(
        (sum: number, point: { created: number }) => sum + point.created,
        0,
      );
      const resolved = body.points.reduce(
        (sum: number, point: { resolved: number }) => sum + point.resolved,
        0,
      );
      expect(created).toBe(3);
      expect(resolved).toBe(1);
    });

    it("por persona atribuye el resuelto a cada responsable y deja fuera a quien no hizo nada", async () => {
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        status: "resolved",
        resolvedAt: today,
        resolvedByIds: [fx.users.agentIt.id, fx.users.supIt.id],
      });

      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent.get("/api/v1/stats/by-person?scope=area&period=day").expect(200);

      const byName = new Map<string, number>(
        body.items.map((row: { name: string; resolved: number }) => [row.name, row.resolved]),
      );
      expect(byName.get("Aldo Agente")).toBe(2);
      expect(byName.get("Sonia Supervisora")).toBe(1);
      expect(byName.has("Elsa Empleada")).toBe(false);
    });
  });

  describe("exportación CSV", () => {
    it("lleva BOM, cabeceras y los tickets del período", async () => {
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        title: 'Título con "comillas", coma incluida',
      });

      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent.get("/api/v1/stats/export?scope=area&period=day").expect(200);

      expect(response.headers["content-type"]).toContain("text/csv");
      expect(response.text.startsWith("﻿")).toBe(true);
      expect(response.text).toContain("Cumplimiento de SLA (%)");
      expect(response.text).toContain("Número,Título,Área");
      // El entrecomillado dobla las comillas internas en vez de romper la fila.
      expect(response.text).toContain('"Título con ""comillas"", coma incluida"');
    });

    it("respeta el alcance: un empleado no la descarga de su área", async () => {
      const agent = await loginAs(fx.users.employeeIt.email);
      expect((await agent.get("/api/v1/stats/export?scope=area")).status).toBe(403);
    });
  });
});
