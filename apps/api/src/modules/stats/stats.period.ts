import {
  wallClockIn,
  zonedTimeToUtc,
  type BusinessHours,
  type StatsPeriod,
  type StatsQuery,
  type StatsRange,
} from "@tekzaya/shared";
import { AppError } from "../../middleware/errors";

/**
 * Los períodos se cortan por **calendario de la empresa**, no por ventana móvil:
 * "Mes" es el mes en curso, no los últimos treinta días. Es como se lee una KPI de
 * tablero ("resueltos este mes") y es lo único que cuadra con una consulta a mano
 * a la base, que es el DoD de esta fase.
 *
 * La zona horaria es la de la jornada (spec §5.3): dos personas en husos distintos
 * ven el mismo recuento, igual que ven el mismo vencimiento de SLA.
 */
const MAX_RANGE_DAYS = 400;

function startOfDay(instant: Date, zone: string): Date {
  return zonedTimeToUtc(wallClockIn(instant, zone), 0, 0, zone);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Lunes de la semana en curso; la semana laboral empieza en lunes (`days: [1..5]`). */
function startOfWeek(instant: Date, zone: string): Date {
  const midnight = startOfDay(instant, zone);
  const clock = wallClockIn(midnight, zone);
  const weekday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay();
  const backToMonday = (weekday + 6) % 7;
  const target = wallClockIn(addDays(midnight, -backToMonday), zone);
  return zonedTimeToUtc(target, 0, 0, zone);
}

export function resolveRange(query: StatsQuery, hours: BusinessHours, now: Date): StatsRange {
  const zone = hours.timezone;
  const to = now;

  const from = ((): Date => {
    switch (query.period) {
      case "day":
        return startOfDay(now, zone);
      case "week":
        return startOfWeek(now, zone);
      case "month": {
        const clock = wallClockIn(now, zone);
        return zonedTimeToUtc({ ...clock, day: 1 }, 0, 0, zone);
      }
      case "year": {
        const clock = wallClockIn(now, zone);
        return zonedTimeToUtc({ ...clock, month: 1, day: 1 }, 0, 0, zone);
      }
      case "range":
        return parseDay(query.from!, zone);
    }
  })();

  if (query.period === "range") {
    // El día final entra completo: quien pide "del 1 al 7" espera el día 7 incluido.
    const end = addDays(parseDay(query.to!, zone), 1);
    if (end <= from) {
      throw new AppError(422, "validation_error", "La fecha de fin va después de la de inicio");
    }
    if (end.getTime() - from.getTime() > MAX_RANGE_DAYS * 86_400_000) {
      throw new AppError(422, "validation_error", `El rango no puede pasar de ${MAX_RANGE_DAYS} días`);
    }
    return { period: "range", from: from.toISOString(), to: end.toISOString() };
  }

  return { period: query.period, from: from.toISOString(), to: to.toISOString() };
}

function parseDay(value: string, zone: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return zonedTimeToUtc({ year: year!, month: month!, day: day! }, 0, 0, zone);
}

/** Ventana como par de fechas, que es lo que necesita el `$match` de Mongo. */
export function windowOf(range: StatsRange): { from: Date; to: Date } {
  return { from: new Date(range.from), to: new Date(range.to) };
}

/**
 * Granularidad de la serie temporal: la elige el servidor según lo ancha que sea la
 * ventana, para que una gráfica de un año no devuelva 365 puntos ilegibles ni la de
 * un día devuelva uno solo.
 */
export function bucketFor(range: StatsRange): "hour" | "day" | "week" | "month" {
  const days = (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000;
  if (days <= 2) return "hour";
  if (days <= 62) return "day";
  if (days <= 200) return "week";
  return "month";
}

export const PERIOD_FILE_LABEL: Record<StatsPeriod, string> = {
  day: "dia",
  week: "semana",
  month: "mes",
  year: "ano",
  range: "rango",
};

/**
 * El mismo período, una vuelta atrás, para la comparación del paso 8 del
 * constructor de reportes (spec §7.8.3). Se corta por calendario igual que el
 * período en curso —"el mes pasado" empieza el día 1— pero se queda con la **misma
 * duración transcurrida**: comparar quince días de marzo contra los treinta y uno
 * de febrero diría que todo ha bajado a la mitad.
 */
export function previousRange(range: StatsRange, hours: BusinessHours): StatsRange {
  const zone = hours.timezone;
  const from = new Date(range.from);
  const span = new Date(range.to).getTime() - from.getTime();

  if (range.period === "range") {
    return {
      period: "range",
      from: new Date(from.getTime() - span).toISOString(),
      to: range.from,
    };
  }

  const clock = wallClockIn(from, zone);
  const start = ((): Date => {
    switch (range.period) {
      case "day":
        return startOfDay(new Date(from.getTime() - 86_400_000), zone);
      case "week":
        // Se vuelve a truncar a medianoche: restar siete días en bruto cae una hora
        // antes o después si en medio hubo cambio de horario de verano.
        return startOfDay(new Date(from.getTime() - 7 * 86_400_000), zone);
      case "month": {
        const month = clock.month === 1 ? 12 : clock.month - 1;
        const year = clock.month === 1 ? clock.year - 1 : clock.year;
        return zonedTimeToUtc({ year, month, day: 1 }, 0, 0, zone);
      }
      default:
        return zonedTimeToUtc({ year: clock.year - 1, month: 1, day: 1 }, 0, 0, zone);
    }
  })();

  return {
    period: range.period,
    from: start.toISOString(),
    to: new Date(start.getTime() + span).toISOString(),
  };
}
