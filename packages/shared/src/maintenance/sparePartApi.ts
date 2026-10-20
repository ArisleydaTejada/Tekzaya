import { z } from "zod";
import { areaRef } from "../area";
import { isoDateTime, objectId, paginated, paginationQuery } from "../common";
import { assetPerson } from "./assetApi";
import { partUnit, stockMovementKind } from "./enums";
import { currencyCode, money } from "./money";
import { sparePart } from "./schemas";

// Plan A4: saber qué hay, qué se gasta y cuándo reponer. El stock es un libro
// de movimientos y el campo `stock` su suma en caché (plan §2.3).

const text = (max: number) => z.string().trim().min(1, "Escribe algo").max(max);

/** Bajo mínimo: quedan menos de las que el área decidió tener siempre. */
export function isLowStock(part: { stock: number; minStock: number }): boolean {
  return part.stock < part.minStock;
}

// ── Consulta de la lista ──────────────────────────────────────

export const SPARE_PART_STATES = ["active", "inactive", "all"] as const;
export const sparePartState = z.enum(SPARE_PART_STATES);
export type SparePartState = z.infer<typeof sparePartState>;

export const SPARE_PART_SORTS = ["number", "name", "stock", "value"] as const;
export const sparePartSort = z.enum(SPARE_PART_SORTS);
export type SparePartSort = z.infer<typeof sparePartSort>;

/** Los filtros solo estrechan el alcance de la sesión: el almacén de su área. */
export const sparePartListQuery = paginationQuery.extend({
  /** Número (`REP-0003` o `3`) o nombre. */
  q: z.string().trim().max(120).optional(),
  areaId: objectId.optional(),
  /** Solo los que están bajo mínimo. */
  low: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  state: sparePartState.default("active"),
  sort: sparePartSort.default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type SparePartListQuery = z.input<typeof sparePartListQuery>;
export type ParsedSparePartListQuery = z.output<typeof sparePartListQuery>;

// ── Vistas ────────────────────────────────────────────────────

export const sparePartView = sparePart.extend({
  area: areaRef,
  low: z.boolean(),
  /** Stock × costo promedio: lo que vale lo que hay en el almacén. */
  stockValue: money,
  permissions: z.object({
    /** Editar, entradas y ajustes: el supervisor del área. */
    manage: z.boolean(),
  }),
});
export type SparePartView = z.infer<typeof sparePartView>;

export const sparePartListResponse = paginated(sparePartView).extend({
  /** Con los filtros aplicados, salvo "bajo mínimo": el resumen no se vacía al filtrar. */
  summary: z.object({
    total: z.number().int().min(0),
    low: z.number().int().min(0),
    stockValue: money,
  }),
  currency: currencyCode,
  /** Áreas en las que quien mira puede dar de alta repuestos. */
  manageableAreas: z.array(areaRef),
});
export type SparePartListResponse = z.infer<typeof sparePartListResponse>;

export const sparePartDetail = sparePartView.extend({ currency: currencyCode });
export type SparePartDetail = z.infer<typeof sparePartDetail>;

/** Un paso del libro, con el saldo que dejó. */
export const stockMovementView = z.object({
  id: objectId,
  kind: stockMovementKind,
  /** Con signo: positivo entra, negativo sale. */
  qty: z.number().int(),
  unitCost: money,
  /** Stock que quedó después de este movimiento. */
  balance: z.number().int(),
  at: isoDateTime,
  actor: assetPerson.optional(),
  workOrder: z.object({ id: objectId, number: z.number().int().positive() }).optional(),
  reason: z.string().optional(),
});
export type StockMovementView = z.infer<typeof stockMovementView>;

export const stockMovementsResponse = paginated(stockMovementView);
export type StockMovementsResponse = z.infer<typeof stockMovementsResponse>;

// ── Entradas ──────────────────────────────────────────────────

/** Unidades de un movimiento: enteras, y con un techo que atrapa un cero de más. */
const units = z.number().int().max(100_000, "Demasiadas unidades para un solo movimiento");

export const createSparePartInput = z.object({
  name: text(120),
  areaId: objectId,
  unit: partUnit,
  minStock: z.number().int().min(0).max(100_000),
  /** Existencias con las que llega al almacén; se registran como una entrada. */
  initialStock: z
    .object({ qty: units.min(1), unitCost: money })
    .optional(),
});
export type CreateSparePartInput = z.infer<typeof createSparePartInput>;

/**
 * El área no cambia: el libro del repuesto es de su almacén. Desactivar lo saca
 * del selector de las órdenes; nada se borra (plan §2.3).
 */
export const updateSparePartInput = z.object({
  name: text(120).optional(),
  unit: partUnit.optional(),
  minStock: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSparePartInput = z.infer<typeof updateSparePartInput>;

/**
 * Lo que el supervisor registra a mano. Una **entrada** trae su costo, que
 * mueve el promedio ponderado; un **ajuste** (conteo físico, merma) corrige
 * la cantidad al costo actual y exige motivo. Consumos y devoluciones solo
 * salen de una orden de trabajo.
 */
export const createStockMovementInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("in"),
    qty: units.min(1, "Mínimo una unidad"),
    unitCost: money,
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({
    kind: z.literal("adjust"),
    qty: units.min(-100_000).refine((n) => n !== 0, "El ajuste no puede ser cero"),
    reason: text(300),
  }),
]);
export type CreateStockMovementInput = z.infer<typeof createStockMovementInput>;
