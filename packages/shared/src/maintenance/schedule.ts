import { addDaysToKey } from "./assetApi";
import { PLAN_UNIT_LABEL, type PlanUnit } from "./enums";

/**
 * Recurrencia de los planes preventivos (plan A5). Todo se calcula con fechas
 * de calendario "YYYY-MM-DD" en la zona de la empresa: un mantenimiento cae un
 * día, no a una hora, y así "vence hoy" no depende de la zona de quien mira.
 */

const parse = (key: string) => key.split("-").map(Number) as [number, number, number];
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * Suma `every` unidades a una fecha. Los meses se cuentan en el calendario y,
 * si el día no existe, se queda en el último del mes: 31 de enero + 1 mes es
 * 28 (o 29) de febrero, no 3 de marzo.
 */
export function addPeriod(key: string, every: number, unit: PlanUnit): string {
  if (unit === "day") return addDaysToKey(key, every);
  if (unit === "week") return addDaysToKey(key, every * 7);
  const [year, month, day] = parse(key);
  const index = year * 12 + (month - 1) + every;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  const nextDay = Math.min(day, daysInMonth(nextYear, nextMonth));
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

/** El día en que el trabajo diario genera la OT: `leadDays` antes de la fecha. */
export function generationDate(nextDueAt: string, leadDays: number): string {
  return addDaysToKey(nextDueAt, -leadDays);
}

/** ¿Toca generar la OT de esta ronda hoy (o tocaba y no se generó)? */
export function isPlanDue(plan: { nextDueAt: string; leadDays: number }, today: string): boolean {
  return generationDate(plan.nextDueAt, plan.leadDays) <= today;
}

/**
 * La siguiente ronda de un plan `fixed`: sigue el calendario desde la fecha de
 * inicio, aunque el mantenimiento se haya hecho tarde (lo que exige una norma o
 * un contrato). Se cuenta desde `startsOn`, no sumando a la ronda anterior,
 * para que el día 31 no vaya derivando a 28 mes a mes.
 *
 * Si el trabajo estuvo parado y quedaron rondas atrás, salta a la primera
 * posterior a `today`: se genera una OT por la ronda vencida, no una por cada
 * mes perdido.
 */
export function nextFixedDue(
  plan: { startsOn: string; every: number; unit: PlanUnit },
  after: string,
  today: string,
): string {
  const floor = after > today ? after : today;
  for (let n = 1; ; n++) {
    const candidate = addPeriod(plan.startsOn, n * plan.every, plan.unit);
    if (candidate > floor) return candidate;
  }
}

/**
 * Rondas de un plan `fixed` que caen entre dos fechas (ambas incluidas), a
 * partir de `nextDueAt`: lo que el calendario muestra como programado.
 */
export function fixedOccurrences(
  plan: { startsOn: string; nextDueAt: string; every: number; unit: PlanUnit },
  from: string,
  to: string,
): string[] {
  const dates: string[] = [];
  if (plan.nextDueAt >= from && plan.nextDueAt <= to) dates.push(plan.nextDueAt);
  for (let n = 1; ; n++) {
    const candidate = addPeriod(plan.startsOn, n * plan.every, plan.unit);
    if (candidate > to) break;
    if (candidate > plan.nextDueAt && candidate >= from) dates.push(candidate);
  }
  return dates;
}

/** "Cada 3 meses", "Cada semana". */
export function describeEvery(every: number, unit: PlanUnit): string {
  const label = PLAN_UNIT_LABEL[unit];
  return every === 1 ? `Cada ${label.one}` : `Cada ${every} ${label.many}`;
}
