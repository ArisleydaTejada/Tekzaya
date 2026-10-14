import { DEFAULT_SETTINGS, type ReportWidget } from "@tekzaya/shared";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Report } from "../../models/report.model";
import { Settings, SETTINGS_ID } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";
import { invalidateSettingsCache } from "../settings/settings.service";
import { connect, loginAs, resetDatabase, seedTicket, type Fixture } from "../../test/fixtures";

/**
 * El DoD de F7 es una sola frase: *un empleado que manipule el `userId` o el `areaId`
 * del payload recibe 403, probado para los 4 roles*. Esa es la columna de pruebas de
 * este archivo; el resto comprueba que las medidas cuadren con una cuenta escrita
 * aparte, igual que en F6.
 */

/** Gráfica mínima válida; cada prueba cambia lo que le interesa. */
function widget(partial: Partial<ReportWidget> = {}): ReportWidget {
  return {
    id: "w1",
    title: "Prueba",
    chart: "kpi",
    measures: [{ key: "created" }],
    filters: {},
    sort: "value_desc",
    showValues: true,
    showLegend: true,
    showTarget: false,
    layout: { w: 1 },
    ...partial,
  };
}

describe("reportes", () => {
  let fx: Fixture;

  beforeAll(connect);

  beforeEach(async () => {
    fx = await resetDatabase();
  });

  // ── Alcance: el DoD de la fase ──────────────────────────────

  describe("alcance revalidado en el servidor", () => {
    it("el empleado solo reporta sobre sí mismo", async () => {
      const agent = await loginAs(fx.users.agentIt.email);

      const mine = await agent.post("/api/v1/reports/query").send({ scope: "me", widget: widget() });
      expect(mine.status).toBe(200);

      // Los tres alcances que su rol no concede, pedidos a mano en el payload.
      for (const payload of [
        { scope: "area" },
        { scope: "area", areaId: String(fx.areas.ventas) },
        { scope: "global" },
        { scope: "user", userId: String(fx.users.supIt.id) },
      ]) {
        const response = await agent
          .post("/api/v1/reports/query")
          .send({ ...payload, widget: widget() });
        expect(response.status, JSON.stringify(payload)).toBe(403);
      }
    });

    it("el supervisor de área no sale de su área", async () => {
      const agent = await loginAs(fx.users.supIt.email);

      expect((await agent.post("/api/v1/reports/query").send({ scope: "area", widget: widget() })).status).toBe(200);
      // Una persona de su área, sí; de otra, no.
      const own = await agent
        .post("/api/v1/reports/query")
        .send({ scope: "user", userId: String(fx.users.agentIt.id), widget: widget() });
      expect(own.status).toBe(200);

      for (const payload of [
        { scope: "global" },
        { scope: "area", areaId: String(fx.areas.ventas) },
        { scope: "user", userId: String(fx.users.employeeVentas.id) },
      ]) {
        const response = await agent
          .post("/api/v1/reports/query")
          .send({ ...payload, widget: widget() });
        expect(response.status, JSON.stringify(payload)).toBe(403);
      }
    });

    it("el supervisor de RRHH lee todas las áreas y cualquier persona", async () => {
      const agent = await loginAs(fx.users.supRrhh.email);
      for (const payload of [
        { scope: "global" },
        { scope: "area", areaId: String(fx.areas.it) },
        { scope: "user", userId: String(fx.users.agentIt.id) },
      ]) {
        const response = await agent
          .post("/api/v1/reports/query")
          .send({ ...payload, widget: widget() });
        expect(response.status, JSON.stringify(payload)).toBe(200);
      }
    });

    it("el administrador llega a cualquier alcance", async () => {
      const agent = await loginAs(fx.users.admin.email);
      const response = await agent
        .post("/api/v1/reports/query")
        .send({ scope: "area", areaId: String(fx.areas.ventas), widget: widget() });
      expect(response.status).toBe(200);
      expect(response.body.areaName).toBe("Ventas");
    });

    it("un filtro de gráfica tampoco abre otra área", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent.post("/api/v1/reports/query").send({
        scope: "area",
        widget: widget({ filters: { areaId: String(fx.areas.ventas) } }),
      });
      expect(response.status).toBe(403);
    });

    it("comparar con otra área se valida como un alcance más", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent.post("/api/v1/reports/query").send({
        scope: "area",
        widget: widget({ compareWith: { kind: "area", areaId: String(fx.areas.ventas) } }),
      });
      expect(response.status).toBe(403);
    });

    it("la lista de tickets aplica el mismo recorte", async () => {
      const agent = await loginAs(fx.users.agentIt.email);
      expect((await agent.get("/api/v1/reports/tickets?scope=global")).status).toBe(403);
      expect(
        (await agent.get(`/api/v1/reports/tickets?scope=area&areaId=${fx.areas.ventas}`)).status,
      ).toBe(403);
      expect((await agent.get("/api/v1/reports/tickets?scope=me")).status).toBe(200);
    });

    it("el CSV no es una puerta trasera al alcance", async () => {
      const agent = await loginAs(fx.users.agentIt.email);
      const response = await agent.get("/api/v1/reports/tickets/export?scope=global");
      expect(response.status).toBe(403);
    });
  });

  // ── Catálogo ────────────────────────────────────────────────

  describe("catálogo por rol", () => {
    it("el empleado no recibe alcances ni dimensiones que no puede pedir", async () => {
      const agent = await loginAs(fx.users.agentIt.email);
      const { body } = await agent.get("/api/v1/reports/catalog").expect(200);

      expect(body.scopes.map((item: { id: string }) => item.id)).toEqual(["me"]);
      expect(body.maxScope).toBe("me");
      expect(body.canPickPerson).toBe(false);

      const dimensions = body.dimensions.map((item: { key: string }) => item.key);
      expect(dimensions).not.toContain("assignee");
      expect(dimensions).not.toContain("requester");
      expect(dimensions).not.toContain("availability");

      // "Sin asignar" o "incidentes detectados" hablan del área, no de una persona.
      const measures = body.measures.map((item: { key: string }) => item.key);
      expect(measures).not.toContain("unassigned");
      expect(measures).not.toContain("incidents_detected");
      expect(measures).toContain("resolved");

      // Sus plantillas son las personales; ninguna pide un área.
      expect(body.templates.every((item: { scope: string }) => item.scope === "me")).toBe(true);
    });

    it("el supervisor recibe su área, las personas y las plantillas de equipo", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent.get("/api/v1/reports/catalog").expect(200);

      expect(body.scopes.map((item: { id: string }) => item.id)).toEqual(["area", "user", "me"]);
      expect(body.canPickPerson).toBe(true);
      expect(body.dimensions.map((item: { key: string }) => item.key)).toContain("assignee");
      expect(body.templates.map((item: { templateId: string }) => item.templateId)).toContain(
        "team-performance",
      );
      // En el alcance de un área, agrupar por área daría una sola barra.
      expect(body.dimensions.map((item: { key: string }) => item.key)).not.toContain("area");
    });

    it("el administrador recibe la comparativa entre áreas", async () => {
      const agent = await loginAs(fx.users.admin.email);
      const { body } = await agent.get("/api/v1/reports/catalog").expect(200);
      expect(body.scopes[0].id).toBe("global");
      expect(body.templates.map((item: { templateId: string }) => item.templateId)).toContain(
        "areas-comparison",
      );
      expect(body.limits.maxWidgetsPerReport).toBe(12);
    });
  });

  // ── Medidas ─────────────────────────────────────────────────

  describe("medidas", () => {
    const hoursAgo = (hours: number): Date => new Date(Date.now() - hours * 3_600_000);

    beforeEach(async () => {
      // Dos creados hoy, uno resuelto hoy, uno de otra área y un duplicado fusionado.
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        priority: "high",
      });
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id],
        status: "resolved",
        resolvedAt: new Date(),
        resolvedByIds: [fx.users.agentIt.id],
        firstResponseAt: hoursAgo(1),
        firstResponderId: fx.users.agentIt.id,
        createdAt: hoursAgo(3),
      });
      await seedTicket({ areaId: fx.areas.ventas, requesterId: fx.users.employeeVentas.id });
      const duplicate = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
      });
      await Ticket.updateOne(
        { _id: duplicate._id },
        { $set: { status: "merged", mergedAt: new Date() } },
      );
    });

    it("cuenta lo creado en el área y deja fuera los duplicados fusionados", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .post("/api/v1/reports/query")
        .send({ scope: "area", period: "month", widget: widget({ measures: [{ key: "created" }] }) })
        .expect(200);

      // Dos del área: el fusionado no cuenta (spec §9) y el de Ventas no es suyo.
      expect(body.totals[0]).toBe(2);

      const merged = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "area",
          period: "month",
          widget: widget({ measures: [{ key: "merged_duplicates" }] }),
        })
        .expect(200);
      expect(merged.body.totals[0]).toBe(1);
    });

    it("mide cada medida sobre su propia ventana: creados y resueltos no son lo mismo", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "area",
          period: "month",
          widget: widget({
            chart: "area",
            measures: [{ key: "created" }, { key: "resolved" }],
            groupBy: "time",
            sort: "chronological",
          }),
        })
        .expect(200);

      expect(body.totals).toEqual([2, 1]);
    });

    it("agrupa por prioridad con las etiquetas resueltas", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "area",
          period: "month",
          widget: widget({ chart: "donut", measures: [{ key: "created" }], groupBy: "priority" }),
        })
        .expect(200);

      const labels = body.rows.map((row: { label: string }) => row.label);
      expect(labels).toContain("Alta");
      expect(labels).toContain("Media");
    });

    it("el tiempo de primera respuesta se cuenta en horas laborales", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "area",
          period: "month",
          widget: widget({ measures: [{ key: "first_response_time", aggregation: "avg" }] }),
        })
        .expect(200);

      // Dos horas de reloj, de las que solo cuentan las que caen en jornada: nunca
      // más de dos, y nunca negativas.
      const value = body.totals[0];
      expect(value).not.toBeNull();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(2);
    });

    it("una medida anclada en el historial se agrupa por su propia fecha", async () => {
      // "Cancelados" no tiene columna de fecha: su momento es el paso del historial. Si
      // el eje de tiempo intentara truncar el array entero, la consulta reventaría.
      const cancelled = await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        status: "cancelled",
      });
      const at = new Date();
      await Ticket.updateOne(
        { _id: cancelled._id },
        { $set: { statusHistory: [{ status: "cancelled", at, byId: fx.users.supIt.id }] } },
      );

      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "area",
          period: "month",
          widget: widget({
            chart: "line",
            measures: [{ key: "cancelled" }],
            groupBy: "time",
            sort: "chronological",
          }),
        })
        .expect(200);

      expect(body.totals[0]).toBe(1);
      expect(body.rows).toHaveLength(1);
    });

    it("lo que mide el ticket entero sobrevive a agrupar por responsable", async () => {
      // Agrupar por responsable parte el ticket en una fila por persona. Una medida que
      // pregunta "¿tenía dos o más responsables?" tiene que seguir viendo la lista
      // completa, no el responsable suelto de su fila.
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        assigneeIds: [fx.users.agentIt.id, fx.users.supIt.id],
      });

      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "area",
          period: "month",
          widget: widget({
            chart: "hbar",
            measures: [{ key: "multi_assignee_rate" }],
            groupBy: "assignee",
          }),
        })
        .expect(200);

      // La supervisora solo figura en ese ticket, así que el 100 % de lo suyo es
      // compartido. El agente, que además lleva otro en solitario, se queda en el 50 %:
      // si la medida contara el responsable de la fila en vez de la lista del ticket,
      // ambos saldrían a cero.
      const rowOf = (id: { toString(): string }) =>
        body.rows.find((row: { key: string }) => row.key === String(id)) as { values: number[] };
      expect(rowOf(fx.users.supIt.id).values[0]).toBe(100);
      expect(rowOf(fx.users.agentIt.id).values[0]).toBe(50);
    });

    it("un porcentaje sin denominador es «sin datos», no un cero", async () => {
      const agent = await loginAs(fx.users.supVentas.email);
      const { body } = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "area",
          period: "month",
          widget: widget({ measures: [{ key: "csat_response_rate" }] }),
        })
        .expect(200);
      expect(body.totals[0]).toBeNull();
    });

    it("la perspectiva del empleado cambia qué tickets se miden", async () => {
      const agent = await loginAs(fx.users.agentIt.email);

      const asAgent = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "me",
          period: "month",
          widget: widget({ perspective: "agent", measures: [{ key: "created" }] }),
        })
        .expect(200);
      // Como agente: el ticket que atendió. Como solicitante: ninguno, no pidió nada.
      expect(asAgent.body.totals[0]).toBe(1);

      const asRequester = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "me",
          period: "month",
          widget: widget({ perspective: "requester", measures: [{ key: "created" }] }),
        })
        .expect(200);
      expect(asRequester.body.totals[0]).toBeNull();
    });

    it("compara con el período anterior sin mezclar las dos ventanas", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "area",
          period: "day",
          widget: widget({
            measures: [{ key: "created" }],
            compareWith: { kind: "previous_period" },
          }),
        })
        .expect(200);

      expect(body.totals[0]).toBe(2);
      expect(body.comparison.label).toBe("Período anterior");
      // Ayer no se creó nada.
      expect(body.comparison.totals[0]).toBeNull();
    });
  });

  // ── Combinaciones imposibles ────────────────────────────────

  describe("validación de la gráfica", () => {
    it("una dona no agrupa por tiempo", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent.post("/api/v1/reports/query").send({
        scope: "area",
        widget: widget({ chart: "donut", groupBy: "time" }),
      });
      expect(response.status).toBe(422);
      expect(response.body.error.message).toMatch(/no puede agrupar por tiempo/i);
    });

    it("el radar solo admite medidas normalizables", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent.post("/api/v1/reports/query").send({
        scope: "area",
        widget: widget({
          chart: "radar",
          measures: [{ key: "created" }, { key: "resolved" }, { key: "closed" }],
        }),
      });
      expect(response.status).toBe(422);
      expect(response.body.error.message).toMatch(/normalizar/i);
    });

    it("una tarjeta KPI no lleva dimensión", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent
        .post("/api/v1/reports/query")
        .send({ scope: "area", widget: widget({ groupBy: "category" }) });
      expect(response.status).toBe(422);
    });

    it("dos medidas de unidades distintas no caben en la misma barra", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent.post("/api/v1/reports/query").send({
        scope: "area",
        widget: widget({
          chart: "bar",
          groupBy: "category",
          measures: [{ key: "created" }, { key: "sla_resolution_rate" }],
        }),
      });
      expect(response.status).toBe(422);
      expect(response.body.error.message).toMatch(/unidad/i);
    });

    it("el radar normaliza a 0–100 con «más lejos del centro» = mejor", async () => {
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        status: "resolved",
        resolvedAt: new Date(),
        resolvedByIds: [fx.users.agentIt.id],
        resolutionBreached: false,
        csat: { rating: 4, answeredAt: new Date() },
      });

      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .post("/api/v1/reports/query")
        .send({
          scope: "area",
          period: "month",
          widget: widget({
            chart: "radar",
            measures: [
              { key: "sla_resolution_rate" },
              { key: "csat_average" },
              { key: "reopen_rate" },
            ],
          }),
        })
        .expect(200);

      const [sla, csat, reopen] = body.rows[0].values;
      expect(sla).toBe(100);
      // CSAT 4 sobre 5 → 80 %.
      expect(csat).toBe(80);
      // Ninguna reapertura: 0 % se invierte a 100, porque reabrir es malo.
      expect(reopen).toBe(100);
    });
  });

  // ── Lista de tickets del período ────────────────────────────

  describe("lista de tickets del período", () => {
    beforeEach(async () => {
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        title: "Impresora atascada",
      });
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        status: "closed",
        title: "Cerrado hace tiempo",
      });
      await seedTicket({
        areaId: fx.areas.ventas,
        requesterId: fx.users.employeeVentas.id,
        title: "Cotización pendiente",
      });
    });

    it("el empleado ve todos los tickets de su área, incluidos los cerrados", async () => {
      const agent = await loginAs(fx.users.agentIt.email);
      const { body } = await agent.get("/api/v1/reports/tickets?scope=area").expect(200);

      // Su alcance de gráficas es "yo", pero la tabla es de su área (spec §7.8.9).
      expect(body.items).toHaveLength(2);
      expect(body.byStatus.closed).toBe(1);
      expect(body.items.every((row: { readable: boolean }) => row.readable)).toBe(true);
    });

    it("el supervisor de RRHH ve la ficha de otras áreas pero no su conversación", async () => {
      const agent = await loginAs(fx.users.supRrhh.email);
      const { body } = await agent.get("/api/v1/reports/tickets?scope=global").expect(200);

      expect(body.items).toHaveLength(3);
      const foreign = body.items.find(
        (row: { area: { name: string } }) => row.area.name === "IT y Sistemas",
      );
      expect(foreign.readable).toBe(false);
      const own = body.items.find(
        (row: { area: { name: string } }) => row.area.name === "Ventas",
      );
      expect(own.readable).toBe(true);
    });

    it("filtra por número escrito como se lee en pantalla", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const all = await agent.get("/api/v1/reports/tickets?scope=area").expect(200);
      const number = all.body.items[0].number;

      const byNumber = await agent
        .get(`/api/v1/reports/tickets?scope=area&numbers=TK-${String(number).padStart(6, "0")}`)
        .expect(200);
      expect(byNumber.body.total).toBe(1);
      expect(byNumber.body.items[0].number).toBe(number);
    });

    it("filtra por estado, texto y «sin calificar»", async () => {
      const agent = await loginAs(fx.users.supIt.email);

      const closed = await agent
        .get("/api/v1/reports/tickets?scope=area&statuses=closed")
        .expect(200);
      expect(closed.body.total).toBe(1);

      const text = await agent
        .get("/api/v1/reports/tickets?scope=area&q=impresora")
        .expect(200);
      expect(text.body.total).toBe(1);

      const noCsat = await agent
        .get("/api/v1/reports/tickets?scope=area&csatRatings=none")
        .expect(200);
      expect(noCsat.body.total).toBe(2);
    });

    it("el filtro de tiempo se mide en horas laborales, no de reloj", async () => {
      // Resuelto una hora después de crearse, dentro de la jornada.
      const start = new Date();
      start.setUTCHours(14, 0, 0, 0);
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        createdAt: start,
        status: "resolved",
        resolvedAt: new Date(start.getTime() + 3_600_000),
        resolvedByIds: [fx.users.agentIt.id],
      });

      const agent = await loginAs(fx.users.supIt.email);
      const slow = await agent
        .get("/api/v1/reports/tickets?scope=area&resolutionHoursOp=gt&resolutionHours=5")
        .expect(200);
      expect(slow.body.total).toBe(0);

      const fast = await agent
        .get("/api/v1/reports/tickets?scope=area&resolutionHoursOp=lt&resolutionHours=5")
        .expect(200);
      expect(fast.body.total).toBe(1);
    });

    it("solo envejece lo que sigue vivo: un cancelado no tiene antigüedad", async () => {
      await seedTicket({
        areaId: fx.areas.it,
        requesterId: fx.users.employeeIt.id,
        status: "cancelled",
        title: "Ya no hace falta",
        createdAt: new Date(Date.now() - 90 * 86_400_000),
      });

      const agent = await loginAs(fx.users.supIt.email);
      const { body } = await agent
        .get("/api/v1/reports/tickets?scope=area&period=year")
        .expect(200);
      const byTitle = (title: string) =>
        body.items.find((row: { title: string }) => row.title === title);

      expect(byTitle("Ya no hace falta").ageHours).toBeNull();
      expect(byTitle("Cerrado hace tiempo").ageHours).toBeNull();
      expect(byTitle("Impresora atascada").ageHours).not.toBeNull();
    });

    it("el CSV lleva las columnas elegidas y nunca el texto de la conversación", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent
        .get("/api/v1/reports/tickets/export?scope=area&columns=number,title,status")
        .expect(200);

      expect(response.headers["content-type"]).toMatch(/text\/csv/);
      const [header] = response.text.replace("﻿", "").split("\r\n");
      expect(header).toBe("ID,Título,Estado");
      expect(response.text).not.toContain("nadie tiene conexión");
    });
  });

  // ── Reportes guardados ──────────────────────────────────────

  describe("reportes guardados", () => {
    const body = () => ({
      title: "Mi reporte",
      scope: "area",
      period: "month",
      widgets: [widget()],
    });

    it("se crea, se lista, se duplica y se borra", async () => {
      const agent = await loginAs(fx.users.supIt.email);

      const created = await agent.post("/api/v1/reports").send(body()).expect(201);
      expect(created.body.title).toBe("Mi reporte");
      expect(created.body.scopeNarrowed).toBe(false);

      const list = await agent.get("/api/v1/reports").expect(200);
      expect(list.body.items).toHaveLength(1);

      const copy = await agent
        .post(`/api/v1/reports/${created.body.id}/duplicate`)
        .expect(201);
      expect(copy.body.title).toBe("Mi reporte (copia)");

      await agent
        .put(`/api/v1/reports/${created.body.id}`)
        .send({ title: "Renombrado" })
        .expect(200);
      expect((await agent.get(`/api/v1/reports/${created.body.id}`)).body.title).toBe("Renombrado");

      await agent.delete(`/api/v1/reports/${created.body.id}`).expect(204);
      expect((await agent.get("/api/v1/reports")).body.items).toHaveLength(1);
    });

    it("el reporte de otra persona no existe para quien pregunta", async () => {
      const owner = await loginAs(fx.users.supIt.email);
      const created = await owner.post("/api/v1/reports").send(body()).expect(201);

      const other = await loginAs(fx.users.supVentas.email);
      expect((await other.get(`/api/v1/reports/${created.body.id}`)).status).toBe(404);
      expect((await other.delete(`/api/v1/reports/${created.body.id}`)).status).toBe(404);
    });

    it("se revalida el alcance al abrirlo, no al guardarlo", async () => {
      const supervisor = await loginAs(fx.users.supIt.email);
      const created = await supervisor.post("/api/v1/reports").send(body()).expect(201);

      // Deja de ser supervisor: el reporte sigue existiendo, recortado a sus datos.
      await Report.updateOne({ _id: created.body.id }, { $set: { ownerId: fx.users.agentIt.id } });
      const employee = await loginAs(fx.users.agentIt.email);
      const reopened = await employee.get(`/api/v1/reports/${created.body.id}`).expect(200);

      expect(reopened.body.scope).toBe("area");
      expect(reopened.body.effectiveScope).toBe("me");
      expect(reopened.body.scopeNarrowed).toBe(true);
    });

    it("respeta el límite de reportes guardados que fija el administrador", async () => {
      await Settings.updateOne(
        { _id: SETTINGS_ID },
        { $set: { reportLimits: { ...DEFAULT_SETTINGS.reportLimits, maxSavedReports: 1 } } },
      );
      invalidateSettingsCache();

      const agent = await loginAs(fx.users.supIt.email);
      await agent.post("/api/v1/reports").send(body()).expect(201);
      const second = await agent.post("/api/v1/reports").send(body());
      expect(second.status).toBe(409);
      expect(second.body.error.message).toMatch(/límite/i);
    });

    it("no se guarda un reporte con una gráfica imposible", async () => {
      const agent = await loginAs(fx.users.supIt.email);
      const response = await agent
        .post("/api/v1/reports")
        .send({ ...body(), widgets: [widget({ chart: "donut", groupBy: "time" })] });
      expect(response.status).toBe(422);
    });
  });
});
