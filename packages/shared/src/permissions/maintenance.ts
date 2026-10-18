import {
  isAdmin,
  isAreaMember,
  isOwnTicket,
  isSupervisorOf,
  type Actor,
  type TicketRef,
} from "./permissions";

/**
 * Permisos del módulo 2 (plan §3). Siguen la lógica del módulo 1: el **área
 * responsable** de un activo es la que lo atiende, igual que el área de un
 * ticket. Quien pertenece a ella es su técnico; su supervisor lo gestiona; RRHH
 * lee todo y no toca nada; el administrador puede todo.
 */

/** Lo mínimo de un activo para decidir permisos. */
export interface AssetRef {
  /** Área responsable: la que lo mantiene. */
  areaId: string;
  /** Área que lo usa, si es otra. */
  usedByAreaId?: string | undefined;
  /** Persona a cargo del equipo. */
  custodianId?: string | undefined;
}

/** Lo mínimo de una orden de trabajo. */
export interface WorkOrderRef {
  areaId: string;
  assigneeIds: readonly string[];
}

const hasGlobalRead = (actor: Actor) => isAdmin(actor) || actor.hasGlobalReadAccess;

/** El equipo es "suyo" como usuario: lo tiene a cargo o lo usa su área. */
function usesAsset(actor: Actor, asset: AssetRef): boolean {
  return asset.custodianId === actor.id || asset.usedByAreaId === actor.areaId;
}

// ── Activos ───────────────────────────────────────────────────

/**
 * Ver la ficha básica: cualquiera ve los equipos que tiene a su cargo o que usa
 * su área, para poder reportar una falla. El área responsable ve los suyos.
 */
export function canViewAsset(actor: Actor, asset: AssetRef): boolean {
  if (hasGlobalRead(actor)) return true;
  return isAreaMember(actor, asset.areaId) || usesAsset(actor, asset);
}

/**
 * Historial, órdenes y **costos**: solo el área responsable, RRHH (lectura) y el
 * administrador. El empleado ve "su" laptop y su estado; el precio de compra y
 * lo que costaron las reparaciones son información del área.
 */
export function canViewAssetDetails(actor: Actor, asset: AssetRef): boolean {
  if (hasGlobalRead(actor)) return true;
  return isAreaMember(actor, asset.areaId);
}

/** Crear, editar, mover y dar de baja: el supervisor del área responsable. */
export function canManageAsset(actor: Actor, asset: Pick<AssetRef, "areaId">): boolean {
  return isSupervisorOf(actor, asset.areaId);
}

/**
 * Vincular un equipo a un ticket. El empleado lo hace al crear el suyo, y solo
 * con un equipo que usa; el técnico, con cualquier equipo de su área en un
 * ticket que atiende. La lectura global de RRHH no da derecho a vincular nada:
 * leer no es actuar.
 */
export function canLinkAssetToTicket(actor: Actor, asset: AssetRef, ticket: TicketRef): boolean {
  if (isAdmin(actor)) return true;
  if (isAreaMember(actor, asset.areaId)) {
    return isOwnTicket(actor, ticket) || isAreaMember(actor, ticket.areaId);
  }
  return isOwnTicket(actor, ticket) && usesAsset(actor, asset);
}

/**
 * Si puede vincular *algún* equipo en este ticket: decide si se ofrece el
 * selector. Quien pasa esto puede vincular, como mínimo, los equipos que su
 * área mantiene (o los que usa, si el ticket es suyo); `canLinkAssetToTicket`
 * decide equipo por equipo.
 */
export function canLinkAssetsOnTicket(actor: Actor, ticket: TicketRef): boolean {
  return isAdmin(actor) || isOwnTicket(actor, ticket) || isAreaMember(actor, ticket.areaId);
}

// ── Órdenes de trabajo ────────────────────────────────────────

export function canViewWorkOrder(actor: Actor, order: WorkOrderRef): boolean {
  if (hasGlobalRead(actor)) return true;
  return isAreaMember(actor, order.areaId);
}

/** Abrir una OT —o convertir un ticket en una— es trabajo del área responsable del equipo. */
export function canCreateWorkOrder(actor: Actor, asset: Pick<AssetRef, "areaId">): boolean {
  return isAdmin(actor) || isAreaMember(actor, asset.areaId);
}

/** Tomar una OT: cualquier técnico del área, como "Tomar" en los tickets. */
export function canTakeWorkOrder(actor: Actor, order: WorkOrderRef): boolean {
  return isAdmin(actor) || isAreaMember(actor, order.areaId);
}

/**
 * Registrar horas, repuestos y costos, y mover el estado: quien la atiende o su
 * supervisor. Mismo criterio que cambiar el estado de un ticket: ver una orden
 * no es poder cargarle horas.
 */
export function canWorkOnWorkOrder(actor: Actor, order: WorkOrderRef): boolean {
  return order.assigneeIds.includes(actor.id) || isSupervisorOf(actor, order.areaId);
}

/** Asignar la OT a otros: el supervisor del área. */
export function canAssignWorkOrder(actor: Actor, order: Pick<WorkOrderRef, "areaId">): boolean {
  return isSupervisorOf(actor, order.areaId);
}

// ── Planes preventivos y repuestos ────────────────────────────

export function canManageMaintenancePlans(actor: Actor, areaId: string): boolean {
  return isSupervisorOf(actor, areaId);
}

/** Ver repuestos y su stock: el área dueña del almacén, RRHH (lectura) y el admin. */
export function canViewSpareParts(actor: Actor, areaId: string): boolean {
  if (hasGlobalRead(actor)) return true;
  return isAreaMember(actor, areaId);
}

/**
 * Entradas y ajustes de stock: el supervisor. El técnico consume repuestos desde
 * una OT, que deja su propio movimiento; no ajusta el inventario a mano.
 */
export function canManageStock(actor: Actor, areaId: string): boolean {
  return isSupervisorOf(actor, areaId);
}

/** Moneda, tarifas y umbrales: solo el administrador. */
export function canManageMaintenanceSettings(actor: Actor): boolean {
  return isAdmin(actor);
}

// ── Alcance de las consultas ──────────────────────────────────

export type AssetScope =
  | { type: "global" }
  /** Los del área responsable, los que usa su área y los que tiene a cargo. */
  | { type: "limited"; areaId: string; userId: string };

/**
 * Qué activos entran en una lista. Lo decide el servidor desde la sesión; los
 * filtros que mande el cliente solo pueden estrechar esto, nunca ampliarlo.
 */
export function assetScopeFor(actor: Actor): AssetScope {
  if (hasGlobalRead(actor)) return { type: "global" };
  return { type: "limited", areaId: actor.areaId, userId: actor.id };
}
