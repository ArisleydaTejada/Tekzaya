import { businessDaysPassed, formatTicketNumber, type Actor } from "@tekzaya/shared";
import { Ticket } from "../models/ticket.model";
import { notify } from "../modules/notifications/notifications.service";
import type { TicketDoc } from "../modules/tickets/ticket.access";
import { applyStatusChange, recordSystemEvent } from "../modules/tickets/ticket.lifecycle";
import { getCalendar, getSettings } from "../modules/settings/settings.service";

/**
 * Quién firma los cambios automáticos. No es una persona, así que no tiene área
 * ni permisos: los trabajos programados no pasan por el motor de autorización
 * porque no actúan en nombre de nadie, actúan en nombre de la política.
 */
const SYSTEM: Actor = {
  id: "000000000000000000000000",
  areaId: "000000000000000000000000",
  role: "admin",
  isAreaSupervisor: false,
  hasGlobalReadAccess: true,
};

export interface LifecycleResult {
  closedResolved: number;
  remindedOnHold: number;
  closedOnHold: number;
}

/**
 * Los tres automatismos del ciclo de vida (spec §5.2), todos medidos en **días
 * hábiles**: un ticket resuelto un viernes no se cierra solo el lunes.
 */
export async function runLifecycleJobs(now = new Date()): Promise<LifecycleResult> {
  const [settings, calendar] = await Promise.all([getSettings(), getCalendar()]);
  const result: LifecycleResult = { closedResolved: 0, remindedOnHold: 0, closedOnHold: 0 };

  // ── Resuelto → Cerrado ──
  const resolved = (await Ticket.find({ status: "resolved" })) as TicketDoc[];
  for (const ticket of resolved) {
    const resolvedAt = ticket.get("sla")?.resolvedAt as Date | undefined;
    if (!resolvedAt) continue;
    if (!businessDaysPassed(resolvedAt, now, settings.autoCloseResolvedDays, calendar)) continue;

    await applyStatusChange(ticket, "closed", SYSTEM, now);
    await ticket.save();
    await recordSystemEvent(
      ticket._id as never,
      {
        kind: "status_changed",
        from: "resolved",
        to: "closed",
        reason: `Cierre automático tras ${settings.autoCloseResolvedDays} días hábiles sin respuesta`,
      },
      now,
    );
    await notify([String(ticket.get("requesterId"))], {
      type: "ticket_auto_closed",
      title: "Tu ticket se cerró",
      body: `${formatTicketNumber(ticket.get("number"))} se cerró automáticamente tras estar resuelto.`,
      ticketId: ticket._id as never,
    });
    result.closedResolved += 1;
  }

  // ── En espera: recordatorio y cierre ──
  const onHold = (await Ticket.find({ status: "on_hold" })) as TicketDoc[];
  for (const ticket of onHold) {
    const since = ticket.get("sla")?.onHoldSince as Date | undefined;
    if (!since) continue;

    if (businessDaysPassed(since, now, settings.onHoldAutoCloseDays, calendar)) {
      await applyStatusChange(ticket, "closed", SYSTEM, now);
      await ticket.save();
      await recordSystemEvent(
        ticket._id as never,
        {
          kind: "status_changed",
          from: "on_hold",
          to: "closed",
          reason: `Cierre automático tras ${settings.onHoldAutoCloseDays} días hábiles sin respuesta del solicitante`,
        },
        now,
      );
      result.closedOnHold += 1;
      continue;
    }

    if (
      !ticket.get("sla")?.onHoldReminderAt &&
      businessDaysPassed(since, now, settings.onHoldReminderDays, calendar)
    ) {
      await notify([String(ticket.get("requesterId"))], {
        type: "on_hold_reminder",
        title: "Tu ticket espera tu respuesta",
        body: `${formatTicketNumber(ticket.get("number"))} sigue en espera; responde para que el equipo continúe.`,
        ticketId: ticket._id as never,
      });
      ticket.set("sla.onHoldReminderAt", now);
      await ticket.save();
      result.remindedOnHold += 1;
    }
  }

  return result;
}
