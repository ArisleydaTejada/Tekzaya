import type { SlaState } from "../enums";
import { SLA_RISK_THRESHOLD, type SlaPolicy } from "../settings";
import { addBusinessMinutes, businessMinutesBetween, type BusinessCalendar } from "./businessTime";

export interface SlaTargets {
  /** Instante en que vence el plazo. */
  dueAt: Date;
  /** Instante en que el ticket pasa a "En riesgo" (75 % del plazo consumido). */
  riskAt: Date;
}

export interface TicketSlaTargets {
  response: SlaTargets;
  resolution: SlaTargets;
}

/**
 * Los umbrales se precalculan al crear el ticket en vez de recalcularse en cada
 * lectura: el estado del SLA queda en una comparación de fechas, que es lo que
 * permite que listados y reportes respondan rápido con muchos tickets (spec §13).
 */
export function computeSlaTargets(
  startAt: Date,
  minutes: number,
  calendar: BusinessCalendar,
): SlaTargets {
  return {
    dueAt: addBusinessMinutes(startAt, minutes, calendar),
    riskAt: addBusinessMinutes(startAt, Math.round(minutes * SLA_RISK_THRESHOLD), calendar),
  };
}

export function computeTicketSla(
  startAt: Date,
  policy: SlaPolicy,
  calendar: BusinessCalendar,
): TicketSlaTargets {
  return {
    response: computeSlaTargets(startAt, policy.responseMinutes, calendar),
    resolution: computeSlaTargets(startAt, policy.resolutionMinutes, calendar),
  };
}

/**
 * Al salir de "En espera" el plazo se corre tantos minutos laborables como duró la
 * pausa, de modo que el tiempo que el ticket estuvo esperando al solicitante no
 * cuenta en su contra (spec §5.2).
 */
export function shiftTargets(
  targets: SlaTargets,
  pausedFrom: Date,
  pausedTo: Date,
  calendar: BusinessCalendar,
): SlaTargets {
  const pausedMinutes = businessMinutesBetween(pausedFrom, pausedTo, calendar);
  if (pausedMinutes <= 0) return targets;
  return {
    dueAt: addBusinessMinutes(targets.dueAt, pausedMinutes, calendar),
    riskAt: addBusinessMinutes(targets.riskAt, pausedMinutes, calendar),
  };
}

export interface SlaStateInput extends SlaTargets {
  /** Primera respuesta o resolución, si ya ocurrió: congela el veredicto. */
  completedAt?: Date | null;
}

export function slaStateAt(now: Date, input: SlaStateInput): SlaState {
  const reference = input.completedAt ?? now;
  if (reference.getTime() > input.dueAt.getTime()) return "breached";
  if (input.completedAt) return "on_time";
  if (reference.getTime() >= input.riskAt.getTime()) return "at_risk";
  return "on_time";
}

/** El peor de los dos relojes, que es el que se muestra en la lista de tickets. */
export function worstSlaState(a: SlaState, b: SlaState): SlaState {
  const rank: Record<SlaState, number> = { breached: 0, at_risk: 1, on_time: 2 };
  return rank[a] <= rank[b] ? a : b;
}
