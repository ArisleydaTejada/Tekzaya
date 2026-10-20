import {
  DEFAULT_SETTINGS,
  type BusinessCalendar,
  type BusinessHours,
  type Priority,
  type Settings as SettingsShape,
  type SlaPolicy,
} from "@tekzaya/shared";
import { env } from "../../config/env";
import { Settings, SETTINGS_ID } from "../../models/support.models";

/**
 * Los ajustes se leen en cada creación de ticket y en cada recálculo de SLA, y
 * cambian una vez al mes como mucho. Una caché corta evita convertir el motor de
 * SLA en una consulta a la base por ticket, sin obligar a reiniciar la API cuando
 * el administrador toca la jornada.
 */
const CACHE_MS = 30_000;
let cached: { value: SettingsShape; at: number } | null = null;

export async function getSettings(): Promise<SettingsShape> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const doc = await Settings.findById(SETTINGS_ID).lean();
  const value: SettingsShape = doc
    ? {
        slaPolicies: (doc.slaPolicies as SettingsShape["slaPolicies"]) ?? DEFAULT_SETTINGS.slaPolicies,
        businessHours: (doc.businessHours as BusinessHours) ?? DEFAULT_SETTINGS.businessHours,
        holidays: doc.holidays ?? [],
        autoCloseResolvedDays: doc.autoCloseResolvedDays ?? DEFAULT_SETTINGS.autoCloseResolvedDays,
        onHoldReminderDays: doc.onHoldReminderDays ?? DEFAULT_SETTINGS.onHoldReminderDays,
        onHoldAutoCloseDays: doc.onHoldAutoCloseDays ?? DEFAULT_SETTINGS.onHoldAutoCloseDays,
        aiEnabled: (doc.aiEnabled as SettingsShape["aiEnabled"]) ?? DEFAULT_SETTINGS.aiEnabled,
        incidentDetection:
          (doc.incidentDetection as SettingsShape["incidentDetection"]) ??
          DEFAULT_SETTINGS.incidentDetection,
        reportLimits:
          (doc.reportLimits as SettingsShape["reportLimits"]) ?? DEFAULT_SETTINGS.reportLimits,
        // Bases sembradas antes del módulo 2 no tienen el bloque: valen los valores por defecto.
        maintenance: maintenanceOf(doc.maintenance),
      }
    : // Sin semilla todavía: la API arranca igual con los valores del spec §5.3.
      {
        ...DEFAULT_SETTINGS,
        businessHours: { ...DEFAULT_SETTINGS.businessHours, timezone: env.COMPANY_TIMEZONE },
      };

  cached = { value, at: Date.now() };
  return value;
}

/**
 * El bloque de mantenimiento guardado, sobre los valores por defecto. Las bases
 * sembradas antes de quitar la tarifa interna (plan A3) aún traen `laborRates`:
 * se descarta para que no vuelva a salir en la respuesta.
 */
function maintenanceOf(stored: unknown): SettingsShape["maintenance"] {
  const { laborRates: _dropped, ...rest } = (stored ?? {}) as Partial<SettingsShape["maintenance"]> & {
    laborRates?: unknown;
  };
  return { ...DEFAULT_SETTINGS.maintenance, ...rest };
}

/** La llama el administrador al guardar la configuración (F4). */
export function invalidateSettingsCache(): void {
  cached = null;
}

export async function getCalendar(): Promise<BusinessCalendar> {
  const settings = await getSettings();
  return { hours: settings.businessHours, holidays: settings.holidays };
}

export async function slaPolicyFor(priority: Priority): Promise<SlaPolicy> {
  const settings = await getSettings();
  return settings.slaPolicies[priority] ?? DEFAULT_SETTINGS.slaPolicies[priority];
}
