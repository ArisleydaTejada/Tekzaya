import type { Role, TicketStatus } from "../enums";

/**
 * Quién actúa. El rol base se combina con banderas (spec §4.2): un "supervisor de
 * área" es un empleado con `isAreaSupervisor`, y el "supervisor de RRHH" añade
 * `hasGlobalReadAccess`.
 */
export interface Actor {
  id: string;
  areaId: string;
  role: Role;
  isAreaSupervisor: boolean;
  hasGlobalReadAccess: boolean;
}

/** Lo mínimo de un ticket para decidir permisos, sin arrastrar el documento entero. */
export interface TicketRef {
  areaId: string;
  requesterId: string;
  createdById: string;
  assigneeIds: readonly string[];
  status: TicketStatus;
  /**
   * Solicitantes que llegaron al absorber duplicados (spec §7.5.1). Cuentan como
   * solicitantes a todos los efectos: ven el ticket y **no** ven las notas
   * internas. Olvidarlos aquí sería filtrar la trastienda del área a quien solo
   * reportó un problema.
   */
  additionalRequesterIds?: readonly string[];
}

export interface UserRef {
  id: string;
  areaId: string;
}

/** Estados en los que el ticket ya no admite cambios del solicitante (spec §5.1). */
const SETTLED: readonly TicketStatus[] = ["resolved", "closed", "cancelled", "merged"];

export function isAdmin(actor: Actor): boolean {
  return actor.role === "admin";
}

/** Pertenece al área que atiende el ticket, así que es agente de ese ticket. */
export function isAreaMember(actor: Actor, areaId: string): boolean {
  return actor.areaId === areaId;
}

export function isSupervisorOf(actor: Actor, areaId: string): boolean {
  return isAdmin(actor) || (actor.isAreaSupervisor && actor.areaId === areaId);
}

/** El ticket es suyo: lo pidió o lo registró. Actúa como solicitante, no como agente. */
export function isOwnTicket(actor: Actor, ticket: TicketRef): boolean {
  return (
    ticket.requesterId === actor.id ||
    ticket.createdById === actor.id ||
    (ticket.additionalRequesterIds?.includes(actor.id) ?? false)
  );
}

export function isAssignee(actor: Actor, ticket: TicketRef): boolean {
  return ticket.assigneeIds.includes(actor.id);
}

// ── Lectura ───────────────────────────────────────────────────

export function canViewTicket(actor: Actor, ticket: TicketRef): boolean {
  if (isAdmin(actor)) return true;
  return isOwnTicket(actor, ticket) || isAreaMember(actor, ticket.areaId);
}

/**
 * Regla de privacidad del spec §4.3: el solicitante **nunca** ve las notas internas
 * de su propio ticket, aunque pertenezca al área que lo atiende. Solo las ve cuando
 * actúa como agente de un ticket ajeno.
 *
 * Se aplica también al administrador: la regla dice "nunca" y el motivo es la
 * privacidad frente al solicitante, no la jerarquía.
 */
export function canReadInternalNotes(actor: Actor, ticket: TicketRef): boolean {
  if (isOwnTicket(actor, ticket)) return false;
  if (isAdmin(actor)) return true;
  return isAreaMember(actor, ticket.areaId);
}

// ── Conversación ──────────────────────────────────────────────

/** Leer no implica actuar: responder al solicitante queda para responsables y supervisores. */
export function canReplyPublicly(actor: Actor, ticket: TicketRef): boolean {
  if (isAdmin(actor)) return true;
  if (isOwnTicket(actor, ticket)) return true;
  if (isAssignee(actor, ticket)) return true;
  return isSupervisorOf(actor, ticket.areaId);
}

/** Cualquier miembro del área destino puede dejar una nota interna (spec §12). */
export function canWriteInternalNote(actor: Actor, ticket: TicketRef): boolean {
  if (isOwnTicket(actor, ticket)) return false;
  if (isAdmin(actor)) return true;
  return isAreaMember(actor, ticket.areaId);
}

// ── Gestión del ticket ────────────────────────────────────────

export function canManageAssignees(actor: Actor, ticket: TicketRef): boolean {
  return isSupervisorOf(actor, ticket.areaId);
}

export function canSelfAssign(actor: Actor, ticket: TicketRef): boolean {
  return isAdmin(actor) || isAreaMember(actor, ticket.areaId);
}

export function canChangePriority(actor: Actor, ticket: TicketRef): boolean {
  return isSupervisorOf(actor, ticket.areaId);
}

export function canChangeCategory(actor: Actor, ticket: TicketRef): boolean {
  if (SETTLED.includes(ticket.status)) return false;
  if (isOwnTicket(actor, ticket)) return true;
  return isSupervisorOf(actor, ticket.areaId);
}

export function canChangeStatus(actor: Actor, ticket: TicketRef): boolean {
  return isAssignee(actor, ticket) || isSupervisorOf(actor, ticket.areaId);
}

export function canTransfer(actor: Actor, ticket: TicketRef): boolean {
  return isAssignee(actor, ticket) || isSupervisorOf(actor, ticket.areaId);
}

export function canCancel(actor: Actor, ticket: TicketRef): boolean {
  if (SETTLED.includes(ticket.status)) return false;
  if (isOwnTicket(actor, ticket)) return true;
  return isSupervisorOf(actor, ticket.areaId);
}

/** Solo dentro de una misma área, y siendo responsable de ambos si no se es supervisor. */
export function canMerge(actor: Actor, principal: TicketRef, duplicate: TicketRef): boolean {
  if (principal.areaId !== duplicate.areaId) return false;
  if (isSupervisorOf(actor, principal.areaId)) return true;
  return isAssignee(actor, principal) && isAssignee(actor, duplicate);
}

/**
 * Deshacer la fusión es más restrictivo que hacerla: solo el supervisor del área
 * y el administrador (spec §7.5.1). Separar un ticket devuelve a su solicitante
 * una conversación que llevaba días viviendo dentro de otra.
 */
export function canUnmerge(actor: Actor, principal: TicketRef): boolean {
  return isSupervisorOf(actor, principal.areaId);
}

/**
 * "Unirme": lo pide quien pertenece al área pero no atiende el ticket, y solo si
 * ya hay responsables — sin ellos el botón que corresponde es "Tomar" (spec §7.5).
 */
export function canRequestJoin(actor: Actor, ticket: TicketRef): boolean {
  if (isOwnTicket(actor, ticket)) return false;
  if (isAssignee(actor, ticket)) return false;
  if (ticket.assigneeIds.length === 0) return false;
  return isAreaMember(actor, ticket.areaId) || isAdmin(actor);
}

/**
 * La encuesta la responde **quien pidió el ticket**, nunca quien lo atendió, y solo
 * mientras está *Resuelto*: al cerrarse queda fija y una sola respuesta por ticket
 * (spec §7.6). El administrador tampoco puntúa en nombre de nadie.
 */
export function canAnswerCsat(actor: Actor, ticket: TicketRef): boolean {
  return isOwnTicket(actor, ticket) && ticket.status === "resolved";
}

// ── Personas ──────────────────────────────────────────────────

/** Crear en nombre de un compañero: mismo área, salvo el admin (spec §10.4). */
export function canCreateOnBehalfOf(actor: Actor, target: UserRef): boolean {
  if (isAdmin(actor)) return true;
  return actor.areaId === target.areaId;
}

export function canSetAvailabilityOf(actor: Actor, target: UserRef): boolean {
  if (actor.id === target.id) return true;
  return isSupervisorOf(actor, target.areaId);
}

export function canManageSystem(actor: Actor): boolean {
  return isAdmin(actor);
}

/**
 * Entrar a Configuración: el administrador y el supervisor de RRHH. RRHH lleva la
 * jornada, los festivos, los plazos y los cierres, que son reglas de trabajo del
 * personal; las funciones de IA y los límites de Reportes siguen siendo del
 * administrador (ver `SYSTEM_ONLY_SETTINGS`).
 */
export function canManageSettings(actor: Actor): boolean {
  return isAdmin(actor) || actor.hasGlobalReadAccess;
}

/** Apartados de Configuración que solo toca el administrador. */
export const SYSTEM_ONLY_SETTINGS = ["aiEnabled", "reportLimits"] as const;

/**
 * Llevar las altas y bajas del personal: invitar, corregir datos, cambiar de
 * área, activar y desactivar, y repartir enlaces de acceso. Es trabajo de RRHH
 * además del administrador — son quienes saben quién entra y quién sale.
 */
export function canManageUsers(actor: Actor): boolean {
  return isAdmin(actor) || actor.hasGlobalReadAccess;
}

/**
 * Repartir privilegios — el rol de administrador y la lectura global de RRHH —
 * es otra cosa, y se queda en el administrador. Si RRHH pudiera concederlos,
 * cualquier cuenta de RRHH podría nombrarse administradora y el límite anterior
 * dejaría de existir. Por el mismo motivo nadie que no sea administrador toca
 * una cuenta que ya lo es.
 */
export function canGrantPrivileges(actor: Actor): boolean {
  return isAdmin(actor);
}

// ── Alcance de datos ──────────────────────────────────────────

export type DataScope =
  | { type: "global" }
  | { type: "area"; areaId: string }
  | { type: "me"; userId: string };

/**
 * Alcance máximo que el servidor concede a este usuario en estadísticas y reportes.
 * El endpoint lo recalcula desde el token y descarta cualquier `areaId` o `userId`
 * que el cliente mande por encima (spec §10.4).
 */
export function maxReportScope(actor: Actor): DataScope {
  if (isAdmin(actor) || actor.hasGlobalReadAccess) return { type: "global" };
  if (actor.isAreaSupervisor) return { type: "area", areaId: actor.areaId };
  return { type: "me", userId: actor.id };
}

/** ¿Cabe el alcance pedido dentro de lo que este usuario puede ver? */
export function isScopeAllowed(actor: Actor, requested: DataScope): boolean {
  const allowed = maxReportScope(actor);
  if (allowed.type === "global") return true;
  if (allowed.type === "area") {
    if (requested.type === "global") return false;
    if (requested.type === "area") return requested.areaId === allowed.areaId;
    return true; // una persona concreta: el endpoint comprueba que sea de su área
  }
  return requested.type === "me" && requested.userId === actor.id;
}
