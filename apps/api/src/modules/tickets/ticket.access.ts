import {
  ACTIVE_TICKET_STATUSES,
  canViewTicket,
  isAdmin,
  type Actor,
  type TicketListQuery,
  type TicketRef,
} from "@tekzaya/shared";
import { Types, type HydratedDocument } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Ticket } from "../../models/ticket.model";

/**
 * El esquema del ticket es ancho y anidado; en vez de duplicar su forma en
 * TypeScript, el acceso va por `get`/`set` con la ruta (`"sla.responseDueAt"`),
 * que es lo que mongoose valida contra el esquema en tiempo de ejecución.
 */
export type TicketDoc = HydratedDocument<Record<string, any>>;
/** Documento plano tal como sale de `.lean()` o de una agregación. */
export type LeanTicket = Record<string, any>;

/** `_id` del documento, ya tipado: el esquema genérico lo deja en `unknown`. */
export const idOf = (ticket: TicketDoc): Types.ObjectId => ticket._id as Types.ObjectId;

/** Express 5 tipa los parámetros de ruta como `string | string[] | undefined`. */
export function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

type Filter = Record<string, unknown>;

const oid = (value: string): Types.ObjectId => new Types.ObjectId(value);

/** Lo mínimo que necesita el motor de permisos, sacado del documento. */
export function refOf(ticket: LeanTicket): TicketRef {
  return {
    areaId: String(ticket["areaId"]),
    requesterId: String(ticket["requesterId"]),
    createdById: String(ticket["createdById"]),
    assigneeIds: (ticket["assigneeIds"] as unknown[] | undefined)?.map(String) ?? [],
    status: ticket["status"] as TicketRef["status"],
  };
}

/**
 * Techo de visibilidad del usuario, en forma de filtro de Mongo. Es el mismo
 * criterio que `canViewTicket`, pero expresado en la consulta: un ticket que no
 * puede ver nunca llega a salir de la base (spec §10.4).
 *
 * `hasGlobalReadAccess` no aparece aquí a propósito: da lectura global en
 * reportes agregados, no acceso a la conversación de tickets de otras áreas.
 */
export function visibilityFilter(actor: Actor): Filter {
  if (isAdmin(actor)) return {};
  return {
    $or: [
      { requesterId: oid(actor.id) },
      { createdById: oid(actor.id) },
      { areaId: oid(actor.areaId) },
    ],
  };
}

/** El área sobre la que puede preguntar: la suya, salvo que sea administrador. */
function resolveAreaId(actor: Actor, requested: string | undefined): string {
  if (!requested || requested === actor.areaId) return actor.areaId;
  if (isAdmin(actor)) return requested;
  throw new AppError(403, "forbidden", "Solo puedes consultar los tickets de tu área");
}

/** Traduce `scope=mine|assigned|area|unassigned|all` a un filtro (spec §12). */
export function scopeFilter(actor: Actor, query: TicketListQuery): Filter {
  switch (query.scope) {
    case "mine":
      return { $or: [{ requesterId: oid(actor.id) }, { createdById: oid(actor.id) }] };
    case "assigned":
      return { assigneeIds: oid(actor.id) };
    case "area":
      return { areaId: oid(resolveAreaId(actor, query.areaId)) };
    case "unassigned":
      return {
        areaId: oid(resolveAreaId(actor, query.areaId)),
        assigneeIds: { $size: 0 },
        status: { $in: [...ACTIVE_TICKET_STATUSES] },
      };
    case "all":
      // "Todos" no significa "todo el sistema": significa todo lo que este
      // usuario puede ver. El filtro de visibilidad lo acota más abajo.
      return query.areaId ? { areaId: oid(resolveAreaId(actor, query.areaId)) } : {};
  }
}

/** Filtros de la barra superior: estado, prioridad, responsable, categoría y búsqueda. */
export function refineFilter(query: TicketListQuery): Filter {
  const filter: Filter = {};
  if (query.status) filter["status"] = { $in: query.status };
  if (query.priority) filter["priority"] = { $in: query.priority };
  if (query.assigneeId) filter["assigneeIds"] = oid(query.assigneeId);
  if (query.categoryId) filter["categoryId"] = oid(query.categoryId);

  if (query.q) {
    // "TK-000512" o "512" buscan por número; cualquier otra cosa, por título.
    const asNumber = Number(query.q.replace(/^tk-?/i, ""));
    if (Number.isInteger(asNumber) && asNumber > 0) {
      filter["number"] = asNumber;
    } else {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter["title"] = { $regex: escaped, $options: "i" };
    }
  }

  return filter;
}

export function listFilter(actor: Actor, query: TicketListQuery): Filter {
  return { $and: [visibilityFilter(actor), scopeFilter(actor, query), refineFilter(query)] };
}

/**
 * Carga un ticket y comprueba que el usuario pueda verlo. Un ticket existente
 * pero ajeno responde 404, no 403: confirmar que existe ya sería filtrar algo.
 */
export async function loadVisibleTicket(id: string, actor: Actor): Promise<TicketDoc> {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError(404, "not_found", "Ese ticket no existe");
  }
  const ticket = (await Ticket.findById(id)) as TicketDoc | null;
  if (!ticket || !canViewTicket(actor, refOf(ticket.toObject() as LeanTicket))) {
    throw new AppError(404, "not_found", "Ese ticket no existe");
  }
  return ticket;
}
