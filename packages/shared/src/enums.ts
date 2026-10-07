import { z } from "zod";

// Los valores del contrato van en inglés; el español vive solo en las etiquetas
// de interfaz. Así el prototipo puede seguir mostrando "En progreso" sin que el
// idioma se filtre al modelo de datos ni a la API.

// ── Estado del ticket (spec §5.2) ─────────────────────────────
export const TICKET_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "resolved",
  "closed",
  "reopened",
  "cancelled",
  "merged",
] as const;

export const ticketStatus = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof ticketStatus>;

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Abierto",
  assigned: "Asignado",
  in_progress: "En progreso",
  on_hold: "En espera",
  resolved: "Resuelto",
  closed: "Cerrado",
  reopened: "Reabierto",
  cancelled: "Cancelado",
  merged: "Fusionado",
};

/** Estados finales: el ticket ya no consume SLA ni aparece como pendiente. */
export const FINAL_TICKET_STATUSES = ["closed", "cancelled", "merged"] as const;

/** Un ticket está "activo" mientras siga requiriendo trabajo del área. */
export const ACTIVE_TICKET_STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "reopened",
] as const;

export function isActiveStatus(status: TicketStatus): boolean {
  return (ACTIVE_TICKET_STATUSES as readonly TicketStatus[]).includes(status);
}

/**
 * Estados en los que el reloj del SLA ya paró. No es lo mismo que "final":
 * *Resuelto* todavía admite reapertura, pero el plazo dejó de correr en cuanto el
 * área entregó la solución, y seguir contando días contra un ticket entregado
 * convierte cualquier cierre antiguo en un incumplimiento (spec §5.3).
 */
export const SETTLED_TICKET_STATUSES = ["resolved", "closed", "cancelled", "merged"] as const;

export function isSettledStatus(status: TicketStatus): boolean {
  return (SETTLED_TICKET_STATUSES as readonly TicketStatus[]).includes(status);
}

// ── Prioridad y SLA (spec §5.3) ───────────────────────────────
export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export const priority = z.enum(PRIORITIES);
export type Priority = z.infer<typeof priority>;

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Urgente",
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export const SLA_STATES = ["on_time", "at_risk", "breached"] as const;
export const slaState = z.enum(SLA_STATES);
export type SlaState = z.infer<typeof slaState>;

export const SLA_STATE_LABEL: Record<SlaState, string> = {
  on_time: "En tiempo",
  at_risk: "En riesgo",
  breached: "Vencido",
};

// ── Personas (spec §4.2) ──────────────────────────────────────
// El rol base se combina con banderas en vez de multiplicar roles:
// "supervisor de área" = employee + isAreaSupervisor,
// "supervisor de RRHH" = employee + isAreaSupervisor + hasGlobalReadAccess.
export const ROLES = ["employee", "admin"] as const;
export const role = z.enum(ROLES);
export type Role = z.infer<typeof role>;

export const USER_STATUSES = ["invited", "active", "disabled"] as const;
export const userStatus = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatus>;

export const AVAILABILITY_STATES = ["available", "away"] as const;
export const availabilityState = z.enum(AVAILABILITY_STATES);
export type AvailabilityState = z.infer<typeof availabilityState>;

export const AVAILABILITY_STATE_LABEL: Record<AvailabilityState, string> = {
  available: "Disponible",
  away: "Ausente",
};

export const AWAY_REASONS = ["vacation", "leave", "sick", "other"] as const;
export const awayReason = z.enum(AWAY_REASONS);
export type AwayReason = z.infer<typeof awayReason>;

export const AWAY_REASON_LABEL: Record<AwayReason, string> = {
  vacation: "Vacaciones",
  leave: "Permiso",
  sick: "Incapacidad",
  other: "Otro",
};

// ── Conversación (spec §11 messages) ──────────────────────────
export const MESSAGE_TYPES = ["public", "internal", "system"] as const;
export const messageType = z.enum(MESSAGE_TYPES);
export type MessageType = z.infer<typeof messageType>;

// ── Alcance de consultas (spec §12) ───────────────────────────
export const TICKET_SCOPES = ["mine", "assigned", "area", "unassigned", "all"] as const;
export const ticketScope = z.enum(TICKET_SCOPES);
export type TicketScope = z.infer<typeof ticketScope>;
