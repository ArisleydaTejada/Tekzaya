import { addDaysToKey, type MaintenanceSettings } from "@tekzaya/shared";
import type { Types } from "mongoose";
import { Asset, WorkOrder } from "../../models/maintenance.models";

/**
 * Las dos alertas de equipo del plan A6, escritas una sola vez: el trabajo diario
 * las usa para avisar y el panel de mantenimiento para listarlas, así lo que
 * aparece en el panel es exactamente lo que se avisó.
 */

export interface AlertAsset {
  _id: Types.ObjectId;
  number: number;
  name: string;
  areaId: Types.ObjectId;
  warrantyUntil?: string | null;
  warrantyNotifiedAt?: Date | null;
  repeatedFailuresNotifiedAt?: Date | null;
}

const ALERT_FIELDS = "number name areaId warrantyUntil warrantyNotifiedAt repeatedFailuresNotifiedAt";

/** Equipos en servicio cuya garantía vence entre hoy y `warrantyAlertDays` días. */
export async function warrantyExpiring(
  settings: MaintenanceSettings,
  today: string,
  areaFilter: Record<string, unknown> = {},
): Promise<AlertAsset[]> {
  return (await Asset.find({
    ...areaFilter,
    status: { $ne: "retired" },
    warrantyUntil: { $gte: today, $lte: addDaysToKey(today, settings.warrantyAlertDays) },
  })
    .select(ALERT_FIELDS)
    .sort({ warrantyUntil: 1 })
    .lean()) as AlertAsset[];
}

/** Desde cuándo se cuentan las fallas de la regla "N correctivas en X días". */
export function failureWindowStart(settings: MaintenanceSettings, now: Date): Date {
  return new Date(now.getTime() - settings.repeatedFailure.windowDays * 86_400_000);
}

/**
 * Equipos en servicio con `count` o más correctivas en la ventana. Una falla es una
 * OT correctiva no cancelada, igual que en MTBF: un ticket sin OT no lo es (A2).
 */
export async function repeatedFailures(
  settings: MaintenanceSettings,
  now: Date,
  areaFilter: Record<string, unknown> = {},
): Promise<(AlertAsset & { failures: number })[]> {
  const counts = await WorkOrder.aggregate<{ _id: Types.ObjectId; failures: number }>([
    {
      $match: {
        ...areaFilter,
        type: "corrective",
        status: { $ne: "cancelled" },
        createdAt: { $gte: failureWindowStart(settings, now), $lte: now },
      },
    },
    { $group: { _id: "$assetId", failures: { $sum: 1 } } },
    { $match: { failures: { $gte: settings.repeatedFailure.count } } },
  ]);
  if (!counts.length) return [];
  const byAsset = new Map(counts.map((row) => [String(row._id), row.failures]));
  const assets = (await Asset.find({ _id: { $in: counts.map((row) => row._id) }, status: { $ne: "retired" } })
    .select(ALERT_FIELDS)
    .lean()) as AlertAsset[];
  return assets
    .map((asset) => ({ ...asset, failures: byAsset.get(String(asset._id)) ?? 0 }))
    .sort((a, b) => b.failures - a.failures);
}
