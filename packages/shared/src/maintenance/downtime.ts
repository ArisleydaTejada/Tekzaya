import { businessMinutesBetween, type BusinessCalendar } from "../sla/businessTime";
import type { AssetStatus } from "./enums";

/** Un cambio de estado del activo, tal como lo deja `asset_events`. */
export interface AssetStatusChange {
  status: AssetStatus;
  at: Date;
}

/**
 * Minutos **laborables** que el activo pasó en `status` dentro de [from, to).
 *
 * Una impresora que falla el viernes a las 18:00 y se repara el lunes a las 9:00
 * no estuvo "60 horas parada" para nadie: estuvo una hora laborable. Por eso se
 * mide con el mismo motor que el SLA (plan A6).
 *
 * `changes` va en orden cronológico; cada cambio rige hasta el siguiente. Antes
 * del primero el activo no existía, así que ese tramo no cuenta para nada.
 */
export function minutesInStatus(
  changes: readonly AssetStatusChange[],
  status: AssetStatus,
  from: Date,
  to: Date,
  calendar: BusinessCalendar,
): number {
  let total = 0;
  for (const [index, change] of changes.entries()) {
    if (change.status !== status) continue;
    const next = changes[index + 1];
    const start = Math.max(change.at.getTime(), from.getTime());
    const end = Math.min(next ? next.at.getTime() : to.getTime(), to.getTime());
    if (end > start) total += businessMinutesBetween(new Date(start), new Date(end), calendar);
  }
  return total;
}

/** Tiempo de parada: lo que el activo estuvo *En reparación*. */
export function downtimeMinutes(
  changes: readonly AssetStatusChange[],
  from: Date,
  to: Date,
  calendar: BusinessCalendar,
): number {
  return minutesInStatus(changes, "in_repair", from, to, calendar);
}
