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

/** Ventana laborable de ese día, o `null` si es fin de semana o festivo. */
function windowFor(date: CalendarDate, calendar: BusinessCalendar): DayWindow | null {
  const { hours, holidays } = calendar;
  if (!hours.days.includes(weekdayOf(date))) return null;
  if (holidays.includes(dateKey(date))) return null;

  const open = parseHourMinute(hours.start);
  const close = parseHourMinute(hours.end);
  return {
    startMs: zonedTimeToUtc(date, open.hour, open.minute, hours.timezone).getTime(),
    endMs: zonedTimeToUtc(date, close.hour, close.minute, hours.timezone).getTime(),
  };
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
    const midnightMs = zonedTimeToUtc(date, 0, 0, calendar.hours.timezone).getTime();
    if (midnightMs > toMs) break;

    date = nextDay(date);
    cursorMs = Number.NEGATIVE_INFINITY;
  }

  return Math.round(totalMs / 60_000);
}
