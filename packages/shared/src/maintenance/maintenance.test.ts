import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, settings } from "../settings";
import type { BusinessCalendar } from "../sla/businessTime";
import { weightedAverageCost, workOrderCost } from "./cost";
import { downtimeMinutes } from "./downtime";
import { amountInputFromCents, centsFromAmountInput, formatAmountInput, formatMoney, toCents } from "./money";
import { formatAssetNumber, formatSparePartNumber, formatWorkOrderNumber } from "./numbers";
import { maintenancePlan } from "./schemas";

const calendar: BusinessCalendar = {
  hours: { days: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", timezone: "America/La_Paz" },
  holidays: [],
};
/** La Paz es UTC-4 todo el año: 08:00 locales son las 12:00 UTC. */
const at = (iso: string) => new Date(`${iso}-04:00`);

describe("costo de una orden de trabajo", () => {
  it("cuadra a mano: horas × tarifa + repuestos + externos", () => {
    const cost = workOrderCost({
      timeEntries: [
        { minutes: 90, rate: 2500 }, // 1,5 h a 25,00 = 37,50
        { minutes: 30, rate: 2500 }, // 0,5 h a 25,00 = 12,50
      ],
      partsUsed: [{ qty: 2, unitCost: 1899 }], // 37,98
      externalCosts: [{ amount: 12000 }], // 120,00
    });
    expect(cost).toEqual({ labor: 5000, parts: 3798, external: 12000, total: 20798 });
  });

  it("redondea una sola vez, no línea por línea", () => {
    // 3 entradas de 1 min a 10 centavos/h = 0,5 centavos; por línea serían 0+0+0.
    const cost = workOrderCost({
      timeEntries: [1, 1, 1].map((minutes) => ({ minutes, rate: 10 })),
      partsUsed: [],
      externalCosts: [],
    });
    expect(cost.labor).toBe(1);
  });

  it("una orden vacía cuesta cero", () => {
    expect(workOrderCost({ timeEntries: [], partsUsed: [], externalCosts: [] }).total).toBe(0);
  });
});

describe("costo promedio ponderado", () => {
  it("10 a 2,00 más 10 a 3,00 dan 2,50", () => {
    expect(weightedAverageCost(10, 200, 10, 300)).toBe(250);
  });

  it("sin stock, el costo es el de la entrada", () => {
    expect(weightedAverageCost(0, 999, 5, 400)).toBe(400);
  });
});

describe("tiempo de parada", () => {
  it("cuenta solo horas laborables: viernes 17:00 → lunes 09:00 son 2 h", () => {
    const changes = [
      { status: "operational" as const, at: at("2026-10-01T09:00:00") },
      { status: "in_repair" as const, at: at("2026-10-16T17:00:00") }, // viernes
      { status: "operational" as const, at: at("2026-10-19T09:00:00") }, // lunes
    ];
    const minutes = downtimeMinutes(changes, at("2026-10-01T00:00:00"), at("2026-10-31T00:00:00"), calendar);
    expect(minutes).toBe(120);
  });

  it("recorta al período pedido y cuenta una reparación que sigue abierta", () => {
    const changes = [
      { status: "operational" as const, at: at("2026-10-01T09:00:00") },
      { status: "in_repair" as const, at: at("2026-10-14T08:00:00") }, // miércoles
    ];
    // Desde el jueves 08:00 hasta el jueves 12:00: 4 h de las que lleva parado.
    const minutes = downtimeMinutes(changes, at("2026-10-15T08:00:00"), at("2026-10-15T12:00:00"), calendar);
    expect(minutes).toBe(240);
  });

  it("sin pasar por reparación, la parada es cero", () => {
    const changes = [{ status: "operational" as const, at: at("2026-10-01T09:00:00") }];
    expect(downtimeMinutes(changes, at("2026-10-01T00:00:00"), at("2026-10-31T00:00:00"), calendar)).toBe(0);
  });
});

describe("dinero", () => {
  it("convierte lo escrito a centavos sin coma flotante", () => {
    expect(toCents("12.5")).toBe(1250);
    expect(toCents("0,10")).toBe(10);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(() => toCents("12.345")).toThrow();
  });

  it("el campo de monto solo admite cifras y agrupa los miles al escribir", () => {
    expect(formatAmountInput("1129")).toBe("1,129");
    expect(formatAmountInput("1234567.891")).toBe("1,234,567.89");
    expect(formatAmountInput("abc12x3")).toBe("123");
    expect(formatAmountInput("$1,200.50")).toBe("1,200.50");
    expect(formatAmountInput("1.2.3")).toBe("1.23");
    expect(formatAmountInput(".5")).toBe("0.5");
    expect(formatAmountInput("007")).toBe("7");
    expect(formatAmountInput("")).toBe("");
    expect(amountInputFromCents(112_900)).toBe("1,129.00");
    expect(centsFromAmountInput("1,129.50")).toBe(112_950);
  });

  it("formatea en la moneda configurada", () => {
    expect(formatMoney(123456, "USD")).toMatch(/1,234\.56/);
  });
});

describe("números legibles", () => {
  it("ACT, OT y REP con cuatro cifras", () => {
    expect(formatAssetNumber(7)).toBe("ACT-0007");
    expect(formatWorkOrderNumber(150)).toBe("OT-0150");
    expect(formatSparePartNumber(25)).toBe("REP-0025");
  });
});

describe("contratos", () => {
  it("los ajustes por defecto validan, con dólares como moneda", () => {
    expect(settings.parse(DEFAULT_SETTINGS).maintenance.currency).toBe("USD");
  });

  it("un plan es de un activo o de un tipo, no de ambos ni de ninguno", () => {
    const plan = {
      id: "0".repeat(24),
      title: "Limpieza",
      areaId: "1".repeat(24),
      checklist: [],
      every: 3,
      unit: "month",
      mode: "from_last",
      startsOn: "2026-01-01",
      nextDueAt: "2026-04-01",
      leadDays: 7,
      isActive: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(maintenancePlan.safeParse({ ...plan, assetId: "2".repeat(24) }).success).toBe(true);
    expect(maintenancePlan.safeParse({ ...plan, assetType: "printer" }).success).toBe(true);
    expect(maintenancePlan.safeParse(plan).success).toBe(false);
    expect(
      maintenancePlan.safeParse({ ...plan, assetId: "2".repeat(24), assetType: "printer" }).success,
    ).toBe(false);
  });
});
