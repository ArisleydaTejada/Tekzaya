import {
  businessMinutesBetween,
  wallClockIn,
  zonedTimeToUtc,
  type BusinessCalendar,
} from "../sla/businessTime";
import type { AssetStatusChange } from "./downtime";
import type { AssetStatus } from "./enums";

// Plan A6: MTBF, MTTR y disponibilidad. Todo se mide en horas **laborables**, con
// el mismo motor que el SLA: una impresora que falla el viernes a las 18:00 y se
// repara el lunes a las 9:00 estuvo una hora parada, no sesenta.

/** Un tramo en el que el equipo estuvo en un estado. `to` es exclusivo. */
export interface StatusInterval {
  status: AssetStatus;
  from: Date;
  to: Date;
}

/**
 * Del historial de cambios (en orden cronológico) a tramos: cada cambio rige hasta
 * el siguiente y el último hasta `until`. Antes del primer cambio el equipo no
 * existía, así que ese tiempo no es de nadie.
 */
export function statusIntervals(changes: readonly AssetStatusChange[], until: Date): StatusInterval[] {
  const intervals: StatusInterval[] = [];
  for (const [index, change] of changes.entries()) {
    const next = changes[index + 1];
    const end = next ? next.at : until;
    if (end.getTime() <= change.at.getTime()) continue;
    // Dos tramos seguidos en el mismo estado son uno solo: un "operativo → operativo"
    // no parte una disponibilidad en dos.
    const last = intervals.at(-1);
    if (last && last.status === change.status && last.to.getTime() === change.at.getTime()) {
      last.to = end;
    } else {
      intervals.push({ status: change.status, from: change.at, to: end });
    }
  }
  return intervals;
}

/** Minutos laborables entre dos instantes. */
export type BusinessClock = (from: Date, to: Date) => number;

/**
 * Reloj de minutos laborables con los días ya contados. Un reporte de un año sobre
 * mil equipos pediría millones de días al motor del SLA; así cada consulta cuesta
 * una búsqueda binaria y, como mucho, un día de cálculo en cada extremo.
 */
export function businessClock(calendar: BusinessCalendar, from: Date, to: Date): BusinessClock {
  const zone = calendar.hours.timezone;
  const starts: number[] = [];
  const cumulative: number[] = [];

  let day = wallClockIn(from, zone);
  let start = zonedTimeToUtc(day, 0, 0, zone);
  let total = 0;
  // Un día más al final para que `to` caiga siempre dentro de la tabla.
  while (start.getTime() <= to.getTime() + 86_400_000) {
    starts.push(start.getTime());
    cumulative.push(total);
    const next = new Date(Date.UTC(day.year, day.month - 1, day.day + 1));
    day = { ...day, year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
    const nextStart = zonedTimeToUtc(day, 0, 0, zone);
    total += businessMinutesBetween(start, nextStart, calendar);
    start = nextStart;
  }

  const at = (instant: Date): number => {
    const ms = instant.getTime();
    if (!starts.length || ms < starts[0]! || ms > starts.at(-1)!) return Number.NaN;
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (starts[middle]! <= ms) low = middle;
      else high = middle - 1;
    }
    return cumulative[low]! + businessMinutesBetween(new Date(starts[low]!), instant, calendar);
  };

  return (a, b) => {
    if (b.getTime() <= a.getTime()) return 0;
    const left = at(a);
    const right = at(b);
    // Fuera de la tabla (no debería pasar) se calcula sin atajos.
    if (Number.isNaN(left) || Number.isNaN(right)) return businessMinutesBetween(a, b, calendar);
    return right - left;
  };
}

/** Minutos laborables en `status` dentro de [from, to). */
export function minutesInWindow(
  intervals: readonly StatusInterval[],
  status: AssetStatus,
  from: Date,
  to: Date,
  clock: BusinessClock,
): number {
  let total = 0;
  for (const interval of intervals) {
    if (interval.status !== status) continue;
    const start = Math.max(interval.from.getTime(), from.getTime());
    const end = Math.min(interval.to.getTime(), to.getTime());
    if (end > start) total += clock(new Date(start), new Date(end));
  }
  return total;
}

/** Una parada: un tramo *En reparación* que ya terminó (el equipo volvió a operar o se dio de baja). */
export interface RepairEpisode {
  from: Date;
  to: Date;
}

/** Las paradas terminadas; la que sigue abierta todavía no es una reparación. */
export function repairEpisodes(intervals: readonly StatusInterval[]): RepairEpisode[] {
  return intervals
    .filter((interval, index) => interval.status === "in_repair" && index < intervals.length - 1)
    .map((interval) => ({ from: interval.from, to: interval.to }));
}

/** MTBF en horas: tiempo operativo ÷ fallas. Sin fallas no hay media que dar. */
export function mtbfHours(operationalMinutes: number, failures: number): number | null {
  return failures > 0 ? operationalMinutes / 60 / failures : null;
}

/** MTTR en horas: tiempo de las reparaciones ÷ número de reparaciones. */
export function mttrHours(repairMinutes: readonly number[]): number | null {
  if (!repairMinutes.length) return null;
  return repairMinutes.reduce((sum, minutes) => sum + minutes, 0) / 60 / repairMinutes.length;
}

/** Disponibilidad en %: operativo ÷ (operativo + en reparación). Lo que está de baja no cuenta. */
export function availabilityPercent(operationalMinutes: number, repairMinutes: number): number | null {
  const total = operationalMinutes + repairMinutes;
  return total > 0 ? (operationalMinutes / total) * 100 : null;
}
