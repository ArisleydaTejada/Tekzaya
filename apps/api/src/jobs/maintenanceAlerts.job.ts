import { formatAssetNumber } from "@tekzaya/shared";
import type { Types } from "mongoose";
import { Asset } from "../models/maintenance.models";
import { todayKey } from "../modules/assets/asset.view";
import { failureWindowStart, repeatedFailures, warrantyExpiring } from "../modules/maintenance/alerts";
import { areaMembersExcept, availableAmong, notify, supervisorsOf } from "../modules/notifications/notifications.service";
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
 *   Le llega a toda el área que mantiene el equipo, no solo al supervisor: quien
 *   lo repara es quien tiene que saber si la reparación aún la cubre el proveedor.
 * - **Fallas repetidas**: una vez por ventana. Si pasada la ventana el equipo sigue
 *   fallando, es un problema nuevo y vuelve a avisar.
 */
/** Supervisores siempre; el resto del área, si no está ausente (spec §7.7). */
async function wholeArea(areaId: Types.ObjectId): Promise<string[]> {
  const supervisors = await supervisorsOf(areaId);
  const members = await availableAmong(await areaMembersExcept(areaId, supervisors));
  return [...supervisors, ...members];
}

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
    await notify(await wholeArea(asset.areaId), {
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
