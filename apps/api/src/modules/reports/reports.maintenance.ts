import {
  businessClock,
  businessMinutesBetween,
  isAdmin,
  MEASURE_META,
  minutesInWindow,
  repairEpisodes,
  statusIntervals,
  wallClockIn,
  zonedTimeToUtc,
  type Actor,
  type AssetStatus,
  type AssetStatusChange,
  type BusinessCalendar,
  type DimensionKey,
  type MaintenanceMeasureKey,
  type ReportWidget,
  type StatsRange,
  type StatusInterval,
  type WidgetFilters,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Asset, AssetEvent, StockMovement, WorkOrder } from "../../models/maintenance.models";
import { todayKey } from "../assets/asset.view";
import { composeKey, type MeasureValues } from "./reports.measures";
import type { ResolvedScope } from "./reports.scope";

/**
 * Plan A6: la segunda fuente del constructor. Las medidas de mantenimiento no salen
 * de una sola colección —MTBF necesita el historial de estados del equipo, el costo
 * las órdenes y el consumo el libro de repuestos—, así que no se escriben como un
 * `$group` de Mongo sino como **hechos** que se agregan aquí:
 *
 *   un hecho = (fecha, equipo, orden?, repuesto?, técnico?) + numerador + denominador
 *
 * Cada medida produce sus hechos y la agregación es siempre la misma: Σ numerador,
 * o Σ numerador ÷ Σ denominador para las razones. Así un MTBF por tipo de equipo es
 * el tiempo operativo de todos los equipos del tipo entre todas sus fallas, no una
 * media de medias, que es la cuenta que cuadra a mano.
 *
 * Las horas son **laborables**, con el mismo motor que el SLA.
 */

type Bucket = "hour" | "day" | "week" | "month";

export interface MaintenanceContext {
  actor: Actor;
  scope: ResolvedScope;
  filters: WidgetFilters;
  range: StatsRange;
  calendar: BusinessCalendar;
  timezone: string;
  bucket: Bucket;
  now: Date;
}

interface LeanAssetRow {
  _id: Types.ObjectId;
  areaId: Types.ObjectId;
  type: string;
  location: string;
}

interface LeanOrderRow {
  _id: Types.ObjectId;
  type: "corrective" | "preventive";
  status: string;
  assetId: Types.ObjectId;
  areaId: Types.ObjectId;
  assigneeIds: Types.ObjectId[];
  scheduledFor?: string | null;
  costTotal: number;
  createdAt: Date;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
}

/** Lo que identifica un hecho para agruparlo. */
interface FactSubject {
  at: Date;
  asset: LeanAssetRow;
  order?: LeanOrderRow;
  partId?: string;
}

interface Accumulator {
  num: number;
  den: number;
}

const oid = (value: string) => new Types.ObjectId(value);
const OPEN = ["pending", "assigned", "in_progress", "on_hold"] as const;
const isOpen = (status: string) => (OPEN as readonly string[]).includes(status);

// ── Permisos ──────────────────────────────────────────────────

/**
 * ¿Puede pedir gráficas de mantenimiento? El admin y la lectura global, sí; el
 * resto, si su área mantiene algún equipo. Un área que no mantiene nada no tiene
 * historia de mantenimiento que ver, y su gente no debe poder husmear la ajena.
 */
export async function canReportMaintenance(actor: Actor): Promise<boolean> {
  if (isAdmin(actor) || actor.hasGlobalReadAccess) return true;
  return Boolean(await Asset.exists({ areaId: oid(actor.areaId) }));
}

// ── Tiempo ────────────────────────────────────────────────────

/**
 * Inicio del tramo de la serie que contiene `instant`, en la zona de la empresa. Es
 * el mismo corte que `$dateTrunc` de Mongo (la semana empieza en domingo), así las
 * gráficas de tiempo de las dos fuentes comparten eje.
 */
export function truncate(instant: Date, bucket: Bucket, zone: string): Date {
  const clock = wallClockIn(instant, zone);
  switch (bucket) {
    case "hour":
      return zonedTimeToUtc(clock, clock.hour, 0, zone);
    case "day":
      return zonedTimeToUtc(clock, 0, 0, zone);
    case "week": {
      const weekday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay();
      const sunday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day - weekday));
      return zonedTimeToUtc(
        { year: sunday.getUTCFullYear(), month: sunday.getUTCMonth() + 1, day: sunday.getUTCDate() },
        0,
        0,
        zone,
      );
    }
    case "month":
      return zonedTimeToUtc({ ...clock, day: 1 }, 0, 0, zone);
  }
}

function nextBucket(start: Date, bucket: Bucket, zone: string): Date {
  const clock = wallClockIn(start, zone);
  switch (bucket) {
    case "hour":
      return new Date(start.getTime() + 3_600_000);
    case "day": {
      const next = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + 1));
      return zonedTimeToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }, 0, 0, zone);
    }
    case "week": {
      const next = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + 7));
      return zonedTimeToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }, 0, 0, zone);
    }
    case "month": {
      const next = new Date(Date.UTC(clock.year, clock.month, 1));
      return zonedTimeToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: 1 }, 0, 0, zone);
    }
  }
}

interface Window {
  from: Date;
  to: Date;
}

/** Tramos de la serie dentro del período; sin eje de tiempo, el período entero. */
function windowsOf(from: Date, to: Date, ctx: MaintenanceContext, byTime: boolean): Window[] {
  if (!byTime) return [{ from, to }];
  const windows: Window[] = [];
  let start = truncate(from, ctx.bucket, ctx.timezone);
  while (start < to) {
    const end = nextBucket(start, ctx.bucket, ctx.timezone);
    windows.push({ from: new Date(Math.max(start.getTime(), from.getTime())), to: new Date(Math.min(end.getTime(), to.getTime())) });
    start = end;
  }
  return windows;
}

const dateKey = (instant: Date, zone: string) => todayKey(zone, instant);

// ── Datos ─────────────────────────────────────────────────────

interface Dataset {
  assets: Map<string, LeanAssetRow>;
  orders: LeanOrderRow[];
  ordersById: Map<string, LeanOrderRow>;
  /** Historial de estados por equipo, en orden. */
  changes: Map<string, AssetStatusChange[]>;
  movements: { partId: Types.ObjectId; qty: number; at: Date; workOrderId: Types.ObjectId }[];
}

/**
 * El techo de lo que se lee: el área del alcance (o la del filtro, que el alcance ya
 * validó), y en el alcance personal, las órdenes de esa persona.
 */
function areaOf(ctx: MaintenanceContext): Types.ObjectId | undefined {
  if (ctx.filters.areaId) return oid(ctx.filters.areaId);
  if (ctx.scope.scope === "area") return oid(ctx.scope.areaId!);
  return undefined;
}

function personOf(ctx: MaintenanceContext): Types.ObjectId | undefined {
  return ctx.scope.scope === "me" || ctx.scope.scope === "user" ? oid(ctx.scope.userId!) : undefined;
}

async function load(ctx: MaintenanceContext, from: Date, to: Date, keys: readonly MaintenanceMeasureKey[]): Promise<Dataset> {
  const areaId = areaOf(ctx);
  const userId = personOf(ctx);
  const assetFilter: Record<string, unknown> = {
    createdAt: { $lt: to },
    ...(areaId ? { areaId } : {}),
    ...(ctx.filters.assetTypes?.length ? { type: { $in: ctx.filters.assetTypes } } : {}),
  };
  const assets = (await Asset.find(assetFilter).select("areaId type location").lean()) as LeanAssetRow[];
  const assetIds = assets.map((asset) => asset._id);

  // La disponibilidad y el MTTR salen solo del historial del equipo.
  const needsOrders = keys.some((key) => key !== "availability" && key !== "mttr");
  const fromKey = dateKey(from, ctx.timezone);
  const orders = needsOrders
    ? ((await WorkOrder.find({
        assetId: { $in: assetIds },
        ...(areaId ? { areaId } : {}),
        ...(userId ? { assigneeIds: userId } : {}),
        ...(ctx.filters.workOrderType ? { type: ctx.filters.workOrderType } : {}),
        createdAt: { $lt: to },
        // Solo lo que puede tocar el período: lo creado, cerrado o programado dentro,
        // y lo que sigue abierto.
        $or: [
          { createdAt: { $gte: from } },
          { completedAt: { $gte: from } },
          { cancelledAt: { $gte: from } },
          { scheduledFor: { $gte: fromKey } },
          { status: { $in: [...OPEN] } },
        ],
      })
        .select("type status assetId areaId assigneeIds scheduledFor costTotal createdAt completedAt cancelledAt")
        .lean()) as LeanOrderRow[])
    : [];

  const changes = new Map<string, AssetStatusChange[]>();
  if (keys.some((key) => key === "mtbf" || key === "mttr" || key === "availability")) {
    const events = await AssetEvent.find({
      assetId: { $in: assetIds },
      kind: { $in: ["created", "status_changed", "retired"] },
      at: { $lt: to },
    })
      .select("assetId kind at data")
      .sort({ at: 1, _id: 1 })
      .lean();
    for (const event of events) {
      const status: AssetStatus | undefined =
        event.kind === "created"
          ? "operational"
          : event.kind === "retired"
            ? "retired"
            : ((event.data as { to?: AssetStatus } | undefined)?.to ?? undefined);
      if (!status) continue;
      const list = changes.get(String(event.assetId)) ?? [];
      list.push({ status, at: event.at });
      changes.set(String(event.assetId), list);
    }
  }

  const ordersById = new Map(orders.map((order) => [String(order._id), order]));
  let movements: Dataset["movements"] = [];
  if (keys.includes("parts_consumed")) {
    const rows = await StockMovement.find({
      kind: { $in: ["consume", "return"] },
      workOrderId: { $exists: true },
      at: { $gte: from, $lt: to },
    })
      .select("partId qty at workOrderId")
      .lean();
    movements = rows.map((row) => ({ partId: row.partId, qty: row.qty, at: row.at, workOrderId: row.workOrderId! }));
    // Las órdenes de esos consumos pueden ser viejas: se leen aparte, con el mismo techo.
    const known = new Set(orders.map((order) => String(order._id)));
    const missing = [...new Set(movements.map((row) => String(row.workOrderId)))].filter((id) => !known.has(id));
    if (missing.length) {
      const extra = (await WorkOrder.find({
        _id: { $in: missing.map(oid) },
        assetId: { $in: assetIds },
        ...(areaId ? { areaId } : {}),
        ...(ctx.filters.workOrderType ? { type: ctx.filters.workOrderType } : {}),
      })
        .select("type status assetId areaId assigneeIds scheduledFor costTotal createdAt completedAt cancelledAt")
        .lean()) as LeanOrderRow[];
      // Solo sirven para saber de qué equipo y área fue el consumo: no cuentan como órdenes.
      for (const order of extra) ordersById.set(String(order._id), order);
    }
  }

  return {
    assets: new Map(assets.map((asset) => [String(asset._id), asset])),
    orders,
    ordersById,
    changes,
    movements,
  };
}

// ── Agrupación ────────────────────────────────────────────────

/** El valor de una dimensión para un hecho; varias claves si el hecho se reparte (técnicos). */
function dimensionValues(key: DimensionKey, subject: FactSubject, ctx: MaintenanceContext): string[] {
  switch (key) {
    case "time":
      return [truncate(subject.at, ctx.bucket, ctx.timezone).toISOString()];
    case "area":
      return [String(subject.order?.areaId ?? subject.asset.areaId)];
    case "asset":
      return [String(subject.asset._id)];
    case "asset_type":
      return [subject.asset.type];
    case "location":
      return [subject.asset.location];
    case "technician": {
      // Una orden con dos técnicos cuenta para cada uno, como un ticket con dos
      // responsables; sin ninguno, va a "Sin asignar".
      const ids = subject.order?.assigneeIds ?? [];
      return ids.length ? ids.map(String) : [""];
    }
    case "work_order_type":
      return [subject.order?.type ?? ""];
    case "spare_part":
      return [subject.partId ?? ""];
    default:
      return [""];
  }
}

class Aggregate {
  private readonly cells = new Map<string, Accumulator>();

  constructor(
    private readonly widget: Pick<ReportWidget, "groupBy" | "splitBy">,
    private readonly ctx: MaintenanceContext,
    private readonly grouped: boolean,
  ) {}

  add(subject: FactSubject, num: number, den = 0): void {
    for (const key of this.keysOf(subject)) {
      const cell = this.cells.get(key) ?? { num: 0, den: 0 };
      cell.num += num;
      cell.den += den;
      this.cells.set(key, cell);
    }
  }

  private keysOf(subject: FactSubject): string[] {
    if (!this.grouped || !this.widget.groupBy) return [""];
    const groups = dimensionValues(this.widget.groupBy, subject, this.ctx);
    if (!this.widget.splitBy) return groups;
    const splits = dimensionValues(this.widget.splitBy, subject, this.ctx);
    return groups.flatMap((group) => splits.map((split) => composeKey(group, split, true)));
  }

  values(finish: (cell: Accumulator) => number | null): MeasureValues {
    const values: MeasureValues = new Map();
    for (const [key, cell] of this.cells) values.set(key, finish(cell));
    return values;
  }
}

// ── Medidas ───────────────────────────────────────────────────

const inside = (instant: Date | null | undefined, from: Date, to: Date): instant is Date =>
  Boolean(instant) && instant!.getTime() >= from.getTime() && instant!.getTime() < to.getTime();

const ratio = (scale: number) => (cell: Accumulator) => (cell.den > 0 ? (cell.num / cell.den) * scale : null);
const sum = (cell: Accumulator) => cell.num;

/**
 * Mide una medida de mantenimiento. `grouped: false` da el total, sin dimensión, que
 * es lo que se vuelve a medir para la fila de totales: no se suman filas.
 */
function measure(
  key: MaintenanceMeasureKey,
  data: Dataset,
  widget: Pick<ReportWidget, "groupBy" | "splitBy">,
  ctx: MaintenanceContext,
  from: Date,
  to: Date,
  grouped: boolean,
): MeasureValues {
  const agg = new Aggregate(widget, ctx, grouped);
  const assetOf = (order: LeanOrderRow) => data.assets.get(String(order.assetId));
  const orders = data.orders;

  switch (key) {
    case "wo_created":
    case "failures": {
      for (const order of orders) {
        if (!inside(order.createdAt, from, to)) continue;
        if (key === "failures" && (order.type !== "corrective" || order.status === "cancelled")) continue;
        const asset = assetOf(order);
        if (asset) agg.add({ at: order.createdAt, asset, order }, 1);
      }
      return agg.values(sum);
    }

    case "wo_completed":
    case "maintenance_cost": {
      for (const order of orders) {
        if (order.status !== "completed" || !inside(order.completedAt, from, to)) continue;
        const asset = assetOf(order);
        if (asset) agg.add({ at: order.completedAt, asset, order }, key === "wo_completed" ? 1 : order.costTotal);
      }
      // El costo se guarda en centavos; la gráfica lo lee en unidades de la moneda.
      return agg.values(key === "maintenance_cost" ? (cell) => cell.num / 100 : sum);
    }

    case "wo_open": {
      // Abiertas al cierre del período: creadas antes y sin completar ni cancelar antes.
      for (const order of orders) {
        if (order.createdAt.getTime() >= to.getTime()) continue;
        const closedAt = order.completedAt ?? order.cancelledAt;
        if (closedAt && closedAt.getTime() < to.getTime()) continue;
        if (!closedAt && !isOpen(order.status)) continue;
        const asset = assetOf(order);
        if (asset) agg.add({ at: to, asset, order }, 1);
      }
      return agg.values(sum);
    }

    case "preventive_compliance": {
      // Programados en el período, sin los cancelados ni los que todavía no tocan:
      // un preventivo de mañana sin hacer no es un incumplimiento.
      const fromKey = dateKey(from, ctx.timezone);
      const toKey = dateKey(new Date(to.getTime() - 1), ctx.timezone);
      const today = dateKey(ctx.now, ctx.timezone);
      for (const order of orders) {
        if (order.type !== "preventive" || !order.scheduledFor || order.status === "cancelled") continue;
        if (order.scheduledFor < fromKey || order.scheduledFor > toKey) continue;
        const done = order.status === "completed" && order.completedAt;
        if (!done && order.scheduledFor >= today) continue;
        const onTime = done ? dateKey(order.completedAt!, ctx.timezone) <= order.scheduledFor : false;
        const asset = assetOf(order);
        const [year, month, day] = order.scheduledFor.split("-").map(Number) as [number, number, number];
        const at = zonedTimeToUtc({ year, month, day }, 12, 0, ctx.timezone);
        if (asset) agg.add({ at, asset, order }, onTime ? 1 : 0, 1);
      }
      return agg.values(ratio(100));
    }

    case "parts_consumed": {
      for (const movement of data.movements) {
        const order = data.ordersById.get(String(movement.workOrderId));
        const asset = order ? assetOf(order) : undefined;
        if (!order || !asset) continue;
        // El consumo sale con signo negativo y la devolución entra con positivo.
        agg.add({ at: movement.at, asset, order, partId: String(movement.partId) }, -movement.qty);
      }
      return agg.values(sum);
    }

    case "mtbf":
    case "mttr":
    case "availability":
      return reliability(key, data, agg, widget, ctx, from, to, grouped);
  }
}

function reliability(
  key: "mtbf" | "mttr" | "availability",
  data: Dataset,
  agg: Aggregate,
  widget: Pick<ReportWidget, "groupBy" | "splitBy">,
  ctx: MaintenanceContext,
  from: Date,
  to: Date,
  grouped: boolean,
): MeasureValues {
  const until = new Date(Math.min(to.getTime(), ctx.now.getTime()));
  const clock = businessClock(ctx.calendar, from, until);
  const byTime = grouped && (widget.groupBy === "time" || widget.splitBy === "time");
  const windows = windowsOf(from, until, ctx, byTime);

  const intervalsOf = new Map<string, StatusInterval[]>();
  for (const [assetId, changes] of data.changes) intervalsOf.set(assetId, statusIntervals(changes, until));

  for (const asset of data.assets.values()) {
    const intervals = intervalsOf.get(String(asset._id)) ?? [];
    if (!intervals.length) continue;

    if (key === "mttr") {
      // Cada reparación cuenta entera en el tramo en que terminó.
      for (const episode of repairEpisodes(intervals)) {
        if (!inside(episode.to, from, until)) continue;
        const minutes = businessMinutesBetween(episode.from, episode.to, ctx.calendar);
        agg.add({ at: episode.to, asset }, minutes, 1);
      }
      continue;
    }

    for (const window of windows) {
      const operational = minutesInWindow(intervals, "operational", window.from, window.to, clock);
      if (key === "availability") {
        const repair = minutesInWindow(intervals, "in_repair", window.from, window.to, clock);
        if (operational + repair > 0) agg.add({ at: window.from, asset }, operational, operational + repair);
      } else if (operational > 0) {
        agg.add({ at: window.from, asset }, operational, 0);
      }
    }
  }

  if (key === "mtbf") {
    // Las fallas son las correctivas del período (las canceladas no), en su fecha.
    for (const order of data.orders) {
      if (order.type !== "corrective" || order.status === "cancelled") continue;
      if (!inside(order.createdAt, from, until)) continue;
      const asset = data.assets.get(String(order.assetId));
      if (asset) agg.add({ at: order.createdAt, asset }, 0, 1);
    }
    return agg.values((cell) => (cell.den > 0 ? cell.num / 60 / cell.den : null));
  }
  if (key === "mttr") return agg.values((cell) => (cell.den > 0 ? cell.num / 60 / cell.den : null));
  return agg.values(ratio(100));
}

/**
 * Las medidas de una gráfica de mantenimiento, en el mismo orden. Se leen los datos
 * una vez para todas: son las mismas órdenes y el mismo historial.
 */
export async function evaluateMaintenance(
  widget: ReportWidget,
  ctx: MaintenanceContext,
  grouped: boolean,
): Promise<MeasureValues[]> {
  const personal = ctx.scope.scope === "me" || ctx.scope.scope === "user";
  const keys = widget.measures.map((item) => item.key as MaintenanceMeasureKey);
  if (personal) {
    const areaOnly = keys.find((key) => MEASURE_META[key].areaOnly);
    if (areaOnly) {
      throw new AppError(403, "forbidden", `«${MEASURE_META[areaOnly].label}» se mide para un área, no para una persona`);
    }
  }
  const from = new Date(ctx.range.from);
  const to = new Date(ctx.range.to);
  const data = await load(ctx, from, to, keys);
  return keys.map((key) => measure(key, data, widget, ctx, from, to, grouped));
}
