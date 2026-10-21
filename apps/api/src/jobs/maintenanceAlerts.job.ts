import { formatAssetNumber } from "@tekzaya/shared";
import { Asset } from "../models/maintenance.models";
import { todayKey } from "../modules/assets/asset.view";
import { failureWindowStart, repeatedFailures, warrantyExpiring } from "../modules/maintenance/alerts";
import { notify, supervisorsOf } from "../modules/notifications/notifications.service";
import { getSettings } from "../modules/settings/settings.service";

export interface MaintenanceAlertsSummary {
  /** Avisos `warranty_expiring` enviados (uno por equipo). */
  warranty: number;
  /** Avisos `repeated_failures` enviados (uno por equipo y ventana). */
  repeated: number;
}

/**
 * Alertas diarias de equipos (plan A6). Una sola vez por activo y motivo: la marca
 * se pone con una actualización condicionada antes de avisar, así dos pasadas a la
 * vez no mandan dos avisos, y el planificador puede llamarla cada hora.
 *
 * - **Garantía**: una vez por fecha de vencimiento; editar la garantía la rearma.
 * - **Fallas repetidas**: una vez por ventana. Si pasada la ventana el equipo sigue
 *   fallando, es un problema nuevo y vuelve a avisar.
 */
export async function runMaintenanceAlerts(now = new Date()): Promise<MaintenanceAlertsSummary> {
  const settings = await getSettings();
  const rules = settings.maintenance;
  const today = todayKey(settings.businessHours.timezone, now);
  const summary: MaintenanceAlertsSummary = { warranty: 0, repeated: 0 };

  for (const asset of await warrantyExpiring(rules, today)) {
    if (asset.warrantyNotifiedAt) continue;
    const marked = await Asset.updateOne(
      { _id: asset._id, warrantyNotifiedAt: { $exists: false } },
      { $set: { warrantyNotifiedAt: now } },
    );
    if (marked.modifiedCount === 0) continue;
    await notify(await supervisorsOf(asset.areaId), {
      type: "warranty_expiring",
      title: "Garantía por vencer",
      body: `${formatAssetNumber(asset.number)} · ${asset.name} · vence el ${asset.warrantyUntil}`,
      assetId: asset._id,
      assetNumber: asset.number,
    });
    summary.warranty += 1;
  }

  const windowStart = failureWindowStart(rules, now);
  for (const asset of await repeatedFailures(rules, now)) {
    const marked = await Asset.updateOne(
      {
        _id: asset._id,
        $or: [{ repeatedFailuresNotifiedAt: { $exists: false } }, { repeatedFailuresNotifiedAt: { $lt: windowStart } }],
      },
      { $set: { repeatedFailuresNotifiedAt: now } },
    );
    if (marked.modifiedCount === 0) continue;
    await notify(await supervisorsOf(asset.areaId), {
      type: "repeated_failures",
      title: "Fallas repetidas",
      body: `${formatAssetNumber(asset.number)} · ${asset.name} · ${asset.failures} fallas en ${rules.repeatedFailure.windowDays} días`,
      assetId: asset._id,
      assetNumber: asset.number,
    });
    summary.repeated += 1;
  }

  return summary;
}
