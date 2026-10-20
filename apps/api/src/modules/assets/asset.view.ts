import {
  canCreateWorkOrder,
  canManageAsset,
  canViewAssetDetails,
  wallClockIn,
  warrantyStateOf,
  type Actor,
  type AreaRef,
  type AssetPerson,
  type AssetType,
  type AssetStatus,
  type AssetView,
} from "@tekzaya/shared";
import type { Types } from "mongoose";
import { Area } from "../../models/area.model";
import { User } from "../../models/user.model";
import { getSettings } from "../settings/settings.service";
import { assetRefOf, type LeanAsset } from "./asset.access";

/** Nombres de áreas y personas que necesita una tanda de activos, en dos consultas. */
export interface AssetHydration {
  areas: Map<string, AreaRef>;
  people: Map<string, AssetPerson>;
  today: string;
  warrantyAlertDays: number;
  currency: string;
}

/** "Hoy" en el calendario de la empresa, no en el del servidor. */
export function todayKey(zone: string, now = new Date()): string {
  const clock = wallClockIn(now, zone);
  return `${clock.year}-${String(clock.month).padStart(2, "0")}-${String(clock.day).padStart(2, "0")}`;
}

export async function hydrateAssets(
  assets: readonly Pick<LeanAsset, "areaId" | "usedByAreaId" | "custodianId">[],
  extraUserIds: readonly (Types.ObjectId | string)[] = [],
  extraAreaIds: readonly (Types.ObjectId | string)[] = [],
): Promise<AssetHydration> {
  const areaIds = new Set<string>(extraAreaIds.map(String));
  const userIds = new Set<string>(extraUserIds.map(String));
  for (const asset of assets) {
    areaIds.add(String(asset.areaId));
    if (asset.usedByAreaId) areaIds.add(String(asset.usedByAreaId));
    if (asset.custodianId) userIds.add(String(asset.custodianId));
  }

  const [areas, people, settings] = await Promise.all([
    Area.find({ _id: { $in: [...areaIds] } }).select("name color").lean(),
    User.find({ _id: { $in: [...userIds] } }).select("name avatarUrl areaId").lean(),
    getSettings(),
  ]);

  return {
    areas: new Map(
      areas.map((area) => [String(area._id), { id: String(area._id), name: area.name!, color: area.color! }]),
    ),
    people: new Map(
      people.map((person) => [
        String(person._id),
        {
          id: String(person._id),
          name: person.name!,
          ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
          areaId: String(person.areaId),
        },
      ]),
    ),
    today: todayKey(settings.businessHours.timezone),
    warrantyAlertDays: settings.maintenance.warrantyAlertDays,
    currency: settings.maintenance.currency,
  };
}

const unknownArea = (id: unknown): AreaRef => ({ id: String(id), name: "Área eliminada", color: "#7c8cae" });

/**
 * El activo como lo ve `actor`. El costo de compra **no sale** del servidor si no
 * puede ver los detalles (plan §3): esconderlo en la pantalla no basta, porque
 * cualquiera puede leer la respuesta en las herramientas del navegador.
 */
export function toAssetView(asset: LeanAsset, h: AssetHydration, actor: Actor): AssetView {
  const ref = assetRefOf(asset);
  const viewDetails = canViewAssetDetails(actor, ref);
  const custodian = asset.custodianId ? h.people.get(String(asset.custodianId)) : undefined;
  const usedByArea = asset.usedByAreaId
    ? (h.areas.get(String(asset.usedByAreaId)) ?? unknownArea(asset.usedByAreaId))
    : undefined;

  return {
    id: String(asset._id),
    number: asset.number,
    name: asset.name,
    type: asset.type as AssetType,
    ...(asset.brand ? { brand: asset.brand } : {}),
    ...(asset.model ? { model: asset.model } : {}),
    ...(asset.serial ? { serial: asset.serial } : {}),
    areaId: String(asset.areaId),
    area: h.areas.get(String(asset.areaId)) ?? unknownArea(asset.areaId),
    ...(asset.usedByAreaId ? { usedByAreaId: String(asset.usedByAreaId) } : {}),
    ...(usedByArea ? { usedByArea } : {}),
    ...(asset.custodianId ? { custodianId: String(asset.custodianId) } : {}),
    ...(custodian ? { custodian } : {}),
    location: asset.location,
    ...(asset.purchaseDate ? { purchaseDate: asset.purchaseDate } : {}),
    ...(viewDetails && asset.purchaseCost != null ? { purchaseCost: asset.purchaseCost } : {}),
    ...(asset.warrantyUntil ? { warrantyUntil: asset.warrantyUntil } : {}),
    warranty: warrantyStateOf(asset.warrantyUntil ?? undefined, h.today, h.warrantyAlertDays),
    status: asset.status as AssetStatus,
    ...(asset.photoId ? { photoId: String(asset.photoId) } : {}),
    ...(asset.retiredAt ? { retiredAt: asset.retiredAt.toISOString() } : {}),
    ...(viewDetails && asset.retiredReason ? { retiredReason: asset.retiredReason } : {}),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    permissions: {
      manage: canManageAsset(actor, ref) && asset.status !== "retired",
      viewDetails,
      createWorkOrder: canCreateWorkOrder(actor, ref) && asset.status !== "retired",
    },
  };
}
