import {
  costRange,
  DEFAULT_SETTINGS,
  type RepairEstimateResponse,
  type ReplacementAdviceResponse,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { nextNumber } from "../../models/counter.model";
import { Asset, WorkOrder } from "../../models/maintenance.models";
import { Settings, SETTINGS_ID } from "../../models/support.models";
import { connect, disconnect, loginAs, resetDatabase, type Fixture } from "../../test/fixtures";
import { invalidateSettingsCache } from "../settings/settings.service";
import { clearCache } from "./ai.cache";
import { DisabledAiProvider, setAiProvider, type AiProvider, type AiRequest } from "./ai.provider";

/**
 * Plan A7: ¿reparar o reemplazar? y la estimación del costo de una reparación.
 * Gemini no se llama nunca de verdad: un proveedor de mentira contesta lo que se
 * le diga y guarda lo que se le pidió, para comprobar cuándo se gasta cuota.
 */

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
  clearCache();
  setAiProvider(new DisabledAiProvider());
});

class StubAiProvider implements AiProvider {
  readonly configured = true;
  readonly requests: AiRequest[] = [];

  constructor(private readonly reply: { json?: unknown; text?: string | null } = {}) {}

  async json<T extends z.ZodType>(request: AiRequest & { schema: T }) {
    this.requests.push(request);
    // Se valida igual que en producción: si la respuesta no cumple, es `null`.
    const parsed = request.schema.safeParse(this.reply.json);
    return parsed.success ? parsed.data : null;
  }

  async text(request: AiRequest) {
    this.requests.push(request);
    return this.reply.text ?? null;
  }
}

function useStub(reply: ConstructorParameters<typeof StubAiProvider>[0]): StubAiProvider {
  const stub = new StubAiProvider(reply);
  setAiProvider(stub);
  return stub;
}

const DAY = 86_400_000;
const EXPLANATION =
  "El equipo vuelve a fallar poco después de cada reparación y el problema es siempre el mismo. " +
  "Seguir cambiándole piezas ya cuesta más de lo que vale: conviene reemplazarlo.";

async function seedAsset(fields: Record<string, unknown> = {}) {
  return Asset.create({
    name: "Impresora de Ventas",
    type: "printer",
    location: "Piso 1",
    status: "operational",
    areaId: fixture.areas.it,
    usedByAreaId: fixture.areas.ventas,
    purchaseDate: "2024-01-15",
    purchaseCost: 120_000,
    number: await nextNumber("asset"),
    ...fields,
  });
}

/** Correctivas con su fecha y su costo: se insertan tal cual para fijar `createdAt`. */
async function seedOrders(
  assetId: Types.ObjectId,
  orders: { daysAgo: number; cost?: number; status?: string; title?: string; type?: string }[],
) {
  const docs = await Promise.all(
    orders.map(async ({ daysAgo, cost = 0, status = "completed", title = "Atasco de papel", type = "corrective" }) => ({
      _id: new Types.ObjectId(),
      number: await nextNumber("work_order"),
      type,
      title,
      description: "Se atasca casi en cada impresión.",
      assetId,
      areaId: fixture.areas.it,
      status,
      assigneeIds: [],
      outOfService: false,
      checklist: [],
      partsUsed: [],
      externalCosts: [],
      statusHistory: [],
      costTotal: cost,
      createdAt: new Date(Date.now() - daysAgo * DAY),
      updatedAt: new Date(),
      ...(status === "completed"
        ? { completedAt: new Date(Date.now() - daysAgo * DAY + 3_600_000), completionNotes: "Rodillos reemplazados." }
        : {}),
    })),
  );
  await WorkOrder.collection.insertMany(docs);
  return docs;
}

async function turnOff(feature: "replacementAdvice" | "repairEstimate") {
  await Settings.updateOne({ _id: SETTINGS_ID }, { $set: { [`aiEnabled.${feature}`]: false } });
  invalidateSettingsCache();
}

const replacementOf = async (email: string, assetId: unknown) =>
  (await loginAs(email)).get(`/api/v1/ai/assets/${String(assetId)}/replacement`);

const estimateOf = async (email: string, orderId: unknown) =>
  (await loginAs(email)).post(`/api/v1/ai/work-orders/${String(orderId)}/estimate`);

// ─────────────────────────────────────────────────────────────

describe("sin clave de Gemini, el módulo 2 funciona entero (DoD de A7)", () => {
  it("la interfaz sabe que no hay IA y las dos funciones contestan «no hay nada», nunca un error", async () => {
    const asset = await seedAsset();
    await seedOrders(asset._id, [{ daysAgo: 5, cost: 50_000 }, { daysAgo: 30, cost: 30_000 }, { daysAgo: 60 }]);
    const [open] = await seedOrders(asset._id, [{ daysAgo: 0, status: "in_progress" }]);

    const status = await (await loginAs(fixture.users.supIt.email)).get("/api/v1/ai/status");
    expect(status.body).toMatchObject({ configured: false, enabled: { replacementAdvice: true, repairEstimate: true } });

    const advice = await replacementOf(fixture.users.supIt.email, asset._id);
    expect(advice.status).toBe(200);
    expect((advice.body as ReplacementAdviceResponse).advice).toBeNull();

    const estimate = await estimateOf(fixture.users.agentIt.email, open!._id);
    expect(estimate.status).toBe(200);
    expect(estimate.body).toEqual({ estimate: null, reason: null });
  });

  it("una base guardada antes de A7 trae los interruptores nuevos encendidos", async () => {
    const { replacementAdvice: _a, repairEstimate: _b, ...before } = DEFAULT_SETTINGS.aiEnabled;
    await Settings.updateOne({ _id: SETTINGS_ID }, { $set: { aiEnabled: before } });
    invalidateSettingsCache();
    const admin = await loginAs(fixture.users.admin.email);
    expect((await admin.get("/api/v1/settings")).body.aiEnabled).toEqual(DEFAULT_SETTINGS.aiEnabled);
  });
});

describe("¿reparar o reemplazar? (plan A7)", () => {
  it("fallas repetidas: los números los calcula el código y la IA solo redacta", async () => {
    const asset = await seedAsset();
    await seedOrders(asset._id, [
      { daysAgo: 5, cost: 40_000 },
      { daysAgo: 30, cost: 25_000 },
      { daysAgo: 60, cost: 10_000 },
      { daysAgo: 200, cost: 5_000 },
      // Ni la cancelada es una falla, ni la abierta suma costo todavía.
      { daysAgo: 10, cost: 99_999, status: "cancelled" },
      { daysAgo: 1, cost: 7_000, status: "in_progress" },
    ]);
    const stub = useStub({ text: EXPLANATION });

    const response = await replacementOf(fixture.users.supIt.email, asset._id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const { advice } = response.body as ReplacementAdviceResponse;
    expect(advice).toMatchObject({
      reasons: ["repeated_failures", "repair_cost"],
      failuresInWindow: 4,
      windowDays: 90,
      failureThreshold: 3,
      failuresTotal: 5,
      // 400,00 + 250,00 + 100,00 + 50,00 = 800,00 de 1.200,00 de compra.
      repairCost: 80_000,
      purchaseCost: 120_000,
      currency: "USD",
      explanation: EXPLANATION,
    });
    expect(advice!.repairShare).toBeCloseTo(2 / 3);

    // La IA recibió el historial en palabras y las cifras que muestra la tarjeta.
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]!.data).toContain("Atasco de papel");
    expect(stub.requests[0]!.data).toMatch(/Fallas en los últimos 90 días: 4/);

    // Abrir la ficha otra vez no gasta cuota: la explicación está en caché.
    await replacementOf(fixture.users.agentIt.email, asset._id);
    expect(stub.requests).toHaveLength(1);

    // Una falla nueva cambia el historial: se vuelve a explicar.
    await seedOrders(asset._id, [{ daysAgo: 0, cost: 1_000 }]);
    await replacementOf(fixture.users.supIt.email, asset._id);
    expect(stub.requests).toHaveLength(2);
  });

  it("reparaciones que pasan de la mitad del precio, sin fallas repetidas", async () => {
    const asset = await seedAsset({ purchaseCost: 10_000 });
    await seedOrders(asset._id, [{ daysAgo: 300, cost: 6_000 }]);
    useStub({ text: EXPLANATION });

    const { advice } = (await replacementOf(fixture.users.supIt.email, asset._id)).body as ReplacementAdviceResponse;
    expect(advice).toMatchObject({ reasons: ["repair_cost"], failuresInWindow: 0, repairCost: 6_000, repairShare: 0.6 });
  });

  it("un equipo que no es candidato no gasta cuota", async () => {
    const asset = await seedAsset();
    await seedOrders(asset._id, [{ daysAgo: 5, cost: 1_000 }, { daysAgo: 40, cost: 1_000 }]);
    const stub = useStub({ text: EXPLANATION });

    const { advice } = (await replacementOf(fixture.users.supIt.email, asset._id)).body as ReplacementAdviceResponse;
    expect(advice).toBeNull();
    expect(stub.requests).toHaveLength(0);
  });

  it("si la explicación cita una cifra que no le dimos, se descarta; los números quedan", async () => {
    const asset = await seedAsset();
    await seedOrders(asset._id, [{ daysAgo: 5 }, { daysAgo: 30 }, { daysAgo: 60 }]);
    useStub({ text: "Uno nuevo cuesta unos 850 USD, así que conviene reemplazarlo." });

    const { advice } = (await replacementOf(fixture.users.supIt.email, asset._id)).body as ReplacementAdviceResponse;
    expect(advice).toMatchObject({ reasons: ["repeated_failures"], failuresInWindow: 3, explanation: null });
  });

  it("dado de baja o con la función apagada, no hay sugerencia", async () => {
    const retired = await seedAsset({ status: "retired" });
    await seedOrders(retired._id, [{ daysAgo: 5 }, { daysAgo: 30 }, { daysAgo: 60 }]);
    const active = await seedAsset({ name: "Otra" });
    await seedOrders(active._id, [{ daysAgo: 5 }, { daysAgo: 30 }, { daysAgo: 60 }]);
    const stub = useStub({ text: EXPLANATION });

    expect((await replacementOf(fixture.users.supIt.email, retired._id)).body.advice).toBeNull();
    await turnOff("replacementAdvice");
    expect((await replacementOf(fixture.users.supIt.email, active._id)).body.advice).toBeNull();
    expect(stub.requests).toHaveLength(0);
  });

  it("es del área: el empleado que usa el equipo recibe 403; RRHH y el admin la leen", async () => {
    const asset = await seedAsset();
    await seedOrders(asset._id, [{ daysAgo: 5 }, { daysAgo: 30 }, { daysAgo: 60 }]);
    useStub({ text: EXPLANATION });

    expect((await replacementOf(fixture.users.employeeVentas.email, asset._id)).status).toBe(403);
    expect((await replacementOf(fixture.users.supRrhh.email, asset._id)).body.advice).not.toBeNull();
    expect((await replacementOf(fixture.users.admin.email, asset._id)).body.advice).not.toBeNull();
    // Un equipo que ni usa ni mantiene no existe para él.
    const other = await seedAsset({ name: "Servidor", usedByAreaId: null });
    expect((await replacementOf(fixture.users.employeeVentas.email, other._id)).status).toBe(404);
  });
});

describe("estimación del costo de una reparación (plan A7)", () => {
  /** Cinco reparaciones de impresoras, de la más reciente (1) a la más vieja (5). */
  async function history() {
    const printer = await seedAsset();
    const other = await seedAsset({ name: "Impresora de Finanzas" });
    const past = [
      ...(await seedOrders(printer._id, [{ daysAgo: 10, cost: 12_000, title: "Atasco de papel constante" }])),
      ...(await seedOrders(other._id, [{ daysAgo: 20, cost: 4_000, title: "Se atasca el papel" }])),
      ...(await seedOrders(printer._id, [{ daysAgo: 30, cost: 8_550, title: "Rodillos gastados" }])),
      ...(await seedOrders(other._id, [{ daysAgo: 40, cost: 30_000, title: "Error de fusor" }])),
      ...(await seedOrders(printer._id, [{ daysAgo: 50, cost: 6_000, title: "Atasco al imprimir doble cara" }])),
    ];
    // Ni un preventivo ni una laptop dicen cuánto cuesta reparar una impresora.
    await seedOrders(printer._id, [{ daysAgo: 15, cost: 1_000, type: "preventive", title: "Limpieza" }]);
    const laptop = await seedAsset({ name: "Laptop", type: "laptop" });
    await seedOrders(laptop._id, [{ daysAgo: 15, cost: 99_000, title: "Atasco de papel" }]);

    const [open] = await seedOrders(printer._id, [{ daysAgo: 0, status: "in_progress", title: "Se atasca el papel otra vez" }]);
    return { open: open!, past };
  }

  it("el rango sale de las órdenes que eligió la IA, con su número y su costo", async () => {
    const { open, past } = await history();
    const stub = useStub({ json: { similar: [1, 2, 5, 2] } });

    const response = await estimateOf(fixture.users.agentIt.email, open._id);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const { estimate, reason } = response.body as RepairEstimateResponse;
    expect(reason).toBeNull();
    // 1, 2 y 5 de la lista: 120,00 · 40,00 · 60,00 → P25 50,00, mediana 60,00, P75 90,00.
    expect(estimate).toMatchObject({ low: 5_000, median: 6_000, high: 9_000, poolSize: 5, currency: "USD" });
    expect(costRange([12_000, 4_000, 6_000])).toEqual({ low: 5_000, median: 6_000, high: 9_000 });
    expect(estimate!.cases.map((item) => item.number)).toEqual([past[0]!.number, past[1]!.number, past[4]!.number]);
    expect(estimate!.cases[1]).toMatchObject({ assetName: "Impresora de Finanzas", cost: 4_000 });

    // A la IA solo le llegan títulos y descripciones numerados, nunca un costo.
    expect(stub.requests).toHaveLength(1);
    expect(stub.requests[0]!.instruction).toContain("1. Atasco de papel constante");
    expect(stub.requests[0]!.instruction).not.toContain("Limpieza");
    expect(stub.requests[0]!.instruction).not.toMatch(/120|12000/);

    // Pedirla otra vez no gasta cuota.
    await estimateOf(fixture.users.supIt.email, open._id);
    expect(stub.requests).toHaveLength(1);
  });

  it("con menos de tres casos parecidos no se muestra estimación", async () => {
    const { open } = await history();
    useStub({ json: { similar: [1, 3] } });
    expect((await estimateOf(fixture.users.agentIt.email, open._id)).body).toEqual({ estimate: null, reason: "not_enough_similar" });
  });

  it("un número que no está en la lista no vale: no hay estimación", async () => {
    const { open } = await history();
    useStub({ json: { similar: [1, 2, 9] } });
    expect((await estimateOf(fixture.users.agentIt.email, open._id)).body).toEqual({ estimate: null, reason: "no_answer" });
  });

  it("sin historial suficiente ni se pregunta", async () => {
    const asset = await seedAsset();
    await seedOrders(asset._id, [{ daysAgo: 10, cost: 1_000 }, { daysAgo: 20, cost: 2_000 }]);
    const [open] = await seedOrders(asset._id, [{ daysAgo: 0, status: "pending" }]);
    const stub = useStub({ json: { similar: [1, 2] } });

    expect((await estimateOf(fixture.users.agentIt.email, open!._id)).body).toEqual({ estimate: null, reason: "not_enough_history" });
    expect(stub.requests).toHaveLength(0);
  });

  it("solo una correctiva abierta; y es de quien ve la orden", async () => {
    const { open, past } = await history();
    const [preventive] = await seedOrders(open.assetId, [{ daysAgo: 0, status: "pending", type: "preventive" }]);
    useStub({ json: { similar: [1, 2, 3] } });

    expect((await estimateOf(fixture.users.agentIt.email, past[0]!._id)).status).toBe(409);
    expect((await estimateOf(fixture.users.agentIt.email, preventive!._id)).status).toBe(409);
    expect((await estimateOf(fixture.users.employeeVentas.email, open._id)).status).toBe(404);
    expect((await estimateOf(fixture.users.supVentas.email, open._id)).status).toBe(404);

    await turnOff("repairEstimate");
    expect((await estimateOf(fixture.users.agentIt.email, open._id)).body).toEqual({ estimate: null, reason: null });
  });
});
