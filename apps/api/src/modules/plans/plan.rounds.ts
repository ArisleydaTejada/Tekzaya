import { addPeriod, formatWorkOrderNumber, nextFixedDue, type PlanMode, type PlanUnit } from "@tekzaya/shared";
import { Types } from "mongoose";
import { Asset, MaintenancePlan, WorkOrder } from "../../models/maintenance.models";
import { notify, supervisorsOf } from "../notifications/notifications.service";
import { getSettings } from "../settings/settings.service";
import type { LeanAsset } from "../assets/asset.access";
import { todayKey } from "../assets/asset.view";
import { broadcastWorkOrder, OPEN_WORK_ORDER, openWorkOrder } from "../workOrders/workOrder.lifecycle";
import type { LeanWorkOrder } from "../workOrders/workOrder.access";

/**
 * Plan A5: las rondas de un plan preventivo. Una **ronda** es una fecha
 * (`nextDueAt`) y las OT que genera, una por equipo cubierto. El trabajo diario
 * abre la ronda; la fecha siguiente se calcula distinto según el modo:
 *
 * - `fixed`: al abrir la ronda, desde el calendario de `startsOn`. Hacerla tarde
 *   no mueve nada.
 * - `from_last`: al **cerrarse** la ronda (su última OT completada o
 *   cancelada), desde el día en que se completó. Mientras está abierta,
 *   `nextDueAt` sigue siendo la de la ronda en curso.
 */

/** Documento plano de un plan, tal como sale de `.lean()`. */
export interface LeanPlan {
  _id: Types.ObjectId;
  title: string;
  assetId?: Types.ObjectId | null;
  assetType?: string | null;
  areaId: Types.ObjectId;
  checklist: string[];
  every: number;
  unit: PlanUnit;
  mode: PlanMode;
  startsOn: string;
  nextDueAt: string;
  lastCompletedAt?: Date | null;
  leadDays: number;
  isActive: boolean;
  createdById?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Los equipos que cubre un plan hoy: el suyo, o los de su tipo en su área. Nunca los dados de baja. */
export function coverageFilter(plan: Pick<LeanPlan, "assetId" | "assetType" | "areaId">): Record<string, unknown> {
  return plan.assetId
    ? { _id: plan.assetId, status: { $ne: "retired" } }
    : { areaId: plan.areaId, type: plan.assetType, status: { $ne: "retired" } };
}

const isDuplicateKey = (error: unknown) => (error as { code?: number } | null)?.code === 11000;

/**
 * Abre la ronda `plan.nextDueAt`: una OT por equipo cubierto que todavía no la
 * tenga. Se salta el equipo que ya tiene la OT de esa fecha (el trabajo corre
 * dos veces) o que sigue con una OT abierta de este plan (no se apilan
 * preventivos sin hacer). El índice único `{planId, assetId, scheduledFor}`
 * cubre la carrera entre dos procesos.
 */
export async function openRound(plan: LeanPlan, at: Date): Promise<{ id: Types.ObjectId; number: number }[]> {
  const assets = (await Asset.find(coverageFilter(plan)).sort({ number: 1 }).lean()) as LeanAsset[];
  if (!assets.length) return [];

  const busy = await WorkOrder.find({
    planId: plan._id,
    assetId: { $in: assets.map((asset) => asset._id) },
    $or: [{ scheduledFor: plan.nextDueAt }, OPEN_WORK_ORDER],
  })
    .select("assetId")
    .lean();
  const skip = new Set(busy.map((order) => String(order.assetId)));

  const opened: { id: Types.ObjectId; number: number }[] = [];
  for (const asset of assets) {
    if (skip.has(String(asset._id))) continue;
    try {
      opened.push(
        await openWorkOrder(
          {
            type: "preventive",
            title: plan.title,
            description: `Mantenimiento programado: ${plan.title.charAt(0).toLowerCase()}${plan.title.slice(1)}.`,
            asset,
            planId: plan._id,
            outOfService: false,
            scheduledFor: plan.nextDueAt,
            checklist: plan.checklist,
          },
          null,
          at,
        ),
      );
    } catch (error) {
      // Otro proceso abrió la misma OT entre la consulta y la escritura.
      if (!isDuplicateKey(error)) throw error;
    }
  }
  return opened;
}

/**
 * Tras abrir la ronda de un plan `fixed`, la fecha pasa a la siguiente del
 * calendario. Condicionada a la fecha leída: si dos procesos corren a la vez,
 * solo uno la mueve.
 */
export async function advanceFixed(plan: LeanPlan, today: string): Promise<string | null> {
  const next = nextFixedDue(plan, plan.nextDueAt, today);
  const moved = await MaintenancePlan.updateOne(
    { _id: plan._id, nextDueAt: plan.nextDueAt },
    { $set: { nextDueAt: next } },
  );
  return moved.modifiedCount > 0 ? next : null;
}

/** Aviso `preventive_due` a los supervisores del área: hay preventivos que repartir. */
export async function notifyRoundOpened(plan: LeanPlan, opened: readonly { id: Types.ObjectId; number: number }[]) {
  const first = opened[0];
  if (!first) return;
  await notify(await supervisorsOf(plan.areaId), {
    type: "preventive_due",
    title: opened.length === 1 ? "Preventivo programado" : `${opened.length} preventivos programados`,
    body:
      opened.length === 1
        ? `${formatWorkOrderNumber(first.number)} · ${plan.title} · para el ${plan.nextDueAt}`
        : `${plan.title} · ${opened.length} órdenes desde ${formatWorkOrderNumber(first.number)} · para el ${plan.nextDueAt}`,
    workOrderId: first.id,
    workOrderNumber: first.number,
  });
  for (const order of opened) await broadcastWorkOrder(order.id);
}

/**
 * Lo que una OT preventiva le deja a su plan al terminar. Completarla anota
 * `lastCompletedAt`. En `from_last`, si era la última abierta de la ronda en
 * curso, la ronda se cierra y la fecha siguiente se cuenta desde la última
 * completada de la ronda (o desde hoy, si todas se cancelaron: el plan no se
 * queda parado esperando una ronda que nadie hará).
 */
export async function closeRound(order: LeanWorkOrder, at: Date): Promise<void> {
  if (order.type !== "preventive" || !order.planId) return;
  if (order.status === "completed" && order.completedAt) {
    await MaintenancePlan.updateOne({ _id: order.planId }, { $max: { lastCompletedAt: order.completedAt } });
  }

  const plan = (await MaintenancePlan.findById(order.planId).lean()) as LeanPlan | null;
  if (!plan || plan.mode !== "from_last" || plan.nextDueAt !== order.scheduledFor) return;
  const stillOpen = await WorkOrder.exists({ planId: plan._id, scheduledFor: plan.nextDueAt, ...OPEN_WORK_ORDER });
  if (stillOpen) return;

  const latest = await WorkOrder.findOne({ planId: plan._id, scheduledFor: plan.nextDueAt, status: "completed" })
    .sort({ completedAt: -1 })
    .select("completedAt")
    .lean();
  const zone = (await getSettings()).businessHours.timezone;
  const base = todayKey(zone, latest?.completedAt ?? at);
  await MaintenancePlan.updateOne(
    { _id: plan._id, nextDueAt: plan.nextDueAt },
    { $set: { nextDueAt: addPeriod(base, plan.every, plan.unit) } },
  );
}
