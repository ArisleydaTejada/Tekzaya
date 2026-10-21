import {
  addBusinessMinutes,
  addPeriod,
  DEFAULT_MAINTENANCE_SETTINGS,
  formatAssetNumber,
  formatSparePartNumber,
  formatWorkOrderNumber,
  hourlyServiceAmount,
  nextFixedDue,
  PART_UNIT_LABEL,
  wallClockIn,
  weightedAverageCost,
  workOrderCost,
  zonedTimeToUtc,
  type AssetEventKind,
  type AssetStatus,
  type AssetType,
  type BusinessCalendar,
  type BusinessHours,
  type ExternalPricing,
  type PartUnit,
  type WorkOrderHoldReason,
  type WorkOrderStatus,
  type WorkOrderType,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { Area } from "../models/area.model";
import { Counter } from "../models/counter.model";
import {
  Asset,
  AssetEvent,
  clearMaintenanceData,
  MaintenancePlan,
  SparePart,
  StockMovement,
  WorkOrder,
} from "../models/maintenance.models";
import { Notification, Settings, SETTINGS_ID } from "../models/support.models";
import { User } from "../models/user.model";
import {
  AREA_LOCATION,
  FAILURE_RATE,
  FAILURES,
  FIXED_ASSETS,
  IT_AREA,
  LAPTOP_MODELS,
  MAINT_AREA,
  OUT_OF_SERVICE_RATE,
  PARTS,
  PLANS,
  REPEATED_FAILURE_ASSET,
  RETIRED_ASSETS,
  type AssetModel,
} from "./maintenance-catalog";
import { createRandom } from "./random";

/**
 * Semilla del módulo 2 (plan A0): ~60 activos de IT y Mantenimiento con **12 meses
 * de historial** —sin él, MTBF y disponibilidad saldrían vacíos—, ~150 órdenes de
 * trabajo, 25 repuestos (dos bajo mínimo), 8 planes preventivos (uno vencido) y un
 * equipo con fallas repetidas para la demo de IA.
 *
 * Lee las áreas y personas que ya existen y solo vacía las colecciones del módulo
 * 2, así que puede correr sobre una base con el módulo 1 en uso sin tocarlo. Usa
 * su propio generador aleatorio: añadirla no cambia ni un ticket de la semilla 1.
 */

const DAY_MS = 86_400_000;
const HISTORY_DAYS = 365;

const MAINTENANCE_NOTIFICATIONS = [
  "work_order_assigned",
  "preventive_due",
  "preventive_overdue",
  "low_stock",
  "warranty_expiring",
  "repeated_failures",
];

const VENDORS: Partial<Record<AssetType, string>> = {
  printer: "Servicio Técnico Canon",
  air_conditioner: "ClimaFrío Servicios",
  vehicle: "Taller Automotriz Hermanos Pérez",
  generator: "Energía y Plantas del Norte",
  electrical: "Electro Servicios del Norte",
  server: "Dell ProSupport",
};

export interface MaintenanceSeedSummary {
  assets: number;
  retired: number;
  inRepair: number;
  workOrders: number;
  workOrdersByStatus: Record<string, number>;
  correctives: number;
  preventives: number;
  parts: number;
  lowStock: string[];
  plans: number;
  overduePlans: string[];
  repeatedFailure: { name: string; last90Days: number; repairCost: number; purchaseCost: number };
}

interface Person {
  _id: Types.ObjectId;
  name: string;
  areaId: Types.ObjectId;
  role: string;
  isAreaSupervisor: boolean;
  away: boolean;
}

interface SeedAsset {
  _id: Types.ObjectId;
  name: string;
  type: AssetType;
  brand: string;
  model: string;
  serial: string;
  areaId: Types.ObjectId;
  areaName: string;
  usedByAreaId?: Types.ObjectId;
  custodianId?: Types.ObjectId;
  location: string;
  purchaseDate: string;
  purchaseCost: number;
  warrantyUntil: string;
  createdAt: Date;
  retiredAt?: Date;
  retiredReason?: string;
}

interface PartUse {
  partId: Types.ObjectId;
  qty: number;
  unitCost: number;
  at: Date;
}

interface SeedWorkOrder {
  _id: Types.ObjectId;
  type: WorkOrderType;
  title: string;
  description: string;
  asset: SeedAsset;
  planId?: Types.ObjectId;
  status: WorkOrderStatus;
  holdReason?: WorkOrderHoldReason;
  assigneeIds: Types.ObjectId[];
  scheduledFor?: string;
  outOfService: boolean;
  checklist: { label: string; done: boolean }[];
  partsUsed: (PartUse & { _id: Types.ObjectId })[];
  requiredParts?: { _id: Types.ObjectId; partId: Types.ObjectId; qty: number }[];
  externalCosts: {
    _id: Types.ObjectId;
    vendor: string;
    description: string;
    pricing: ExternalPricing;
    minutes?: number;
    hourlyRate?: number;
    amount: number;
    at: Date;
  }[];
  completionNotes?: string;
  createdById: Types.ObjectId;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  statusHistory: { status: WorkOrderStatus; at: Date; byId: Types.ObjectId }[];
}

interface SeedEvent {
  assetId: Types.ObjectId;
  kind: AssetEventKind;
  at: Date;
  actorId?: Types.ObjectId;
  workOrderId?: Types.ObjectId;
  data: Record<string, unknown>;
}

export async function seedMaintenance(now: Date): Promise<MaintenanceSeedSummary> {
  const random = createRandom(20261017);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const randomInt = (min: number, max: number) => Math.floor(random() * (max - min + 1)) + min;
  const chance = (p: number) => random() < p;

  // ── Contexto: lo que ya sembró (o usa) el módulo 1 ────────────
  const settingsDoc = await Settings.findById(SETTINGS_ID).lean();
  if (!settingsDoc) throw new Error("No hay ajustes: ejecuta primero npm run seed.");
  const hours = settingsDoc.businessHours as BusinessHours;
  const calendar: BusinessCalendar = { hours, holidays: settingsDoc.holidays ?? [] };
  const zone = hours.timezone;

  const areas = await Area.find().select("name").lean();
  const areaByName = new Map(areas.map((area) => [area.name!, area._id]));
  const itId = areaByName.get(IT_AREA);
  const maintId = areaByName.get(MAINT_AREA);
  if (!itId || !maintId) {
    throw new Error(`La semilla de mantenimiento necesita las áreas «${IT_AREA}» y «${MAINT_AREA}».`);
  }
  const areaName = (id: Types.ObjectId) => areas.find((area) => area._id.equals(id))?.name ?? "";

  const people: Person[] = (
    await User.find({ status: "active" }).select("name areaId role isAreaSupervisor availability").lean()
  ).map((user) => ({
    _id: user._id,
    name: user.name!,
    areaId: user.areaId as Types.ObjectId,
    role: user.role!,
    isAreaSupervisor: user.isAreaSupervisor ?? false,
    away: user.availability?.state === "away",
  }));
  const membersOf = (areaId: Types.ObjectId) =>
    people.filter((person) => person.areaId.equals(areaId) && person.role !== "admin");
  const supervisorOf = (areaId: Types.ObjectId) =>
    membersOf(areaId).find((person) => person.isAreaSupervisor) ?? membersOf(areaId)[0]!;
  const technicians = (areaId: Types.ObjectId, onlyAvailable = false) =>
    membersOf(areaId).filter((person) => !onlyAvailable || !person.away);

  // ── Limpieza: solo lo del módulo 2 ───────────────────────────
  await clearMaintenanceData();
  // Con las colecciones vacías, poner los índices al día es instantáneo: una base
  // sembrada con un índice antiguo no rompe la siembra nueva.
  await Promise.all(
    [Asset, AssetEvent, WorkOrder, MaintenancePlan, SparePart, StockMovement].map((model) =>
      model.syncIndexes(),
    ),
  );
  await Counter.deleteMany({ _id: { $in: ["asset", "work_order", "spare_part"] } });
  await Notification.deleteMany({ type: { $in: MAINTENANCE_NOTIFICATIONS } });

  // Sin tarifa interna: las horas de los técnicos no tienen costo (plan A3).
  await Settings.updateOne({ _id: SETTINGS_ID }, { $set: { maintenance: DEFAULT_MAINTENANCE_SETTINGS } });

  // ── Fechas en la zona de la empresa ──────────────────────────
  const dayKey = (instant: Date) => {
    const clock = wallClockIn(instant, zone);
    return `${clock.year}-${String(clock.month).padStart(2, "0")}-${String(clock.day).padStart(2, "0")}`;
  };
  const parseKey = (key: string) => {
    const [year, month, day] = key.split("-").map(Number) as [number, number, number];
    return { year, month, day };
  };
  const addDays = (key: string, days: number) => {
    const { year, month, day } = parseKey(key);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  };
  const addMonths = (key: string, months: number) => {
    const { year, month, day } = parseKey(key);
    // Del 31 de enero más un mes sale el último de febrero, no el 3 de marzo.
    const target = new Date(Date.UTC(year, month - 1 + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target.toISOString().slice(0, 10);
  };
  const at = (key: string, hour: number, minute = 0) => zonedTimeToUtc(parseKey(key), hour, minute, zone);
  /** Un instante laborable: `minutes` de jornada después de `from`. */
  const worked = (from: Date, minutes: number) => addBusinessMinutes(from, minutes, calendar);

  const today = dayKey(now);
  const historyStart = new Date(now.getTime() - HISTORY_DAYS * DAY_MS);
  const serial = (brand: string) =>
    `${brand.slice(0, 3).toUpperCase()}${randomInt(100_000, 999_999)}${String.fromCharCode(65 + randomInt(0, 25))}`;

  // ── Activos ──────────────────────────────────────────────────
  const assets: SeedAsset[] = [];

  function addAsset(options: {
    model: AssetModel;
    name: string;
    areaId: Types.ObjectId;
    usedByAreaId?: Types.ObjectId | undefined;
    custodianId?: Types.ObjectId | undefined;
    location: string;
    ageMonths: number;
  }): SeedAsset {
    const { model } = options;
    const purchaseDate = addDays(addMonths(today, -options.ageMonths), -randomInt(0, 20));
    const asset: SeedAsset = {
      _id: new Types.ObjectId(),
      name: options.name,
      type: model.type,
      brand: model.brand,
      model: model.model,
      serial: serial(model.brand),
      areaId: options.areaId,
      areaName: areaName(options.areaId),
      ...(options.usedByAreaId && !options.usedByAreaId.equals(options.areaId)
        ? { usedByAreaId: options.usedByAreaId }
        : {}),
      ...(options.custodianId ? { custodianId: options.custodianId } : {}),
      location: options.location,
      purchaseDate,
      purchaseCost: model.cost,
      warrantyUntil: addMonths(purchaseDate, model.warrantyMonths),
      createdAt: worked(at(purchaseDate, 0), randomInt(60, 400)),
    };
    assets.push(asset);
    return asset;
  }

  // Una laptop por persona: la mantiene IT, la usa el área de quien la tiene.
  for (const [index, person] of people.entries()) {
    const model = LAPTOP_MODELS[index % LAPTOP_MODELS.length]!;
    addAsset({
      model,
      name: `Laptop de ${person.name}`,
      areaId: itId,
      usedByAreaId: person.areaId,
      custodianId: person._id,
      location: AREA_LOCATION[areaName(person.areaId)] ?? "Oficina",
      ageMonths: 6 + ((index * 7) % 40),
    });
  }
  for (const item of FIXED_ASSETS) {
    addAsset({
      model: item,
      name: item.name,
      areaId: areaByName.get(item.areaName)!,
      usedByAreaId: item.usedBy ? areaByName.get(item.usedBy) : undefined,
      location: item.location,
      ageMonths: item.ageMonths,
    });
  }
  for (const item of RETIRED_ASSETS) {
    const asset = addAsset({
      model: item,
      name: item.name,
      areaId: areaByName.get(item.areaName)!,
      usedByAreaId: item.usedBy ? areaByName.get(item.usedBy) : undefined,
      location: item.location,
      ageMonths: item.ageMonths,
    });
    asset.retiredAt = worked(at(addMonths(today, -item.retiredMonthsAgo), 0), randomInt(60, 400));
    asset.retiredReason = item.reason;
  }

  // Dos garantías a punto de vencer: el aviso de A6 necesita algo que avisar.
  for (const [name, days] of [
    ["Servidor de archivos", 18],
    ["Aire acondicionado · Cuarto de servidores", 26],
  ] as const) {
    const asset = assets.find((item) => item.name === name)!;
    const model = FIXED_ASSETS.find((item) => item.name === name)!;
    asset.warrantyUntil = addDays(today, days);
    asset.purchaseDate = addMonths(asset.warrantyUntil, -model.warrantyMonths);
    asset.createdAt = worked(at(asset.purchaseDate, 0), randomInt(60, 400));
  }

  const events: SeedEvent[] = [];
  for (const asset of assets) {
    const actor = supervisorOf(asset.areaId)._id;
    events.push({ assetId: asset._id, kind: "created", at: asset.createdAt, actorId: actor, data: { status: "operational" } });
  }

  // Algunos equipos cambiaron de sitio o de manos durante el año.
  const movable = assets.filter((asset) => !asset.retiredAt && asset.createdAt < historyStart);
  for (const asset of movable.filter((item) => item.type === "monitor" || item.type === "phone").slice(0, 3)) {
    const when = worked(new Date(now.getTime() - randomInt(60, 300) * DAY_MS), randomInt(30, 400));
    events.push({
      assetId: asset._id,
      kind: "moved",
      at: when,
      actorId: supervisorOf(asset.areaId)._id,
      data: { from: "Sótano · Almacén", to: asset.location },
    });
  }
  const handedOver = movable.find((asset) => asset.type === "laptop" && asset.custodianId);
  if (handedOver) {
    const previous = people.find((person) => person.areaId.equals(handedOver.usedByAreaId ?? itId) && !person._id.equals(handedOver.custodianId!));
    if (previous) {
      events.push({
        assetId: handedOver._id,
        kind: "custodian_changed",
        at: worked(new Date(now.getTime() - 120 * DAY_MS), 90),
        actorId: supervisorOf(itId)._id,
        data: { from: String(previous._id), to: String(handedOver.custodianId) },
      });
    }
  }

  // ── Repuestos (las existencias se calculan al final) ─────────
  const parts = PARTS.map((template) => ({
    ...template,
    _id: new Types.ObjectId(),
    areaId: areaByName.get(template.areaName)!,
  }));
  const partByName = new Map(parts.map((part) => [part.name, part]));

  // ── Órdenes de trabajo ───────────────────────────────────────
  const orders: SeedWorkOrder[] = [];
  /** Hasta cuándo está ocupado cada activo: dos averías no se solapan. */
  const busyUntil = new Map<string, Date>();

  function usePart(order: SeedWorkOrder, name: string, qty: number, when: Date) {
    const part = partByName.get(name);
    if (!part) return;
    order.partsUsed.push({ _id: new Types.ObjectId(), partId: part._id, qty, unitCost: 0, at: when });
  }

  /** Avería con su OT correctiva. `state` decide hasta dónde llegó. */
  function addCorrective(
    asset: SeedAsset,
    createdAt: Date,
    state: WorkOrderStatus,
    options: { expensive?: boolean } = {},
  ): SeedWorkOrder {
    const template = pick(FAILURES[asset.type] ?? FAILURES.laptop!);
    const area = asset.areaId;
    const available = technicians(area, state !== "completed");
    const assignee = pick(available.length ? available : technicians(area));
    const supervisor = supervisorOf(area);
    const opener = chance(0.5) ? assignee : supervisor;
    const outOfService = options.expensive ? true : chance(OUT_OF_SERVICE_RATE[asset.type]);

    const order: SeedWorkOrder = {
      _id: new Types.ObjectId(),
      type: "corrective",
      title: template.title,
      description: template.description,
      asset,
      status: state,
      assigneeIds: state === "pending" ? [] : [assignee._id],
      outOfService,
      checklist: [],
      partsUsed: [],
      externalCosts: [],
      createdById: opener._id,
      createdAt,
      statusHistory: [{ status: "pending", at: createdAt, byId: opener._id }],
    };

    events.push({
      assetId: asset._id,
      kind: "failure",
      at: createdAt,
      actorId: opener._id,
      workOrderId: order._id,
      data: { title: template.title },
    });
    if (outOfService) {
      events.push({
        assetId: asset._id,
        kind: "status_changed",
        at: createdAt,
        actorId: opener._id,
        workOrderId: order._id,
        data: { from: "operational", to: "in_repair" },
      });
    }

    // Las abiertas ya prevén sus piezas; la que espera repuesto pide más de lo que
    // suele haber. Sin azar: no mueve el resto de la semilla.
    if (state !== "completed" && state !== "cancelled") {
      const fitting = parts.filter((part) => part.fits.includes(asset.type));
      order.requiredParts = fitting.slice(0, state === "on_hold" ? 2 : 1).map((part, index) => ({
        _id: new Types.ObjectId(),
        partId: part._id,
        qty: part.unit === "liter" ? 4 : state === "on_hold" && index === 1 ? 6 : 1,
      }));
    }

    if (state === "pending") return order;
    // Lo que está en curso hoy no puede tener pasos en el futuro.
    const ceiling = state === "completed" ? Number.POSITIVE_INFINITY : now.getTime() - 30 * 60_000;
    const assignedAt = new Date(
      Math.max(createdAt.getTime(), Math.min(createdAt.getTime() + randomInt(5, 90) * 60_000, ceiling)),
    );
    order.statusHistory.push({ status: "assigned", at: assignedAt, byId: supervisor._id });
    if (state === "assigned") return order;

    const startedAt = new Date(
      Math.max(assignedAt.getTime(), Math.min(worked(assignedAt, randomInt(20, 360)).getTime(), ceiling)),
    );
    order.startedAt = startedAt;
    order.statusHistory.push({ status: "in_progress", at: startedAt, byId: assignee._id });

    if (state === "in_progress" || state === "on_hold") {
      const until = new Date(Math.min(now.getTime() - 3_600_000, worked(startedAt, 120).getTime()));
      if (state === "on_hold") {
        order.holdReason = "parts";
        order.statusHistory.push({ status: "on_hold", at: until, byId: assignee._id });
      }
      return order;
    }

    // Completada: la reparación dura de una hora a dos jornadas y media.
    const completedAt = worked(startedAt, randomInt(60, 1500));
    order.completedAt = completedAt;
    order.completionNotes = template.notes;
    order.statusHistory.push({ status: "completed", at: completedAt, byId: assignee._id });

    const fitting = parts.filter((part) => part.fits.includes(asset.type));
    if (fitting.length && chance(options.expensive ? 0.9 : 0.55)) {
      const part = pick(fitting);
      usePart(order, part.name, part.unit === "liter" ? randomInt(2, 6) : 1, startedAt);
    }
    const vendorRate = options.expensive ? 1 : asset.type === "vehicle" ? 0.6 : asset.type === "generator" ? 0.4 : 0.1;
    if (VENDORS[asset.type] && chance(vendorRate)) {
      const service = { _id: new Types.ObjectId(), vendor: VENDORS[asset.type]!, at: completedAt };
      if (options.expensive) {
        // El reemplazo de la fusora se cotiza cerrado: es el caso de "¿reparar o reemplazar?".
        order.externalCosts.push({
          ...service,
          description: "Reemplazo de unidad fusora y revisión general",
          pricing: "total",
          amount: randomInt(220, 320) * 100,
        });
      } else if (asset.type === "vehicle" || asset.type === "generator") {
        // El mecánico cobra por hora; el total es tarifa × horas.
        const hourlyRate = randomInt(25, 45) * 100;
        const minutes = randomInt(2, 8) * 60;
        order.externalCosts.push({
          ...service,
          description: "Mano de obra del taller",
          pricing: "hourly",
          hourlyRate,
          minutes,
          amount: hourlyServiceAmount(hourlyRate, minutes),
        });
      } else {
        order.externalCosts.push({
          ...service,
          description: "Servicio técnico externo",
          pricing: "total",
          ...(chance(0.4) ? { minutes: randomInt(1, 4) * 60 } : {}),
          amount: randomInt(45, 380) * 100,
        });
      }
    }

    events.push({
      assetId: asset._id,
      kind: "repair",
      at: completedAt,
      actorId: assignee._id,
      workOrderId: order._id,
      data: { notes: template.notes },
    });
    if (outOfService) {
      events.push({
        assetId: asset._id,
        kind: "status_changed",
        at: completedAt,
        actorId: assignee._id,
        workOrderId: order._id,
        data: { from: "in_repair", to: "operational" },
      });
    }
    busyUntil.set(String(asset._id), completedAt);
    return order;
  }

  // Averías del año, al ritmo de cada tipo de equipo.
  const repeated = assets.find((asset) => asset.name === REPEATED_FAILURE_ASSET)!;
  for (const asset of assets) {
    if (asset === repeated) continue;
    const from = Math.max(asset.createdAt.getTime(), historyStart.getTime());
    // Un equipo dado de baja deja de fallar diez días antes: la última reparación
    // terminó antes de la baja.
    const until = asset.retiredAt
      ? asset.retiredAt.getTime() - 10 * DAY_MS
      : now.getTime() - 4 * DAY_MS;
    const ratePerMs = FAILURE_RATE[asset.type] / (HISTORY_DAYS * DAY_MS);
    let cursor = from;
    for (;;) {
      cursor += -Math.log(1 - random()) / ratePerMs;
      if (cursor >= until) break;
      const busy = busyUntil.get(String(asset._id));
      const createdAt = worked(new Date(Math.max(cursor, busy ? busy.getTime() + DAY_MS : 0)), randomInt(10, 200));
      if (createdAt.getTime() >= until) break;
      orders.push(addCorrective(asset, createdAt, "completed"));
    }
  }

  // El equipo de las fallas repetidas: tres en los últimos 90 días y reparaciones
  // que ya pasan de la mitad de lo que costó (plan A7).
  for (const daysAgo of [310, 225, 150, 84, 52, 19]) {
    const createdAt = worked(new Date(now.getTime() - daysAgo * DAY_MS), randomInt(30, 300));
    orders.push(addCorrective(repeated, createdAt, "completed", { expensive: true }));
  }

  // Trabajo en curso hoy: pendientes, asignadas, en progreso y en espera de repuesto.
  const idle = assets.filter(
    (asset) =>
      !asset.retiredAt &&
      asset !== repeated &&
      (busyUntil.get(String(asset._id))?.getTime() ?? 0) < now.getTime() - 3 * DAY_MS,
  );
  const openStates: WorkOrderStatus[] = [
    "pending",
    "pending",
    "pending",
    "assigned",
    "assigned",
    "in_progress",
    "in_progress",
    "in_progress",
    "on_hold",
  ];
  for (const state of openStates) {
    const index = Math.floor(random() * idle.length);
    const asset = idle.splice(index, 1)[0]!;
    const hoursAgo = state === "pending" ? randomInt(2, 30) : randomInt(20, 70);
    const createdAt = worked(new Date(now.getTime() - hoursAgo * 3_600_000), 1);
    orders.push(addCorrective(asset, new Date(Math.min(createdAt.getTime(), now.getTime() - 3_600_000)), state));
  }

  // ── Planes preventivos y sus órdenes ─────────────────────────
  const plans: Record<string, unknown>[] = [];
  const overduePlans: string[] = [];

  for (const [index, template] of PLANS.entries()) {
    const planId = new Types.ObjectId();
    const areaId = areaByName.get(template.areaName)!;
    const targets = assets.filter((asset) =>
      template.assetName ? asset.name === template.assetName : asset.type === template.assetType && asset.areaId.equals(areaId),
    );
    // El plan vencido arranca de modo que su última fecha cayó hace nueve días.
    const startsOn = template.overdue
      ? addDays(addMonths(today, -12), -9)
      : addDays(addMonths(today, -13), (index * 9) % 28);

    const recurrence = { startsOn, every: template.every, unit: template.unit };
    let due = startsOn;
    let nextDueAt = startsOn;
    let lastCompletedAt: Date | undefined;
    const supervisor = supervisorOf(areaId);

    for (;;) {
      const generatedOn = addDays(due, -template.leadDays);
      if (generatedOn > today) {
        nextDueAt = due;
        break;
      }
      const isPast = due < today;
      const isOverdue = template.overdue === true && isPast && addPeriod(due, template.every, template.unit) > today;
      let latestCompletion: Date | undefined;

      for (const asset of targets) {
        const createdAt = at(generatedOn, 6);
        if (asset.createdAt > createdAt || (asset.retiredAt && asset.retiredAt < createdAt)) continue;
        const assignee = pick(technicians(areaId, !isPast || isOverdue));
        const order: SeedWorkOrder = {
          _id: new Types.ObjectId(),
          type: "preventive",
          title: template.title,
          description: `Mantenimiento programado: ${template.title.toLowerCase()}.`,
          asset,
          planId,
          status: "assigned",
          assigneeIds: [assignee._id],
          scheduledFor: due,
          outOfService: false,
          checklist: template.checklist.map((label) => ({ label, done: false })),
          partsUsed: [],
          externalCosts: [],
          createdById: supervisor._id,
          createdAt,
          statusHistory: [
            { status: "pending", at: createdAt, byId: supervisor._id },
            { status: "assigned", at: new Date(createdAt.getTime() + 2 * 3_600_000), byId: supervisor._id },
          ],
        };
        orders.push(order);
        if (!isPast || isOverdue) continue;

        // Hecho entre el día programado y unos días después: a veces se llega tarde.
        const late = chance(0.2) ? randomInt(2, 6) : 0;
        const offset = randomInt(30, 300);
        let startedAt = worked(at(addDays(due, late), 0), offset);
        // Si el retraso lo llevaría al futuro, se hizo a tiempo; nunca queda a medias.
        if (startedAt > now) startedAt = worked(at(due, 0), offset);
        if (startedAt > now) continue;
        const completedAt = worked(startedAt, randomInt(40, 180));
        order.status = "completed";
        order.startedAt = startedAt;
        order.completedAt = completedAt;
        order.completionNotes = "Lista de verificación completa; equipo en buen estado.";
        order.checklist = order.checklist.map((item) => ({ ...item, done: true }));
        order.statusHistory.push(
          { status: "in_progress", at: startedAt, byId: assignee._id },
          { status: "completed", at: completedAt, byId: assignee._id },
        );
        for (const part of template.parts ?? []) usePart(order, part.name, part.qty, startedAt);
        events.push({
          assetId: asset._id,
          kind: "preventive",
          at: completedAt,
          actorId: assignee._id,
          workOrderId: order._id,
          data: { plan: template.title },
        });
        if (!latestCompletion || completedAt > latestCompletion) latestCompletion = completedAt;
      }

      // La ronda ya se generó: `fixed` pasó a la siguiente de su calendario al
      // generarla, y `from_last` la espera hasta que se complete (plan A5).
      if (isOverdue || !isPast) {
        nextDueAt = template.mode === "fixed" ? nextFixedDue(recurrence, due, today) : due;
        if (isOverdue) overduePlans.push(template.title);
        break;
      }
      if (latestCompletion) lastCompletedAt = latestCompletion;
      // `fixed` sigue el calendario; `from_last` cuenta desde el último completado.
      // contando desde `startsOn` para que el día 31 no derive a 28.
      due =
        template.mode === "fixed"
          ? nextFixedDue(recurrence, due, due)
          : addPeriod(latestCompletion ? dayKey(latestCompletion) : due, template.every, template.unit);
    }

    plans.push({
      _id: planId,
      title: template.title,
      ...(template.assetName ? { assetId: targets[0]?._id } : { assetType: template.assetType }),
      areaId,
      checklist: template.checklist,
      every: template.every,
      unit: template.unit,
      mode: template.mode,
      startsOn,
      nextDueAt,
      ...(lastCompletedAt ? { lastCompletedAt } : {}),
      leadDays: template.leadDays,
      isActive: true,
      createdById: supervisor._id,
      createdAt: at(addDays(startsOn, -10), 10),
      updatedAt: lastCompletedAt ?? at(addDays(startsOn, -10), 10),
    });
  }

  // ── Existencias: un libro de movimientos que cuadra ──────────
  // Se recorre el año en orden: entrada inicial, cada consumo con el costo
  // promedio del momento (que queda congelado en la OT), reposiciones cuando se
  // cruza el mínimo y un conteo físico final que deja las existencias del catálogo.
  const movements: Record<string, unknown>[] = [];
  const partDocs: Record<string, unknown>[] = [];
  const usages = orders
    .flatMap((order) => order.partsUsed.map((use) => ({ order, use })))
    .sort((a, b) => a.use.at.getTime() - b.use.at.getTime());

  for (const part of parts) {
    const supervisor = supervisorOf(part.areaId)._id;
    const mine = usages.filter(({ use }) => use.partId.equals(part._id));
    let stock = 0;
    let avg = 0;
    let price = part.cost;
    const lowAtEnd = part.finalStock < part.minStock;
    /** Cuándo cruzó el mínimo por última vez: es cuando el supervisor recibió el aviso. */
    let crossedAt: Date | undefined;
    const track = (before: number, when: Date) => {
      if (stock >= part.minStock) crossedAt = undefined;
      else if (before >= part.minStock) crossedAt = when;
    };

    const receive = (qty: number, when: Date) => {
      avg = weightedAverageCost(stock, avg, qty, price);
      const before = stock;
      stock += qty;
      track(before, when);
      movements.push({ partId: part._id, kind: "in", qty, unitCost: price, actorId: supervisor, at: when, reason: "Compra a proveedor" });
    };

    // Reposiciones pedidas que aún no llegan: entran al stock en su fecha, no al pedirlas.
    let pending: { qty: number; at: Date } | undefined;
    const arrive = (until: Date) => {
      if (pending && pending.at <= until) {
        receive(pending.qty, pending.at);
        pending = undefined;
      }
    };

    // La primera compra, antes del primer consumo: los planes arrancan hace 13 meses.
    const firstUse = Math.min(historyStart.getTime(), mine[0]?.use.at.getTime() ?? Infinity);
    receive(Math.max(part.minStock * 2, 6), new Date(firstUse - 5 * DAY_MS));
    for (const { order, use } of mine) {
      arrive(use.at);
      if (stock < use.qty) {
        pending = undefined;
        price = Math.round(price * (1 + randomInt(2, 8) / 100));
        receive(Math.max(part.minStock * 2, use.qty * 3), new Date(use.at.getTime() - DAY_MS));
      }
      use.unitCost = avg;
      const before = stock;
      stock -= use.qty;
      track(before, use.at);
      movements.push({
        partId: part._id,
        kind: "consume",
        qty: -use.qty,
        unitCost: avg,
        workOrderId: order._id,
        actorId: order.assigneeIds[0] ?? supervisor,
        at: use.at,
      });
      // Bajo el mínimo se repone a los pocos días… salvo en las piezas que la demo
      // necesita bajo mínimo, que en el último mes y medio ya no se reponen.
      const restockAt = new Date(use.at.getTime() + randomInt(2, 6) * DAY_MS);
      const recent = now.getTime() - use.at.getTime() < 45 * DAY_MS;
      if (!pending && stock < part.minStock && restockAt < now && !(lowAtEnd && recent)) {
        price = Math.round(price * (1 + randomInt(1, 6) / 100));
        pending = { qty: part.minStock * 2, at: restockAt };
      }
    }
    arrive(now);

    const difference = part.finalStock - stock;
    if (difference !== 0) {
      movements.push({
        partId: part._id,
        kind: "adjust",
        qty: difference,
        unitCost: avg || price,
        actorId: supervisor,
        at: new Date(now.getTime() - 3 * DAY_MS),
        reason: difference < 0 ? "Conteo físico: faltante" : "Conteo físico: sobrante",
      });
      const before = stock;
      stock = part.finalStock;
      track(before, new Date(now.getTime() - 3 * DAY_MS));
    }

    partDocs.push({
      _id: part._id,
      name: part.name,
      areaId: part.areaId,
      unit: part.unit,
      stock,
      minStock: part.minStock,
      avgUnitCost: avg || price,
      isActive: true,
      // Bajo mínimo al terminar: el aviso ya se mandó cuando cruzó (plan A4).
      ...(crossedAt ? { lowStockNotifiedAt: crossedAt } : {}),
      createdAt: new Date(firstUse - 6 * DAY_MS),
      updatedAt: now,
    });
  }

  // ── Numeración, costos y estado final ────────────────────────
  orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  // El preventivo que sigue abierto después de su fecha ya recibió su aviso de
  // vencido, a las 06:00 del día siguiente: el primer trabajo de la demo no lo repite.
  const overdueNotices: Record<string, unknown>[] = [];
  const workOrderDocs = orders.map((order, index) => {
    const cost = workOrderCost(order);
    const overdueNotifiedAt =
      order.type === "preventive" && order.scheduledFor && order.scheduledFor < today && !order.completedAt
        ? at(addDays(order.scheduledFor, 1), 6)
        : undefined;
    if (overdueNotifiedAt) {
      for (const userId of [...order.assigneeIds, supervisorOf(order.asset.areaId)._id]) {
        overdueNotices.push({
          userId,
          type: "preventive_overdue",
          title: "Preventivo vencido",
          body: `${formatWorkOrderNumber(index + 1)} · ${order.title} · era para el ${order.scheduledFor}`,
          workOrderId: order._id,
          createdAt: overdueNotifiedAt,
          updatedAt: overdueNotifiedAt,
        });
      }
    }
    return {
      _id: order._id,
      number: index + 1,
      type: order.type,
      title: order.title,
      description: order.description,
      assetId: order.asset._id,
      areaId: order.asset.areaId,
      ...(order.planId ? { planId: order.planId } : {}),
      status: order.status,
      ...(order.holdReason ? { holdReason: order.holdReason } : {}),
      assigneeIds: order.assigneeIds,
      ...(order.scheduledFor ? { scheduledFor: order.scheduledFor } : {}),
      outOfService: order.outOfService,
      checklist: order.checklist,
      partsUsed: order.partsUsed,
      ...(order.requiredParts ? { requiredParts: order.requiredParts } : {}),
      externalCosts: order.externalCosts,
      costTotal: cost.total,
      ...(order.completionNotes ? { completionNotes: order.completionNotes } : {}),
      createdById: order.createdById,
      ...(order.startedAt ? { startedAt: order.startedAt } : {}),
      ...(order.completedAt ? { completedAt: order.completedAt } : {}),
      ...(overdueNotifiedAt ? { overdueNotifiedAt } : {}),
      statusHistory: order.statusHistory,
      createdAt: order.createdAt,
      updatedAt: order.completedAt ?? order.statusHistory.at(-1)!.at,
    };
  });

  // Bajas al final de la vida del equipo, después de su última reparación.
  for (const asset of assets.filter((item) => item.retiredAt)) {
    const actor = supervisorOf(asset.areaId)._id;
    events.push(
      { assetId: asset._id, kind: "status_changed", at: asset.retiredAt!, actorId: actor, data: { from: "operational", to: "retired" } },
      { assetId: asset._id, kind: "retired", at: asset.retiredAt!, actorId: actor, data: { reason: asset.retiredReason } },
    );
  }

  const inRepair = new Set(
    orders
      .filter((order) => order.outOfService && !order.completedAt)
      .map((order) => String(order.asset._id)),
  );
  const statusOf = (asset: SeedAsset): AssetStatus =>
    asset.retiredAt ? "retired" : inRepair.has(String(asset._id)) ? "in_repair" : "operational";

  // El más antiguo es ACT-0001.
  assets.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const assetDocs = assets.map((asset, index) => ({
    _id: asset._id,
    number: index + 1,
    name: asset.name,
    type: asset.type,
    brand: asset.brand,
    model: asset.model,
    serial: asset.serial,
    areaId: asset.areaId,
    ...(asset.usedByAreaId ? { usedByAreaId: asset.usedByAreaId } : {}),
    ...(asset.custodianId ? { custodianId: asset.custodianId } : {}),
    location: asset.location,
    purchaseDate: asset.purchaseDate,
    purchaseCost: asset.purchaseCost,
    warrantyUntil: asset.warrantyUntil,
    status: statusOf(asset),
    ...(asset.retiredAt ? { retiredAt: asset.retiredAt, retiredReason: asset.retiredReason } : {}),
    createdAt: asset.createdAt,
    updatedAt: now,
  }));

  // Cada pieza se vincula a los equipos de su tipo que mantiene su área (los de baja no).
  const sparePartDocs = partDocs.map((part, index) => {
    const template = partByName.get(part.name as string)!;
    return {
      ...part,
      number: index + 1,
      assetIds: assets
        .filter(
          (asset) =>
            !asset.retiredAt && String(asset.areaId) === String(template.areaId) && template.fits.includes(asset.type),
        )
        .map((asset) => asset._id),
    };
  });

  // Las alertas de equipo (plan A6), como si el trabajo diario ya hubiera corrido:
  // si no, la primera pasada de la demo mandaría de golpe avisos que en la realidad
  // habrían llegado cuando cada equipo cruzó su umbral.
  const rules = DEFAULT_MAINTENANCE_SETTINGS;
  const equipmentNotices: Record<string, unknown>[] = [];
  const windowStart = new Date(now.getTime() - rules.repeatedFailure.windowDays * DAY_MS);
  for (const doc of assetDocs) {
    if (doc.retiredAt) continue;
    const notice = (fields: Record<string, unknown>, sentAt: Date) =>
      equipmentNotices.push({ userId: supervisorOf(doc.areaId)._id, assetId: doc._id, createdAt: sentAt, updatedAt: sentAt, ...fields });

    if (doc.warrantyUntil && doc.warrantyUntil >= today && doc.warrantyUntil <= addDays(today, rules.warrantyAlertDays)) {
      const due = addDays(doc.warrantyUntil, -rules.warrantyAlertDays);
      const sentAt = new Date(Math.min(at(due > dayKey(doc.createdAt) ? due : dayKey(doc.createdAt), 6).getTime(), now.getTime()));
      Object.assign(doc, { warrantyNotifiedAt: sentAt });
      notice(
        {
          type: "warranty_expiring",
          title: "Garantía por vencer",
          body: `${formatAssetNumber(doc.number)} · ${doc.name} · vence el ${doc.warrantyUntil}`,
        },
        sentAt,
      );
    }

    const failures = orders
      .filter(
        (order) =>
          order.asset._id.equals(doc._id) &&
          order.type === "corrective" &&
          order.status !== "cancelled" &&
          order.createdAt >= windowStart,
      )
      .map((order) => order.createdAt)
      .sort((a, b) => a.getTime() - b.getTime());
    if (failures.length >= rules.repeatedFailure.count) {
      // El aviso salió con la falla que alcanzó el umbral dentro de la ventana.
      const sentAt = failures[rules.repeatedFailure.count - 1]!;
      Object.assign(doc, { repeatedFailuresNotifiedAt: sentAt });
      notice(
        {
          type: "repeated_failures",
          title: "Fallas repetidas",
          body: `${formatAssetNumber(doc.number)} · ${doc.name} · ${rules.repeatedFailure.count} fallas en ${rules.repeatedFailure.windowDays} días`,
        },
        sentAt,
      );
    }
  }

  await Asset.insertMany(assetDocs);
  await AssetEvent.insertMany(events.sort((a, b) => a.at.getTime() - b.at.getTime()));
  await WorkOrder.insertMany(workOrderDocs);
  await MaintenancePlan.insertMany(plans);
  await SparePart.insertMany(sparePartDocs);
  await StockMovement.insertMany(movements);
  // El aviso de stock bajo que recibió el supervisor cuando cada pieza cruzó el mínimo.
  await Notification.insertMany(
    sparePartDocs.flatMap((doc) => {
      const part = doc as typeof doc & {
        _id: Types.ObjectId;
        name: string;
        areaId: Types.ObjectId;
        unit: PartUnit;
        stock: number;
        minStock: number;
        lowStockNotifiedAt?: Date;
      };
      if (!part.lowStockNotifiedAt) return [];
      const unit = PART_UNIT_LABEL[part.unit];
      return [
        {
          userId: supervisorOf(part.areaId)._id,
          type: "low_stock",
          title: `Stock bajo: ${part.name}`,
          body: `${formatSparePartNumber(part.number)} · quedan ${part.stock} ${part.stock === 1 ? unit : `${unit}s`} de un mínimo de ${part.minStock}`,
          sparePartId: part._id,
          createdAt: part.lowStockNotifiedAt,
          updatedAt: part.lowStockNotifiedAt,
        },
      ];
    }),
  );
  await Notification.insertMany(overdueNotices);
  await Notification.insertMany(equipmentNotices);
  await Counter.insertMany([
    { _id: "asset", seq: assetDocs.length },
    { _id: "work_order", seq: workOrderDocs.length },
    { _id: "spare_part", seq: sparePartDocs.length },
  ]);

  // ── Resumen ──────────────────────────────────────────────────
  const workOrdersByStatus: Record<string, number> = {};
  for (const order of orders) workOrdersByStatus[order.status] = (workOrdersByStatus[order.status] ?? 0) + 1;
  const ninetyDaysAgo = now.getTime() - 90 * DAY_MS;
  const repeatedOrders = orders.filter((order) => order.asset === repeated && order.type === "corrective");

  return {
    assets: assetDocs.length,
    retired: assetDocs.filter((asset) => asset.status === "retired").length,
    inRepair: assetDocs.filter((asset) => asset.status === "in_repair").length,
    workOrders: orders.length,
    workOrdersByStatus,
    correctives: orders.filter((order) => order.type === "corrective").length,
    preventives: orders.filter((order) => order.type === "preventive").length,
    parts: sparePartDocs.length,
    lowStock: parts.filter((part) => part.finalStock < part.minStock).map((part) => part.name),
    plans: plans.length,
    overduePlans,
    repeatedFailure: {
      name: `${formatAssetNumber(assetDocs.find((asset) => asset._id.equals(repeated._id))!.number)} ${repeated.name}`,
      last90Days: repeatedOrders.filter((order) => order.createdAt.getTime() >= ninetyDaysAgo).length,
      repairCost: repeatedOrders.reduce((sum, order) => sum + workOrderCost(order).total, 0),
      purchaseCost: repeated.purchaseCost,
    },
  };
}

/** Imprime el resumen de la semilla del módulo 2. */
export function printMaintenanceSummary(summary: MaintenanceSeedSummary, lastOrderNumber?: number): void {
  const usd = (cents: number) => `${(cents / 100).toFixed(2)} USD`;
  console.log("\n  Módulo 2 · mantenimiento:");
  console.log(
    `    ${summary.assets} activos (${summary.inRepair} en reparación, ${summary.retired} de baja) · ` +
      `${summary.workOrders} OT (${summary.correctives} correctivas, ${summary.preventives} preventivas)`,
  );
  console.log(
    `    OT por estado: ${Object.entries(summary.workOrdersByStatus)
      .map(([status, count]) => `${status} ${count}`)
      .join(" · ")}`,
  );
  if (lastOrderNumber) console.log(`    Última OT: ${formatWorkOrderNumber(lastOrderNumber)}`);
  console.log(`    ${summary.parts} repuestos; bajo mínimo: ${summary.lowStock.join(", ")}`);
  console.log(`    ${summary.plans} planes preventivos; vencido: ${summary.overduePlans.join(", ") || "ninguno"}`);
  const { repeatedFailure: r } = summary;
  console.log(
    `    Fallas repetidas: ${r.name} · ${r.last90Days} correctivas en 90 días · ` +
      `reparaciones ${usd(r.repairCost)} de ${usd(r.purchaseCost)} de compra`,
  );
}
