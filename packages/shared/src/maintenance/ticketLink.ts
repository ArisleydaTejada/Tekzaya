import { z } from "zod";
import { areaRef } from "../area";
import { isoDateTime, objectId } from "../common";
import { assetStatus, assetType, workOrderStatus, workOrderType } from "./enums";

// Plan A2: el puente entre los dos módulos. Un ticket puede señalar el equipo
// afectado y convertirse en una orden de trabajo correctiva; la falla del equipo
// nace con la OT, no con el ticket.

// ── Selector de equipos ───────────────────────────────────────

/**
 * Grupos del selector, en el orden en que se ofrecen: primero lo que la persona
 * tiene a su cargo, luego lo que usa su área y, al final, el resto de lo que
 * quien vincula puede vincular.
 */
export const ASSET_PICK_GROUPS = ["custodian", "area", "other"] as const;
export const assetPickGroup = z.enum(ASSET_PICK_GROUPS);
export type AssetPickGroup = z.infer<typeof assetPickGroup>;

export const assetPickerQuery = z.object({
  /** Número (`ACT-0012`), nombre, marca, modelo, serie o ubicación. */
  q: z.string().trim().max(120).optional(),
  /**
   * Ticket ya creado en el que se vincula. Sin él, el selector es el del
   * formulario de nuevo ticket: el ticket será de quien pregunta.
   */
  ticketId: objectId.optional(),
});
export type AssetPickerQuery = z.infer<typeof assetPickerQuery>;

export const assetPickerItem = z.object({
  id: objectId,
  number: z.number().int().positive(),
  name: z.string(),
  type: assetType,
  status: assetStatus,
  location: z.string(),
  /** Área responsable: si no es la elegida en el ticket, la pantalla la sugiere. */
  area: areaRef,
  group: assetPickGroup,
});
export type AssetPickerItem = z.infer<typeof assetPickerItem>;

export const assetPickerResponse = z.object({
  /** Para quién se agrupa: el solicitante del ticket, o quien pregunta. */
  person: z.object({ id: objectId, name: z.string() }),
  items: z.array(assetPickerItem),
});
export type AssetPickerResponse = z.infer<typeof assetPickerResponse>;

// ── Acciones sobre el ticket ──────────────────────────────────

/** `null` quita el equipo del ticket. */
export const linkTicketAssetInput = z.object({ assetId: objectId.nullable() });
export type LinkTicketAssetInput = z.infer<typeof linkTicketAssetInput>;

/**
 * Convertir el ticket en una OT correctiva. Título y descripción salen del
 * ticket si no se escriben; `outOfService` es la pregunta "¿el equipo queda
 * fuera de servicio?", que decide si empieza a contar tiempo de parada.
 */
export const createWorkOrderFromTicketInput = z.object({
  title: z.string().trim().min(5, "Mínimo 5 caracteres").max(120, "Máximo 120 caracteres").optional(),
  description: z.string().trim().max(5000).optional(),
  outOfService: z.boolean(),
});
export type CreateWorkOrderFromTicketInput = z.infer<typeof createWorkOrderFromTicketInput>;

// ── Lo que el detalle del ticket muestra ──────────────────────

export const ticketAssetFailure = z.object({
  at: isoDateTime,
  title: z.string(),
  workOrder: z.object({ id: objectId, number: z.number().int().positive(), status: workOrderStatus }).optional(),
});
export type TicketAssetFailure = z.infer<typeof ticketAssetFailure>;

/**
 * La tarjeta del equipo en el ticket. `canOpen` dice si quien mira puede abrir
 * su ficha; `recentFailures` solo viaja hacia quien ve el historial del equipo
 * (plan §3): las averías son información del área que lo mantiene.
 */
export const ticketAsset = z.object({
  id: objectId,
  number: z.number().int().positive(),
  name: z.string(),
  type: assetType,
  status: assetStatus,
  location: z.string(),
  area: areaRef,
  canOpen: z.boolean(),
  recentFailures: z.array(ticketAssetFailure).optional(),
});
export type TicketAsset = z.infer<typeof ticketAsset>;

/** Las OT que salieron del ticket; solo para quien puede verlas. */
export const ticketWorkOrderRef = z.object({
  id: objectId,
  number: z.number().int().positive(),
  type: workOrderType,
  status: workOrderStatus,
  title: z.string(),
  createdAt: isoDateTime,
});
export type TicketWorkOrderRef = z.infer<typeof ticketWorkOrderRef>;
