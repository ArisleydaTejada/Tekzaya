import { z } from "zod";
import { objectId } from "../common";
import { currencyCode, money } from "./money";

/**
 * Ajustes del módulo de mantenimiento; solo los toca el administrador (plan §3).
 *
 * La tarifa es **por área, no por persona**: una tarifa por técnico expondría
 * salarios a cualquiera que vea el costo de una orden (plan A3).
 */
export const maintenanceSettings = z.object({
  /** Una sola moneda para todo el sistema; cambiarla no convierte los montos guardados. */
  currency: currencyCode,
  /** Tarifa por hora de mano de obra, en centavos, por id de área. */
  laborRates: z.record(objectId, money),
  /** Con cuántos días de antelación se avisa que vence una garantía. */
  warrantyAlertDays: z.number().int().min(1).max(365),
  /** "Fallas repetidas": `count` correctivas dentro de `windowDays`. */
  repeatedFailure: z.object({
    count: z.number().int().min(2).max(20),
    windowDays: z.number().int().min(7).max(730),
  }),
  /** Antelación por defecto con la que un plan nuevo genera su OT. */
  preventiveLeadDays: z.number().int().min(0).max(60),
});
export type MaintenanceSettings = z.infer<typeof maintenanceSettings>;

export const DEFAULT_MAINTENANCE_SETTINGS: MaintenanceSettings = {
  currency: "USD",
  laborRates: {},
  warrantyAlertDays: 30,
  repeatedFailure: { count: 3, windowDays: 90 },
  preventiveLeadDays: 7,
};
