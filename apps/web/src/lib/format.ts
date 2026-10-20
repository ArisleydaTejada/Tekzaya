import { PART_UNIT_LABEL, type PartUnit } from "@tekzaya/shared";

/**
 * Las fechas llegan en ISO y UTC; se muestran en el reloj de quien mira. La
 * jornada laboral del SLA es única para toda la empresa, pero cada persona ve
 * las horas en su propia zona (ver `settings.businessHours`).
 */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (new Date(now).toDateString() === date.toDateString()) {
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return "justo ahora";
    if (minutes < 60) return `hace ${minutes} min`;
    return `hace ${Math.floor(minutes / 60)} h`;
  }
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * El margen de un plazo del SLA en una sola ficha: "4d", "6h", "45m" mientras
 * queda tiempo, y en negativo —"-4h"— cuando ya venció. Cabe junto al número del
 * ticket, y el signo —no una frase— es lo que distingue ir sobrado de ir tarde.
 */
export function formatSlaDelta(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(Math.abs(diffMs) / 60_000);

  const amount =
    minutes < 60
      ? `${minutes}m`
      : minutes < 60 * 48
        ? `${Math.round(minutes / 60)}h`
        : `${Math.round(minutes / 1440)}d`;

  return diffMs < 0 ? `-${amount}` : amount;
}

/** Lo que lleva acumulado una pausa del SLA, en la misma escala corta. */
export function formatSlaDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Una fecha de calendario ("2026-11-04": compra, garantía) tal cual, sin zona:
 * convertirla a instante la correría un día hacia atrás en América.
 */
export function formatDay(key: string): string {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-MX", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Días de calendario entre hoy (en el reloj de quien mira) y una fecha "YYYY-MM-DD". */
export function daysUntil(key: string): number {
  const [year, month, day] = key.split("-").map(Number) as [number, number, number];
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(year, month - 1, day) - today) / 86_400_000);
}

/** "Vence en 18 días", "Venció hace 3 días", "Vence hoy". */
export function warrantyCountdown(until: string): string {
  const days = daysUntil(until);
  if (days === 0) return "Vence hoy";
  if (days > 0) return `Vence en ${days} ${days === 1 ? "día" : "días"}`;
  return `Venció hace ${-days} ${days === -1 ? "día" : "días"}`;
}

/** "135" → "2 h 15 min": las horas se registran en minutos y se leen en horas. */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "3 unidades", "1 caja": una cantidad de repuesto con su unidad. */
export function formatQuantity(qty: number, unit: PartUnit): string {
  const label = PART_UNIT_LABEL[unit];
  return `${qty} ${Math.abs(qty) === 1 ? label : `${label}s`}`;
}
