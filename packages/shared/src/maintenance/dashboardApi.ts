import { z } from "zod";
import { areaRef } from "../area";
import { objectId } from "../common";
import { partUnit } from "./enums";
import { currencyCode } from "./money";

// Plan A6: el panel de mantenimiento. Página propia, no mezclada con el tablero de
// tickets: cinco números y tres listas de cosas que piden atención.

export const maintenanceDashboardQuery = z.object({
  /** Solo para quien ve todas las áreas; el resto ve siempre la suya. */
  areaId: objectId.optional(),
});
export type MaintenanceDashboardQuery = z.infer<typeof maintenanceDashboardQuery>;

const assetLine = z.object({ id: objectId, number: z.number().int().positive(), name: z.string() });

export const maintenanceDashboard = z.object({
  /** El área del panel; ausente cuando son todas. */
  area: areaRef.optional(),
  /** Áreas que mantienen equipos, para el selector de quien ve todas; vacía para el resto. */
  areas: z.array(areaRef),
  currency: currencyCode,
  kpis: z.object({
    openWorkOrders: z.number().int().min(0),
    /** Preventivos programados de lunes a domingo de esta semana, y cuántos ya se hicieron. */
    preventivesThisWeek: z.object({ total: z.number().int().min(0), done: z.number().int().min(0) }),
    preventivesOverdue: z.number().int().min(0),
    lowStockParts: z.number().int().min(0),
    /** Centavos: repuestos y servicios externos de las OT completadas este mes. */
    monthCost: z.number().int().min(0),
  }),
  alerts: z.object({
    warranty: z.array(assetLine.extend({ warrantyUntil: z.iso.date() })),
    repeatedFailures: z.array(assetLine.extend({ failures: z.number().int().positive() })),
    lowStock: z.array(
      z.object({
        id: objectId,
        number: z.number().int().positive(),
        name: z.string(),
        unit: partUnit,
        stock: z.number().int().min(0),
        minStock: z.number().int().min(0),
      }),
    ),
  }),
  /** Las reglas con que se calcularon las alertas, para explicarlas en pantalla. */
  rules: z.object({
    warrantyAlertDays: z.number().int().positive(),
    repeatedFailure: z.object({ count: z.number().int().positive(), windowDays: z.number().int().positive() }),
  }),
});
export type MaintenanceDashboard = z.infer<typeof maintenanceDashboard>;
