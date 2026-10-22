/**
 * Medición de rendimiento contra los umbrales del spec §13 (F8) y del plan del
 * módulo 2 (A7: lista < 2 s, reporte < 3 s).
 *
 *   npm run perf               10 000 tickets, 1 000 activos y 10 000 OT en `tekzaya_perf`
 *   PERF_TICKETS=20000 PERF_ASSETS=2000 PERF_WORK_ORDERS=20000 npm run perf
 *
 * 1. Siembra una base APARTE con la semilla de demostración y la lleva a N
 *    tickets clonando los sembrados con otras fechas, y a N activos y N órdenes
 *    clonando los equipos con su historia. La base de la demo no se toca.
 * 2. Levanta la API dentro de este mismo proceso y mide, por HTTP, lo mismo que
 *    pide cada pantalla: el tablero, la bandeja de tickets con sus pestañas, las
 *    gráficas de un reporte y las descargas CSV.
 * 3. Sale con código 1 si algo supera su umbral, para poder usarlo en CI.
 *
 * Mide el servidor (consulta + serialización + red local), no el pintado del
 * navegador: es la parte que crece con el número de tickets.
 */
import { spawnSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PERF_URI = process.env["PERF_MONGODB_URI"] ?? "mongodb://localhost:27017/tekzaya_perf";
const TARGET = Number(process.env["PERF_TICKETS"] ?? 10_000);
const TARGET_ASSETS = Number(process.env["PERF_ASSETS"] ?? 1_000);
const TARGET_WORK_ORDERS = Number(process.env["PERF_WORK_ORDERS"] ?? 10_000);
/** Repeticiones en caliente por medición; se informa la peor, no la media. */
const RUNS = 5;

// Antes de importar nada de la API: `config/env` lee el entorno al cargarse.
// `test` apaga los trabajos programados y el límite de intentos de login.
Object.assign(process.env, { MONGODB_URI: PERF_URI, NODE_ENV: "test", GEMINI_API_KEY: "" });

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// ── 1 · Datos ─────────────────────────────────────────────────

function seedBase(): void {
  console.log(`\n▸ Semilla de demostración en ${PERF_URI}`);
  const result = spawnSync("npx tsx src/seed/seed.ts", {
    cwd: apiDir,
    env: process.env,
    shell: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (result.status !== 0) throw new Error("La semilla falló");
}

const DAY_MS = 86_400_000;

/** Desplaza hacia atrás todas las fechas del documento, a cualquier profundidad. */
function shiftDates<T>(value: T, offsetMs: number): T {
  if (value instanceof Date) return new Date(value.getTime() - offsetMs) as T;
  if (Array.isArray(value)) return value.map((item) => shiftDates(item, offsetMs)) as T;
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, shiftDates(item, offsetMs)]),
    ) as T;
  }
  return value;
}

async function growTo(target: number): Promise<void> {
  const { default: mongoose, Types } = await import("mongoose");
  const { Ticket } = await import("../models/ticket.model");
  const { Message } = await import("../models/message.model");
  const { Counter } = await import("../models/counter.model");
  const { ACTIVE_TICKET_STATUSES } = await import("@tekzaya/shared");

  await mongoose.connect(PERF_URI);
  // Se clonan los sembrados salvo los fusionados y los del incidente: sus
  // referencias cruzadas no tienen sentido repetidas cien veces.
  const sources = await Ticket.find({
    status: { $ne: "merged" },
    mergedTicketIds: { $size: 0 },
    "ai.incident": { $exists: false },
  }).lean();
  const messages = await Message.find({ ticketId: { $in: sources.map((t) => t._id) } }).lean();
  const messagesOf = new Map<string, typeof messages>();
  for (const message of messages) {
    const key = String(message.ticketId);
    messagesOf.set(key, [...(messagesOf.get(key) ?? []), message]);
  }

  let number = await Ticket.countDocuments();
  const missing = target - number;
  console.log(`▸ Clonando ${missing.toLocaleString("es")} tickets a partir de ${sources.length}`);

  // Generador con semilla fija: dos ejecuciones producen los mismos datos.
  let state = 20261014;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };

  const BATCH = 1_000;
  for (let done = 0; done < missing; done += BATCH) {
    const tickets: Record<string, unknown>[] = [];
    const clonedMessages: Record<string, unknown>[] = [];

    for (let i = 0; i < Math.min(BATCH, missing - done); i++) {
      const source = sources[(done + i) % sources.length]!;
      const live = (ACTIVE_TICKET_STATUSES as readonly string[]).includes(source.status);
      // Lo cerrado se reparte en el último año, que es lo que recorren los
      // reportes; lo vivo se queda en los últimos diez días, como en una bandeja real.
      const offset = Math.floor(random() * (live ? 10 : 365) * DAY_MS);
      const { _id, ...rest } = source;
      const id = new Types.ObjectId();
      number += 1;

      tickets.push({ ...shiftDates(rest, offset), _id: id, number });
      for (const message of messagesOf.get(String(_id)) ?? []) {
        const { _id: _messageId, ...body } = message;
        clonedMessages.push({ ...shiftDates(body, offset), ticketId: id });
      }
    }

    await Ticket.insertMany(tickets, { ordered: false });
    await Message.insertMany(clonedMessages, { ordered: false });
    process.stdout.write(`\r  ${(done + tickets.length).toLocaleString("es")} / ${missing.toLocaleString("es")}`);
  }

  await Counter.updateOne({ _id: "ticket" }, { $set: { seq: number } }, { upsert: true });
  console.log(
    `\n  Total: ${(await Ticket.countDocuments()).toLocaleString("es")} tickets · ` +
      `${(await Message.countDocuments()).toLocaleString("es")} mensajes`,
  );
}

/**
 * Módulo 2: clona los equipos sembrados, cada uno con sus órdenes y su línea de
 * tiempo, hasta `targetAssets`; luego completa hasta `targetOrders` repitiendo
 * reparaciones terminadas (con sus pasos de falla y reparación) en otra fecha
 * del último año, sobre el mismo equipo. La historia de un equipo puede quedar
 * con paradas que se pisan: para medir el servidor da igual, porque MTBF y
 * disponibilidad recorren los mismos eventos estén como estén.
 */
async function growMaintenance(targetAssets: number, targetOrders: number): Promise<void> {
  const { Types } = await import("mongoose");
  const { Asset, AssetEvent, WorkOrder } = await import("../models/maintenance.models");
  const { Counter } = await import("../models/counter.model");

  const assets = await Asset.find().lean();
  const orders = await WorkOrder.find().lean();
  const events = await AssetEvent.find().lean();
  const ordersOf = groupBy(orders, (order) => String(order.assetId));
  const eventsOf = groupBy(events, (event) => String(event.assetId));

  let assetNumber = Math.max(0, ...assets.map((asset) => asset.number));
  let orderNumber = Math.max(0, ...orders.map((order) => order.number));
  const missingAssets = targetAssets - assets.length;
  console.log(`▸ Clonando ${Math.max(0, missingAssets).toLocaleString("es")} activos a partir de ${assets.length}`);

  for (let done = 0; done < missingAssets; done += 100) {
    const newAssets: Record<string, unknown>[] = [];
    const newOrders: Record<string, unknown>[] = [];
    const newEvents: Record<string, unknown>[] = [];
    for (let i = 0; i < Math.min(100, missingAssets - done); i++) {
      const source = assets[(done + i) % assets.length]!;
      const { _id, photoId: _photo, ...rest } = source;
      const assetId = new Types.ObjectId();
      assetNumber += 1;
      newAssets.push({ ...rest, _id: assetId, number: assetNumber });

      // Las órdenes clonadas no vuelven a su ticket: el ticket solo enlaza la original.
      const orderIds = new Map<string, InstanceType<typeof Types.ObjectId>>();
      for (const order of ordersOf.get(String(_id)) ?? []) {
        const { _id: orderId, ticketId: _ticket, ...body } = order;
        const id = new Types.ObjectId();
        orderIds.set(String(orderId), id);
        orderNumber += 1;
        newOrders.push({ ...body, _id: id, number: orderNumber, assetId });
      }
      for (const event of eventsOf.get(String(_id)) ?? []) {
        const { _id: _eventId, ticketId: _ticket, workOrderId, ...body } = event;
        const cloned = workOrderId ? orderIds.get(String(workOrderId)) : undefined;
        newEvents.push({ ...body, assetId, ...(cloned ? { workOrderId: cloned } : {}) });
      }
    }
    await Asset.collection.insertMany(newAssets, { ordered: false });
    if (newOrders.length) await WorkOrder.collection.insertMany(newOrders, { ordered: false });
    if (newEvents.length) await AssetEvent.collection.insertMany(newEvents, { ordered: false });
    process.stdout.write(`\r  ${(done + newAssets.length).toLocaleString("es")} / ${missingAssets.toLocaleString("es")}`);
  }

  // Reparaciones terminadas de todos los equipos, ya clonados, para repetirlas.
  const repairs = await WorkOrder.find({ type: "corrective", status: "completed", ticketId: { $exists: false } }).lean();
  const repairEvents = groupBy(
    await AssetEvent.find({ workOrderId: { $in: repairs.map((order) => order._id) } }).lean(),
    (event) => String(event.workOrderId),
  );
  const missingOrders = targetOrders - (await WorkOrder.countDocuments());
  console.log(`\n▸ Repitiendo ${Math.max(0, missingOrders).toLocaleString("es")} reparaciones a partir de ${repairs.length}`);

  // Generador con semilla fija: dos ejecuciones producen los mismos datos.
  let state = 20261022;
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  const yearAgo = Date.now() - 365 * DAY_MS;

  for (let done = 0; done < missingOrders; done += 1_000) {
    const newOrders: Record<string, unknown>[] = [];
    const newEvents: Record<string, unknown>[] = [];
    for (let i = 0; i < Math.min(1_000, missingOrders - done); i++) {
      const source = repairs[Math.floor(random() * repairs.length)]!;
      // Más atrás, pero sin salir del último año que recorren los reportes.
      const offset = Math.floor(random() * Math.max(0, source.createdAt.getTime() - yearAgo));
      const { _id, ...body } = source;
      const id = new Types.ObjectId();
      orderNumber += 1;
      newOrders.push({ ...shiftDates(body, offset), _id: id, number: orderNumber });
      for (const event of repairEvents.get(String(_id)) ?? []) {
        const { _id: _eventId, ...rest } = event;
        newEvents.push({ ...shiftDates(rest, offset), workOrderId: id });
      }
    }
    await WorkOrder.collection.insertMany(newOrders, { ordered: false });
    if (newEvents.length) await AssetEvent.collection.insertMany(newEvents, { ordered: false });
    process.stdout.write(`\r  ${(done + newOrders.length).toLocaleString("es")} / ${missingOrders.toLocaleString("es")}`);
  }

  await Counter.updateOne({ _id: "asset" }, { $set: { seq: assetNumber } }, { upsert: true });
  await Counter.updateOne({ _id: "work_order" }, { $set: { seq: orderNumber } }, { upsert: true });
  console.log(
    `\n  Total: ${(await Asset.countDocuments()).toLocaleString("es")} activos · ` +
      `${(await WorkOrder.countDocuments()).toLocaleString("es")} OT · ` +
      `${(await AssetEvent.countDocuments()).toLocaleString("es")} eventos`,
  );
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const group = map.get(key(item));
    if (group) group.push(item);
    else map.set(key(item), [item]);
  }
  return map;
}

// ── 2 · Medición ──────────────────────────────────────────────

interface Session {
  name: string;
  cookie: string;
}

interface Check {
  name: string;
  /** Umbral del spec §13, en milisegundos. */
  limitMs: number;
  run: () => Promise<unknown>;
}

async function main(): Promise<void> {
  seedBase();
  await growTo(TARGET);
  await growMaintenance(TARGET_ASSETS, TARGET_WORK_ORDERS);

  // La conexión de `growTo` sigue abierta y es la misma que usarán los modelos.
  const { createApp } = await import("../app");
  const { createServer } = await import("node:http");

  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${(server.address() as AddressInfo).port}/api/v1`;

  async function login(name: string, email: string): Promise<Session> {
    const response = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Tekzaya2026!" }),
    });
    if (!response.ok) throw new Error(`No se pudo iniciar sesión como ${email}`);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return { name, cookie };
  }

  async function call(session: Session, pathname: string, body?: unknown): Promise<number> {
    const response = await fetch(`${base}${pathname}`, {
      method: body ? "POST" : "GET",
      headers: { cookie: session.cookie, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`${pathname} → ${response.status}: ${text.slice(0, 200)}`);
    return text.length;
  }

  const admin = await login("administradora", "arisleyda.tejada@tekzaya.com");
  const supervisor = await login("supervisor", "daury.guzman@tekzaya.com");

  const widget = (partial: Record<string, unknown>) => ({
    id: "perf",
    title: "perf",
    filters: {},
    sort: "value_desc",
    showValues: true,
    showLegend: true,
    showTarget: false,
    layout: { w: 1 },
    ...partial,
  });
  const report = (partial: Record<string, unknown>) =>
    call(admin, "/reports/query", { scope: "global", period: "year", widget: widget(partial) });
  const maintenanceReport = (partial: Record<string, unknown>) =>
    call(admin, "/reports/query", {
      scope: "global",
      period: "year",
      widget: widget({ source: "maintenance", ...partial }),
    });

  /** Una pantalla pide varias cosas a la vez; cuenta lo que tarda la más lenta. */
  const screen = (...requests: (() => Promise<unknown>)[]) => () =>
    Promise.all(requests.map((request) => request()));

  const ticketTabs = (session: Session) =>
    ["unassigned", "assigned", "area", "mine", "settled", "all"].map(
      (scope) => () => call(session, `/tickets?scope=${scope}&limit=1`),
    );

  const checks: Check[] = [
    {
      name: "Tablero · todas las áreas, año (administradora)",
      limitMs: 2_000,
      run: screen(
        () => call(admin, "/stats/overview?scope=global&period=year"),
        () => call(admin, "/stats/availability?scope=global&period=year"),
        () => call(admin, "/tickets?scope=assigned&sort=sla&limit=3"),
        () => call(admin, "/tickets?scope=mine&sort=recent&limit=5"),
      ),
    },
    {
      name: "Tablero · mi área, año (supervisor)",
      limitMs: 2_000,
      run: screen(
        () => call(supervisor, "/stats/overview?scope=area&period=year"),
        () => call(supervisor, "/stats/availability?scope=area&period=year"),
        () => call(supervisor, "/tickets?scope=assigned&sort=sla&limit=3"),
        () => call(supervisor, "/tickets?scope=mine&sort=recent&limit=5"),
      ),
    },
    {
      name: "Tickets · Todos, orden por SLA, con pestañas",
      limitMs: 2_000,
      run: screen(() => call(admin, "/tickets?scope=all&sort=sla&limit=25"), ...ticketTabs(admin)),
    },
    {
      name: "Tickets · Todos, orden por solicitante",
      limitMs: 2_000,
      run: () => call(admin, "/tickets?scope=all&sort=requester&dir=asc&limit=25"),
    },
    {
      name: "Tickets · Todos, búsqueda por texto",
      limitMs: 2_000,
      run: () => call(admin, "/tickets?scope=all&q=impresora&limit=25"),
    },
    {
      name: "Tickets · Kanban de mi área (100 tarjetas)",
      limitMs: 2_000,
      run: screen(() => call(supervisor, "/tickets?scope=area&limit=100"), ...ticketTabs(supervisor)),
    },
    {
      name: "Gráfica · recibidos frente a resueltos por mes",
      limitMs: 3_000,
      run: () =>
        report({ chart: "line", measures: [{ key: "created" }, { key: "resolved" }], groupBy: "time" }),
    },
    {
      name: "Gráfica · 1.ª respuesta media por responsable",
      limitMs: 3_000,
      run: () =>
        report({
          chart: "bar",
          measures: [{ key: "first_response_time", aggregation: "avg" }],
          groupBy: "assignee",
        }),
    },
    {
      name: "Gráfica · cumplimiento de SLA por área y prioridad",
      limitMs: 3_000,
      run: () =>
        report({
          chart: "stacked",
          measures: [{ key: "sla_resolution_rate" }],
          groupBy: "area",
          splitBy: "priority",
        }),
    },
    {
      name: "Gráfica · mapa de calor día × hora",
      limitMs: 3_000,
      run: () =>
        report({ chart: "heatmap", measures: [{ key: "created" }], groupBy: "weekday_hour" }),
    },
    {
      name: "Gráfica · pendientes por estado, con período anterior",
      limitMs: 3_000,
      run: () =>
        report({
          chart: "bar",
          measures: [{ key: "backlog" }],
          groupBy: "status",
          compareWith: { kind: "previous_period" },
        }),
    },
    {
      name: "Lista del período · año, primera página",
      limitMs: 2_000,
      run: () => call(admin, "/reports/tickets?scope=global&period=year&limit=50"),
    },
    {
      name: "Lista del período · filtro en horas laborales",
      limitMs: 2_000,
      run: () =>
        call(
          admin,
          "/reports/tickets?scope=global&period=year&limit=50&resolutionHoursOp=gt&resolutionHours=8",
        ),
    },
    // ── Módulo 2 (plan A7) ─────────────────────────────────────
    {
      name: "Activos · inventario, primera página (supervisor)",
      limitMs: 2_000,
      run: () => call(supervisor, "/assets?limit=25"),
    },
    {
      name: "Activos · todas las áreas, búsqueda y filtro",
      limitMs: 2_000,
      run: () => call(admin, "/assets?q=impresora&status=operational,in_repair&sort=warranty&limit=25"),
    },
    {
      name: "Órdenes · lista de mi área",
      limitMs: 2_000,
      run: () => call(supervisor, "/work-orders?limit=25"),
    },
    {
      name: "Órdenes · kanban (100 abiertas)",
      limitMs: 2_000,
      run: () => call(admin, "/work-orders?status=pending,assigned,in_progress,on_hold&limit=100"),
    },
    {
      name: "Panel de mantenimiento · todas las áreas",
      limitMs: 2_000,
      run: () => call(admin, "/maintenance/dashboard"),
    },
    {
      name: "Gráfica · MTBF y MTTR por tipo de equipo",
      limitMs: 3_000,
      run: () =>
        maintenanceReport({ chart: "bar", measures: [{ key: "mtbf" }, { key: "mttr" }], groupBy: "asset_type" }),
    },
    {
      name: "Gráfica · disponibilidad por equipo",
      limitMs: 3_000,
      run: () => maintenanceReport({ chart: "bar", measures: [{ key: "availability" }], groupBy: "asset" }),
    },
    {
      name: "Gráfica · costo de mantenimiento por mes y área",
      limitMs: 3_000,
      run: () =>
        maintenanceReport({ chart: "stacked", measures: [{ key: "maintenance_cost" }], groupBy: "time", splitBy: "area" }),
    },
    {
      name: "Gráfica · equipos más caros de mantener",
      limitMs: 3_000,
      run: () => maintenanceReport({ chart: "bar", measures: [{ key: "maintenance_cost" }], groupBy: "asset" }),
    },
    {
      name: "Gráfica · cumplimiento de preventivos por mes",
      limitMs: 3_000,
      run: () => maintenanceReport({ chart: "line", measures: [{ key: "preventive_compliance" }], groupBy: "time" }),
    },
    {
      name: "CSV · inventario de activos, todo",
      limitMs: 5_000,
      run: () => call(admin, "/assets/export"),
    },
    {
      name: "CSV · lista del período, todo el año",
      limitMs: 5_000,
      run: () => call(admin, "/reports/tickets/export?scope=global&period=year"),
    },
    {
      name: "CSV · bandeja de tickets, Todos",
      limitMs: 5_000,
      run: () => call(admin, "/tickets/export?scope=all"),
    },
  ];

  console.log(`\n▸ Midiendo (${RUNS} repeticiones en caliente; se informa la peor)\n`);
  const rows: { name: string; cold: number; worst: number; median: number; limit: number }[] = [];

  for (const check of checks) {
    const timed = async () => {
      const start = performance.now();
      await check.run();
      return performance.now() - start;
    };
    // La primera vuelta es la de una pantalla recién abierta: caché de Mongo fría.
    const cold = await timed();
    const runs: number[] = [];
    for (let i = 0; i < RUNS; i++) runs.push(await timed());
    runs.sort((a, b) => a - b);
    const row = {
      name: check.name,
      cold,
      worst: runs[runs.length - 1]!,
      median: runs[Math.floor(runs.length / 2)]!,
      limit: check.limitMs,
    };
    rows.push(row);
    const ok = Math.max(row.cold, row.worst) < row.limit;
    console.log(
      `  ${ok ? "✓" : "✗"} ${row.name.padEnd(52)} ` +
        `fría ${fmt(row.cold)} · mediana ${fmt(row.median)} · peor ${fmt(row.worst)} · límite ${fmt(row.limit)}`,
    );
  }

  server.close();
  const { default: mongoose } = await import("mongoose");
  await mongoose.disconnect();

  const failed = rows.filter((row) => Math.max(row.cold, row.worst) >= row.limit);
  console.log(
    failed.length
      ? `\n✗ ${failed.length} de ${rows.length} mediciones superan su umbral`
      : `\n✓ Las ${rows.length} mediciones cumplen el §13 con ${TARGET.toLocaleString("es")} tickets, ` +
          `${TARGET_ASSETS.toLocaleString("es")} activos y ${TARGET_WORK_ORDERS.toLocaleString("es")} OT`,
  );
  process.exit(failed.length ? 1 : 0);
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

main().catch((error: unknown) => {
  console.error("\nLa medición falló:", error);
  process.exit(1);
});
