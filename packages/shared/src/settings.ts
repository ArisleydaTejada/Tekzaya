import { z } from "zod";
import { PRIORITIES, type Priority } from "./enums";

export const slaPolicy = z.object({
  responseMinutes: z.number().int().positive(),
  resolutionMinutes: z.number().int().positive(),
});
export type SlaPolicy = z.infer<typeof slaPolicy>;

/** Comprueba que sea una zona IANA real ("America/La_Paz"), no un texto cualquiera. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// El SLA se mide en horario laboral, así que la jornada necesita UNA zona horaria
// única para toda la empresa: es la que decide cuándo corre el reloj. Si cada
// persona aportara la suya, el mismo ticket vencería a horas distintas según
// quién lo mirara y la métrica dejaría de significar nada.
//
// La zona de cada persona se usa solo para MOSTRAR fechas: quien trabaje desde
// otro país ve el mismo instante en su reloj local. Misma jornada, distinto reloj.
export const businessHours = z.object({
  /** Días laborables, 1 = lunes … 7 = domingo. */
  days: z.array(z.number().int().min(1).max(7)).min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  /** Zona horaria de operación de la empresa; la configura el administrador. */
  timezone: z.string().refine(isValidTimeZone, "Zona horaria desconocida"),
});
export type BusinessHours = z.infer<typeof businessHours>;

export const settings = z.object({
  slaPolicies: z.record(z.enum(PRIORITIES), slaPolicy),
  businessHours,
  holidays: z.array(z.iso.date()),
  autoCloseResolvedDays: z.number().int().min(1),
  onHoldReminderDays: z.number().int().min(1),
  onHoldAutoCloseDays: z.number().int().min(1),
  aiEnabled: z.object({
    suggestArea: z.boolean(),
    classify: z.boolean(),
    summary: z.boolean(),
    autocomplete: z.boolean(),
    detectIncidents: z.boolean(),
  }),
  incidentDetection: z.object({
    windowHours: z.number().int().positive(),
    minConfidence: z.number().min(0).max(1),
    minTickets: z.number().int().min(2),
  }),
});
export type Settings = z.infer<typeof settings>;

/** Un ticket pasa a "En riesgo" al consumir el 75 % de su plazo (spec §5.3). */
export const SLA_RISK_THRESHOLD = 0.75;

/** Valores iniciales de la tabla del spec §5.3; el administrador puede editarlos. */
export const DEFAULT_SLA_POLICIES: Record<Priority, SlaPolicy> = {
  urgent: { responseMinutes: 15, resolutionMinutes: 4 * 60 },
  high: { responseMinutes: 60, resolutionMinutes: 8 * 60 },
  medium: { responseMinutes: 4 * 60, resolutionMinutes: 24 * 60 },
  low: { responseMinutes: 8 * 60, resolutionMinutes: 72 * 60 },
};

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  days: [1, 2, 3, 4, 5],
  start: "08:00",
  end: "18:00",
  // Valor inicial; el administrador lo cambia en Administración → Configuración.
  // La API lo toma de COMPANY_TIMEZONE al sembrar los ajustes.
  timezone: "America/La_Paz",
};

export const DEFAULT_SETTINGS: Settings = {
  slaPolicies: DEFAULT_SLA_POLICIES,
  businessHours: DEFAULT_BUSINESS_HOURS,
  holidays: [],
  autoCloseResolvedDays: 3,
  onHoldReminderDays: 5,
  onHoldAutoCloseDays: 10,
  aiEnabled: {
    suggestArea: true,
    classify: true,
    summary: true,
    autocomplete: true,
    detectIncidents: true,
  },
  incidentDetection: { windowHours: 48, minConfidence: 0.6, minTickets: 3 },
};
