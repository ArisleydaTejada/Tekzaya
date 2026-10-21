import type { ReportQueryResult, ReportWidget } from "@tekzaya/shared";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Asset, AssetEvent, WorkOrder } from "../../models/maintenance.models";
import { connect, disconnect, loginAs, resetDatabase, type Fixture } from "../../test/fixtures";

/**
 * Plan A6, DoD: *MTBF, MTTR y disponibilidad de un activo cuadran con un cálculo
 * escrito aparte, y un empleado que manipula el alcance recibe 403.*
 *
 * La cuenta a mano, en la jornada por defecto (08:00–18:00 de La Paz, lunes a
 * viernes), del lunes 2 al martes 10 de marzo de 2026:
 *
 *   Impresora A: entra el lunes 2 a las 08:00, falla el viernes 6 a las 17:00 y
 *   vuelve a funcionar el lunes 9 a las 09:00.
 *     operativa: lun–jue 40 h + vie 08–17 9 h + lun 09–18 9 h + mar 10 h = 68 h
 *     parada:    vie 17–18 1 h + lun 08–09 1 h                            =  2 h
 *   Impresora B: entra el lunes 2 a las 08:00 y no falla: 7 jornadas       = 70 h
 *
 *   MTBF del área   = (68 + 70) h ÷ 1 falla        = 138 h
 *   MTTR            = 2 h ÷ 1 reparación          =   2 h
 *   Disponibilidad  = 138 ÷ (138 + 2)              = 98,571… %
 */
const at = (iso: string) => new Date(`${iso}-04:00`);

let fixture: Fixture;
let printerA: Types.ObjectId;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
  printerA = new Types.ObjectId();
  const printerB = new Types.ObjectId();
  const base = { type: "printer", location: "Piso 2", areaId: fixture.areas.it, createdAt: at("2026-03-02T08:00:00"), updatedAt: new Date() };
  // Las fechas son de marzo: se insertan tal cual, sin que mongoose ponga las de hoy.
  await Asset.collection.insertMany([
    { _id: printerA, number: 1, name: "Impresora A", status: "operational", ...base },
    { _id: printerB, number: 2, name: "Impresora B", status: "operational", ...base },
  ]);
  const failure = new Types.ObjectId();
  await AssetEvent.collection.insertMany([
    { assetId: printerA, kind: "created", at: at("2026-03-02T08:00:00"), data: {} },
    { assetId: printerB, kind: "created", at: at("2026-03-02T08:00:00"), data: {} },
    { assetId: printerA, kind: "failure", at: at("2026-03-06T17:00:00"), workOrderId: failure, data: {} },
    { assetId: printerA, kind: "status_changed", at: at("2026-03-06T17:00:00"), data: { from: "operational", to: "in_repair" } },
    { assetId: printerA, kind: "status_changed", at: at("2026-03-09T09:00:00"), data: { from: "in_repair", to: "operational" } },
  ]);
  const order = {
    areaId: fixture.areas.it,
    assigneeIds: [new Types.ObjectId(fixture.users.agentIt.id)],
    checklist: [],
    partsUsed: [],
    externalCosts: [],
    statusHistory: [],
    updatedAt: new Date(),
  };
  await WorkOrder.collection.insertMany([
    {
      ...order,
      _id: failure,
      number: 1,
      type: "corrective",
      title: "No imprime",
      assetId: printerA,
      status: "completed",
      outOfService: true,
      costTotal: 12345,
      createdAt: at("2026-03-06T17:00:00"),
      completedAt: at("2026-03-09T09:00:00"),
    },
    // Dos preventivos programados en el período: uno a tiempo y otro un día tarde.
    {
      ...order,
      number: 2,
      type: "preventive",
      title: "Limpieza",
      assetId: printerA,
      status: "completed",
      outOfService: false,
      costTotal: 0,
      scheduledFor: "2026-03-03",
      createdAt: at("2026-03-02T09:00:00"),
      completedAt: at("2026-03-03T15:00:00"),
    },
    {
      ...order,
      number: 3,
      type: "preventive",
      title: "Limpieza",
      assetId: printerB,
      status: "completed",
      outOfService: false,
      costTotal: 0,
      scheduledFor: "2026-03-04",
      createdAt: at("2026-03-02T09:00:00"),
      completedAt: at("2026-03-05T10:00:00"),
    },
  ]);
});

function widget(partial: Partial<ReportWidget> = {}): ReportWidget {
  return {
    id: "w1",
    title: "Prueba",
    source: "maintenance",
    chart: "kpi",
    measures: [{ key: "availability" }],
    filters: {},
    sort: "value_desc",
    showValues: true,
    showLegend: true,
    showTarget: false,
    layout: { w: 1 },
    ...partial,
  };
}

const RANGE = { period: "range", from: "2026-03-02", to: "2026-03-10" } as const;

async function query(user: keyof Fixture["users"], body: Record<string, unknown>) {
  const agent = await loginAs(fixture.users[user].email);
  return agent.post("/api/v1/reports/query").send(body);
}

describe("fuente de mantenimiento (plan A6)", () => {
  it("MTBF, MTTR y disponibilidad cuadran con la cuenta a mano, en horas laborables", async () => {
    const response = await query("supIt", {
      scope: "area",
      ...RANGE,
      widget: widget({ chart: "table", measures: [{ key: "mtbf" }, { key: "mttr" }, { key: "availability" }] }),
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const result = response.body as ReportQueryResult;
    const [mtbf, mttr, availability] = result.rows[0]!.values;
    expect(mtbf).toBeCloseTo(138, 6);
    expect(mttr).toBeCloseTo(2, 6);
    expect(availability).toBeCloseTo((138 / 140) * 100, 6);
  });

  it("por equipo, cada uno con su propio historial", async () => {
    const response = await query("supIt", {
      scope: "area",
      ...RANGE,
      widget: widget({ chart: "table", measures: [{ key: "availability" }, { key: "mtbf" }], groupBy: "asset" }),
    });
    const rows = (response.body as ReportQueryResult).rows;
    const a = rows.find((row) => row.label === "Impresora A")!;
    const b = rows.find((row) => row.label === "Impresora B")!;
    expect(a.values[0]).toBeCloseTo((68 / 70) * 100, 6);
    expect(a.values[1]).toBeCloseTo(68, 6);
    expect(b.values[0]).toBe(100);
    // Sin fallas no hay media entre fallas.
    expect(b.values[1]).toBeNull();
  });

  it("costo, órdenes y cumplimiento de preventivos", async () => {
    const response = await query("supIt", {
      scope: "area",
      ...RANGE,
      widget: widget({
        chart: "table",
        measures: [{ key: "maintenance_cost" }, { key: "wo_created" }, { key: "preventive_compliance" }],
      }),
    });
    const result = response.body as ReportQueryResult;
    expect(result.currency).toBe("USD");
    expect(result.rows[0]!.values).toEqual([123.45, 3, 50]);
  });

  it("por tipo de orden, el costo es del correctivo", async () => {
    const response = await query("supIt", {
      scope: "area",
      ...RANGE,
      widget: widget({ chart: "bar", measures: [{ key: "wo_completed" }], groupBy: "work_order_type" }),
    });
    const rows = (response.body as ReportQueryResult).rows;
    expect(Object.fromEntries(rows.map((row) => [row.label, row.values[0]]))).toEqual({ Correctiva: 1, Preventiva: 2 });
  });

  it("un empleado que pide el área recibe 403; un área que no mantiene equipos, también", async () => {
    const employee = await query("employeeVentas", { scope: "area", ...RANGE, widget: widget() });
    expect(employee.status).toBe(403);
    const otherArea = await query("supVentas", { scope: "area", ...RANGE, widget: widget() });
    expect(otherArea.status).toBe(403);
    // Un supervisor de IT no lee el área de Ventas pidiéndola en el filtro.
    const filter = await query("supIt", { scope: "area", ...RANGE, widget: widget({ filters: { areaId: String(fixture.areas.ventas) } }) });
    expect(filter.status).toBe(403);
  });

  it("en el alcance personal, lo suyo sí y lo del área no", async () => {
    const mine = await query("agentIt", {
      scope: "me",
      ...RANGE,
      widget: widget({ measures: [{ key: "wo_completed" }] }),
    });
    expect(mine.status).toBe(200);
    expect((mine.body as ReportQueryResult).totals[0]).toBe(3);
    const reliability = await query("agentIt", { scope: "me", ...RANGE, widget: widget({ measures: [{ key: "mtbf" }] }) });
    expect(reliability.status).toBe(403);
  });

  it("los widgets guardados sin fuente siguen siendo de tickets", async () => {
    const { source: _source, ...old } = widget({ measures: [{ key: "created" }] });
    const response = await query("supIt", { scope: "area", period: "month", widget: old });
    expect(response.status).toBe(200);
  });

  it("el catálogo ofrece mantenimiento solo a quien mantiene equipos", async () => {
    const it_ = await (await loginAs(fixture.users.supIt.email)).get("/api/v1/reports/catalog");
    const sales = await (await loginAs(fixture.users.supVentas.email)).get("/api/v1/reports/catalog");
    const sources = (body: { measures: { source: string }[] }) => new Set(body.measures.map((item) => item.source));
    expect(sources(it_.body)).toEqual(new Set(["tickets", "maintenance"]));
    expect(sources(sales.body)).toEqual(new Set(["tickets"]));
    expect(it_.body.templates.map((item: { templateId: string }) => item.templateId)).toContain("availability-by-type");
    expect(sales.body.templates.map((item: { templateId: string }) => item.templateId)).not.toContain("availability-by-type");
  });
});
