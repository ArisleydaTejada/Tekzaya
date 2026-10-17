import { z } from "zod";
import { areaRef } from "../area";
import { avatarUrl, isoDateTime, objectId, paginated, paginationQuery } from "../common";
import { commaSeparated } from "../ticket";
import { assetEventKind, assetStatus, assetType, ASSET_STATUSES } from "./enums";
import { currencyCode } from "./money";
import { asset } from "./schemas";

// ── Garantía ──────────────────────────────────────────────────

export const WARRANTY_STATES = ["active", "expiring", "expired", "none"] as const;
export const warrantyState = z.enum(WARRANTY_STATES);
export type WarrantyState = z.infer<typeof warrantyState>;

export const WARRANTY_STATE_LABEL: Record<WarrantyState, string> = {
  active: "Vigente",
  expiring: "Vence pronto",
  expired: "Vencida",
  none: "Sin garantía",
};

/**
 * Estado de la garantía en un día dado. Se compara como fecha de calendario
 * ("YYYY-MM-DD", en la zona de la empresa) porque una garantía vence un día, no
 * a una hora: compararlo como instante haría que "vence hoy" cambiara según la
 * zona de quien mira.
 */
export function warrantyStateOf(
  warrantyUntil: string | undefined,
  today: string,
  alertDays: number,
): WarrantyState {
  if (!warrantyUntil) return "none";
  if (warrantyUntil < today) return "expired";
  return warrantyUntil <= addDaysToKey(today, alertDays) ? "expiring" : "active";
}

/** Suma días a un "YYYY-MM-DD" sin pasar por zonas horarias. */
export function addDaysToKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// ── Consulta del inventario ───────────────────────────────────

export const ASSET_SORTS = ["number", "name", "type", "status", "location", "warranty"] as const;
export const assetSort = z.enum(ASSET_SORTS);
export type AssetSort = z.infer<typeof assetSort>;

/**
 * Filtros de la lista. Solo pueden **estrechar** lo que la sesión permite ver
 * (`assetScopeFor`): pedir el área de otro no amplía nada.
 */
export const assetListQuery = paginationQuery.extend({
  /** Número (`ACT-0012` o `12`), nombre, marca, modelo o número de serie. */
  q: z.string().trim().max(120).optional(),
  /** Área responsable. */
  areaId: objectId.optional(),
  /** Área que lo usa. */
  usedByAreaId: objectId.optional(),
  type: commaSeparated(assetType).optional(),
  status: commaSeparated(assetStatus).optional(),
  location: z.string().trim().max(120).optional(),
  custodianId: objectId.optional(),
  warranty: warrantyState.optional(),
  sort: assetSort.default("number"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type AssetListQuery = z.infer<typeof assetListQuery>;

// ── Vistas ────────────────────────────────────────────────────

export const assetPerson = z.object({
  id: objectId,
  name: z.string(),
  avatarUrl: avatarUrl.optional(),
  areaId: objectId,
});
export type AssetPerson = z.infer<typeof assetPerson>;

/** Qué puede hacer quien mira; la pantalla no recalcula permisos por su cuenta. */
export const assetPermissions = z.object({
  /** Editar, mover y dar de baja. */
  manage: z.boolean(),
  /** Historial, órdenes y costos. */
  viewDetails: z.boolean(),
});
export type AssetPermissions = z.infer<typeof assetPermissions>;

/**
 * El activo tal como lo ve una persona concreta. `purchaseCost` solo viene si
 * `permissions.viewDetails`: el servidor lo quita, la pantalla no lo esconde.
 */
export const assetView = asset.extend({
  area: areaRef,
  usedByArea: areaRef.optional(),
  custodian: assetPerson.optional(),
  warranty: warrantyState,
  permissions: assetPermissions,
});
export type AssetView = z.infer<typeof assetView>;

export const assetStatusCounts = z.record(assetStatus, z.number().int().min(0));
export type AssetStatusCounts = z.infer<typeof assetStatusCounts>;

export const assetListResponse = paginated(assetView).extend({
  /**
   * Cuántos hay en cada estado con los demás filtros aplicados: alimenta el
   * resumen del panel lateral, que no debe vaciarse al filtrar por un estado.
   */
  statusCounts: assetStatusCounts,
  currency: currencyCode,
});
export type AssetListResponse = z.infer<typeof assetListResponse>;

export const assetDetail = assetView.extend({
  currency: currencyCode,
  /** Órdenes de trabajo sin terminar; solo con `viewDetails`. */
  openWorkOrders: z.number().int().min(0).optional(),
});
export type AssetDetail = z.infer<typeof assetDetail>;

/**
 * Un paso de la línea de tiempo. El servidor resuelve los nombres (persona,
 * áreas, número de OT) para que la historia se lea igual aunque alguien cambie
 * de nombre después.
 */
export const assetEventView = z.object({
  id: objectId,
  kind: assetEventKind,
  at: isoDateTime,
  actor: assetPerson.optional(),
  workOrder: z.object({ id: objectId, number: z.number().int().positive() }).optional(),
  data: z.record(z.string(), z.unknown()),
});
export type AssetEventView = z.infer<typeof assetEventView>;

export const assetEventsResponse = z.object({ items: z.array(assetEventView) });
export type AssetEventsResponse = z.infer<typeof assetEventsResponse>;

export const assetPeopleResponse = z.object({ items: z.array(assetPerson) });
export const assetLocationsResponse = z.object({ items: z.array(z.string()) });

/** Para que el resumen siempre tenga los tres estados, aunque alguno esté en cero. */
export function emptyStatusCounts(): AssetStatusCounts {
  return Object.fromEntries(ASSET_STATUSES.map((status) => [status, 0])) as AssetStatusCounts;
}
