import { z } from "zod";
import { isoDateTime, objectId } from "../common";
import { REPLACEMENT_REASONS } from "./advice";
import { currencyCode, money } from "./money";

// Lo que viaja de las dos funciones de IA del módulo 2 (plan A7). Igual que en
// el módulo 1, **puede no haber respuesta**: sin clave, apagada o sin datos
// suficientes, la respuesta es `null` y la pantalla no monta la tarjeta.

export const replacementReason = z.enum(REPLACEMENT_REASONS);

export const REPLACEMENT_REASON_LABEL: Record<z.infer<typeof replacementReason>, string> = {
  repeated_failures: "Fallas repetidas",
  repair_cost: "Reparaciones caras",
};

/**
 * ¿Reparar o reemplazar? Todos los números los calcula el servidor a partir del
 * historial del equipo; `explanation` es lo único que escribe la IA, y es
 * `null` si no contestó o citó una cifra que no estaba en los datos.
 */
export const replacementAdvice = z.object({
  reasons: z.array(replacementReason).min(1),
  /** Correctivas no canceladas en los últimos `windowDays` días. */
  failuresInWindow: z.number().int().min(0),
  windowDays: z.number().int().positive(),
  failureThreshold: z.number().int().positive(),
  /** Correctivas no canceladas de toda la vida del equipo. */
  failuresTotal: z.number().int().min(0),
  /** Costo de las correctivas completadas, en centavos. */
  repairCost: money,
  purchaseCost: money.nullable(),
  /** `repairCost / purchaseCost`, o `null` sin precio de compra. */
  repairShare: z.number().min(0).nullable(),
  /** Meses desde la compra, o `null` sin fecha de compra. */
  ageMonths: z.number().int().min(0).nullable(),
  explanation: z.string().nullable(),
  currency: currencyCode,
});
export type ReplacementAdvice = z.infer<typeof replacementAdvice>;

/** `null`: el equipo no es candidato, está de baja, o no hay IA. */
export const replacementAdviceResponse = z.object({ advice: replacementAdvice.nullable() });
export type ReplacementAdviceResponse = z.infer<typeof replacementAdviceResponse>;

/** Una reparación pasada que la IA juzgó parecida; su costo es el guardado en la OT. */
export const repairEstimateCase = z.object({
  id: objectId,
  number: z.number().int().positive(),
  title: z.string(),
  assetName: z.string(),
  cost: money,
  completedAt: isoDateTime,
});
export type RepairEstimateCase = z.infer<typeof repairEstimateCase>;

export const repairEstimate = z.object({
  /** Percentil 25, mediana y percentil 75 de los casos, en centavos. */
  low: money,
  median: money,
  high: money,
  cases: z.array(repairEstimateCase).min(3),
  /** Cuántas reparaciones completadas se le mostraron a la IA para elegir. */
  poolSize: z.number().int().min(0),
  currency: currencyCode,
});
export type RepairEstimate = z.infer<typeof repairEstimate>;

/**
 * Por qué no hay estimación, para decirlo en vez de dejar la tarjeta vacía:
 * pocas reparaciones del tipo de equipo, pocas parecidas, o la IA no contestó.
 */
export const REPAIR_ESTIMATE_MISSES = ["not_enough_history", "not_enough_similar", "no_answer"] as const;
export const repairEstimateMiss = z.enum(REPAIR_ESTIMATE_MISSES);
export type RepairEstimateMiss = z.infer<typeof repairEstimateMiss>;

export const repairEstimateResponse = z.object({
  estimate: repairEstimate.nullable(),
  reason: repairEstimateMiss.nullable(),
});
export type RepairEstimateResponse = z.infer<typeof repairEstimateResponse>;
