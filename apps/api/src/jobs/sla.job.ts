import {
  ACTIVE_TICKET_STATUSES,
  formatTicketNumber,
  slaStateAt,
  worstSlaState,
  type SlaState,
} from "@tekzaya/shared";
import { Ticket } from "../models/ticket.model";
import { notify, supervisorsOf } from "../modules/notifications/notifications.service";
import type { TicketDoc } from "../modules/tickets/ticket.access";

export interface SlaWatchResult {
  scanned: number;
  atRisk: number;
  breached: number;
}

/**
 * El estado del SLA se calcula al leer, así que este trabajo no existe para que
 * la lista se pinte bien: existe para **avisar**. Pasa por los tickets vivos, y
 * la primera vez que uno entra en riesgo o vence deja la notificación y la marca
 * de que ya se avisó, para no repetirla cada vuelta.
 */
export async function runSlaWatch(now = new Date()): Promise<SlaWatchResult> {
  const tickets = (await Ticket.find({ status: { $in: [...ACTIVE_TICKET_STATUSES] } })) as TicketDoc[];
  const result: SlaWatchResult = { scanned: tickets.length, atRisk: 0, breached: 0 };

  for (const ticket of tickets) {
    const sla = ticket.get("sla");
    if (!sla) continue;

    const response: SlaState = slaStateAt(now, {
      dueAt: sla.responseDueAt as Date,
      riskAt: sla.responseRiskAt as Date,
      completedAt: sla.firstResponseAt as Date | undefined,
    });
    const resolution: SlaState = slaStateAt(now, {
      dueAt: sla.resolutionDueAt as Date,
      riskAt: sla.resolutionRiskAt as Date,
    });
    const state = worstSlaState(response, resolution);

    // Los incumplimientos se guardan en el documento porque los reportes de F7
    // los necesitan históricos: "estaba vencido" no se puede recalcular después
    // de que alguien lo resuelva.
    const responseBreached = response === "breached";
    const resolutionBreached = resolution === "breached";
    let changed = false;
    if (sla.responseBreached !== responseBreached) {
      ticket.set("sla.responseBreached", responseBreached);
      changed = true;
    }
    if (sla.resolutionBreached !== resolutionBreached) {
      ticket.set("sla.resolutionBreached", resolutionBreached);
      changed = true;
    }

    const audience = async (): Promise<string[]> => {
      const assignees = (ticket.get("assigneeIds") as unknown[]).map(String);
      const supervisors = await supervisorsOf(String(ticket.get("areaId")));
      // Sin responsables, el aviso es del supervisor: es quien puede asignarlo.
      return [...new Set([...assignees, ...supervisors])];
    };

    if (state === "breached" && !sla.breachNotifiedAt) {
      await notify(await audience(), {
        type: "sla_breached",
        title: "SLA vencido",
        body: `${formatTicketNumber(ticket.get("number"))} · ${ticket.get("title")}`,
        ticketId: ticket._id as never,
      });
      ticket.set("sla.breachNotifiedAt", now);
      result.breached += 1;
      changed = true;
    } else if (state === "at_risk" && !sla.riskNotifiedAt && !sla.breachNotifiedAt) {
      await notify(await audience(), {
        type: "sla_at_risk",
        title: "SLA en riesgo",
        body: `${formatTicketNumber(ticket.get("number"))} · ${ticket.get("title")}`,
        ticketId: ticket._id as never,
      });
      ticket.set("sla.riskNotifiedAt", now);
      result.atRisk += 1;
      changed = true;
    }

    if (changed) await ticket.save();
  }

  return result;
}
