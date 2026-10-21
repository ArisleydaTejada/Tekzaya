import { addDaysToKey, formatWorkOrderNumber, generationDate } from "@tekzaya/shared";
import { MaintenancePlan, WorkOrder } from "../models/maintenance.models";
import { todayKey } from "../modules/assets/asset.view";
import { notify, supervisorsOf } from "../modules/notifications/notifications.service";
import { advanceFixed, notifyRoundOpened, openRound, type LeanPlan } from "../modules/plans/plan.rounds";
import { getSettings } from "../modules/settings/settings.service";
import { OPEN_WORK_ORDER } from "../modules/workOrders/workOrder.lifecycle";

/** Hora de la empresa a partir de la cual corre el trabajo de preventivos (plan A5). */
export const PREVENTIVE_HOUR = 6;

export interface PreventiveSummary {
  /** OT preventivas abiertas en esta pasada. */
  generated: number;
  /** Planes `fixed` cuya fecha pasó a la ronda siguiente. */
  advanced: number;
  /** Avisos de preventivo vencido enviados (uno por OT). */
  overdue: number;
}

/**
 * El trabajo diario de preventivos. Es **idempotente**: correrlo dos veces el
 * mismo día no abre dos OT para la misma fecha ni repite avisos, así que el
 * planificador puede llamarlo cada hora sin miedo, y si el servidor estuvo
 * apagado a las 06:00, la pasada siguiente recupera lo que faltó.
 */
export async function runPreventiveJob(now = new Date()): Promise<PreventiveSummary> {
  const settings = await getSettings();
  const today = todayKey(settings.businessHours.timezone, now);
  const summary: PreventiveSummary = { generated: 0, advanced: 0, overdue: 0 };

  // Un plan "toca" cuando hoy ya alcanzó el día de generación: nextDueAt − leadDays.
  // La resta no cabe en un filtro de Mongo con fechas de texto, así que se acota
  // por arriba (60 días es la antelación máxima) y se decide aquí.
  const candidates = (await MaintenancePlan.find({
    isActive: true,
    nextDueAt: { $lte: addDaysToKey(today, 60) },
  }).lean()) as LeanPlan[];

  for (const plan of candidates) {
    if (generationDate(plan.nextDueAt, plan.leadDays) > today) continue;
    const opened = await openRound(plan, now);
    summary.generated += opened.length;
    await notifyRoundOpened(plan, opened);
    if (plan.mode === "fixed" && (await advanceFixed(plan, today))) summary.advanced += 1;
  }

  summary.overdue = await notifyOverdue(today, now);
  return summary;
}

/**
 * `preventive_overdue`: a quien atiende la OT y al supervisor del área, una sola
 * vez por orden. La marca se pone con una actualización condicionada, así que
 * dos pasadas a la vez no avisan dos veces.
 */
async function notifyOverdue(today: string, now: Date): Promise<number> {
  const late = await WorkOrder.find({
    type: "preventive",
    scheduledFor: { $lt: today },
    overdueNotifiedAt: { $exists: false },
    ...OPEN_WORK_ORDER,
  })
    .select("_id number title areaId assigneeIds scheduledFor")
    .lean();

  let sent = 0;
  for (const order of late) {
    const marked = await WorkOrder.updateOne(
      { _id: order._id, overdueNotifiedAt: { $exists: false } },
      { $set: { overdueNotifiedAt: now } },
    );
    if (marked.modifiedCount === 0) continue;
    await notify([...order.assigneeIds.map(String), ...(await supervisorsOf(order.areaId))], {
      type: "preventive_overdue",
      title: "Preventivo vencido",
      body: `${formatWorkOrderNumber(order.number)} · ${order.title} · era para el ${order.scheduledFor}`,
      workOrderId: order._id,
      workOrderNumber: order.number,
    });
    sent += 1;
  }
  return sent;
}
