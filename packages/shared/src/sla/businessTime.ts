import type { BusinessHours } from "../settings";

export interface BusinessCalendar {
  hours: BusinessHours;
  /** Festivos como "YYYY-MM-DD", en el calendario de la zona de la empresa. */
  holidays: readonly string[];
}

/** Corta el bucle si una configuración imposible (p. ej. `days: []`) nunca abre jornada. */
const MAX_DAYS_SCANNED = 400;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(zone, formatter);
  }
  return formatter;
}

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

interface WallClock extends CalendarDate {
  hour: number;
  minute: number;
  second: number;
}

/** Qué hora marca el reloj de pared de `zone` en ese instante. */
export function wallClockIn(instant: Date, zone: string): WallClock {
  const parts = formatterFor(zone).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const hour = value("hour");
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    // Intl puede devolver 24 para la medianoche según el entorno.
    hour: hour === 24 ? 0 : hour,
    minute: value("minute"),
    second: value("second"),
  };
}

function offsetMsAt(instant: Date, zone: string): number {
  const clock = wallClockIn(instant, zone);
  const asIfUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  return asIfUtc - instant.getTime();
}

/**
 * Inverso de `wallClockIn`: del reloj de pared de una zona al instante UTC.
 * Se calcula el desfase y se corrige una vez, porque en los cambios de horario
 * de verano el desfase del primer intento puede no ser el definitivo.
 */
export function zonedTimeToUtc(
  date: CalendarDate,
  hour: number,
  minute: number,
  zone: string,
): Date {
  const asIfUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  const firstOffset = offsetMsAt(new Date(asIfUtc), zone);
  let instant = asIfUtc - firstOffset;
  const secondOffset = offsetMsAt(new Date(instant), zone);
  if (secondOffset !== firstOffset) instant = asIfUtc - secondOffset;
  return new Date(instant);
}

function nextDay(date: CalendarDate): CalendarDate {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

/** 1 = lunes … 7 = domingo, como `businessHours.days`. */
function weekdayOf(date: CalendarDate): number {
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function dateKey(date: CalendarDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function parseHourMinute(value: string): { hour: number; minute: number } {
  const [hour = "0", minute = "0"] = value.split(":");
  return { hour: Number(hour), minute: Number(minute) };
}

interface DayWindow {
  startMs: number;
  endMs: number;
}

interface ZonedDay extends DayWindow {
  /** Medianoche de ese día en la zona de la empresa. */
  midnightMs: number;
}

/**
 * Las horas de un día concreto en una zona son siempre las mismas, y obtenerlas
 * cuesta seis llamadas a `Intl`. Un reporte de 10 000 tickets recorre los mismos
 * pocos cientos de días una y otra vez: sin esta caché, la lista del período con
 * un filtro de horas tardaba 3,4 s; el umbral del spec §13 es 2 s.
 */
const zonedDayCache = new Map<string, ZonedDay>();
const ZONED_DAY_CACHE_LIMIT = 20_000;

function zonedDay(date: CalendarDate, hours: BusinessHours): ZonedDay {
  const key = `${hours.timezone}|${hours.start}|${hours.end}|${dateKey(date)}`;
  const cached = zonedDayCache.get(key);
  if (cached) return cached;

  const open = parseHourMinute(hours.start);
  const close = parseHourMinute(hours.end);
  const day: ZonedDay = {
    startMs: zonedTimeToUtc(date, open.hour, open.minute, hours.timezone).getTime(),
    endMs: zonedTimeToUtc(date, close.hour, close.minute, hours.timezone).getTime(),
    midnightMs: zonedTimeToUtc(date, 0, 0, hours.timezone).getTime(),
  };
  // Un tope, no una política de expulsión: basta con que no crezca sin límite.
  if (zonedDayCache.size >= ZONED_DAY_CACHE_LIMIT) zonedDayCache.clear();
  zonedDayCache.set(key, day);
  return day;
}

/** Ventana laborable de ese día, o `null` si es fin de semana o festivo. */
function windowFor(date: CalendarDate, calendar: BusinessCalendar): DayWindow | null {
  const { hours, holidays } = calendar;
  if (!hours.days.includes(weekdayOf(date))) return null;
  if (holidays.includes(dateKey(date))) return null;

  const { startMs, endMs } = zonedDay(date, hours);
  return { startMs, endMs };
}

/**
 * Suma minutos de trabajo saltando noches, fines de semana y festivos.
 * Si `from` cae fuera de la jornada, el reloj empieza a correr en la siguiente apertura.
 */
export function addBusinessMinutes(
  from: Date,
  minutes: number,
  calendar: BusinessCalendar,
): Date {
  if (minutes <= 0) return new Date(from.getTime());

  let remainingMs = minutes * 60_000;
  let date: CalendarDate = wallClockIn(from, calendar.hours.timezone);
  // A partir del segundo día el corte deja de importar: se empieza al abrir.
  let cursorMs = from.getTime();

  for (let scanned = 0; scanned < MAX_DAYS_SCANNED; scanned++) {
    const window = windowFor(date, calendar);
    if (window) {
      const startMs = Math.max(cursorMs, window.startMs);
      if (startMs < window.endMs) {
        const availableMs = window.endMs - startMs;
        if (availableMs >= remainingMs) return new Date(startMs + remainingMs);
        remainingMs -= availableMs;
      }
    }
    date = nextDay(date);
    cursorMs = Number.NEGATIVE_INFINITY;
  }

  throw new Error(
    "No se pudo calcular el vencimiento: revisa businessHours (¿algún día laborable?)",
  );
}

/** Minutos de trabajo transcurridos entre dos instantes, ignorando el tiempo fuera de jornada. */
export function businessMinutesBetween(
  from: Date,
  to: Date,
  calendar: BusinessCalendar,
): number {
  const toMs = to.getTime();
  if (toMs <= from.getTime()) return 0;

  let totalMs = 0;
  let date: CalendarDate = wallClockIn(from, calendar.hours.timezone);
  let cursorMs = from.getTime();

  for (let scanned = 0; scanned < MAX_DAYS_SCANNED; scanned++) {
    const window = windowFor(date, calendar);
    if (window) {
      if (window.startMs > toMs) break;
      const startMs = Math.max(cursorMs, window.startMs);
      const endMs = Math.min(toMs, window.endMs);
      if (endMs > startMs) totalMs += endMs - startMs;
    }
    const { midnightMs } = zonedDay(date, calendar.hours);
    if (midnightMs > toMs) break;

    date = nextDay(date);
    cursorMs = Number.NEGATIVE_INFINITY;
  }

  return Math.round(totalMs / 60_000);
}

/**
 * Minutos que dura una jornada. Es lo que convierte "3 días hábiles" en algo que
 * se puede comparar con `businessMinutesBetween`, sin contar noches ni fines de
 * semana: los plazos de cierre automático se miden en tiempo de trabajo, igual
 * que el SLA (spec §5.2).
 */
export function businessMinutesPerDay(hours: BusinessHours): number {
  const [startHour = 0, startMinute = 0] = hours.start.split(":").map(Number);
  const [endHour = 0, endMinute = 0] = hours.end.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

/** ¿Han pasado ya `days` días hábiles desde `from`? */
export function businessDaysPassed(
  from: Date,
  now: Date,
  days: number,
  calendar: BusinessCalendar,
): boolean {
  const perDay = businessMinutesPerDay(calendar.hours);
  if (perDay <= 0) return false;
  return businessMinutesBetween(from, now, calendar) >= days * perDay;
}

/**
 * El instante en que se cumplen `days` días hábiles desde `from`: el mismo
 * umbral que mira `businessDaysPassed`, pero como fecha en vez de como sí/no.
 *
 * Lo necesita la interfaz, que no puede enseñar una cuenta atrás contra una
 * pregunta booleana. Se deriva de los mismos minutos por jornada para que las
 * dos respuestas no puedan separarse: cuando esta fecha llega, aquella pasa a
 * ser cierta.
 *
 * `undefined` cuando el plazo no puede llegar nunca: sin horas de jornada, o sin
 * ningún día laborable. `addBusinessMinutes` avisa de lo segundo lanzando —no
 * tiene otra forma de decirlo—, y aquí se traduce a "no hay fecha", que es lo
 * mismo que responde `businessDaysPassed` en ese caso: nunca. Dejarlo escapar
 * tiraría el listado entero de tickets por una jornada mal configurada.
 */
export function businessDaysAfter(
  from: Date,
  days: number,
  calendar: BusinessCalendar,
): Date | undefined {
  const perDay = businessMinutesPerDay(calendar.hours);
  if (perDay <= 0 || days <= 0) return undefined;
  try {
    return addBusinessMinutes(from, days * perDay, calendar);
  } catch {
    return undefined;
  }
}
