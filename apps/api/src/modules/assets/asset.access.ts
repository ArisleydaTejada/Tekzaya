import { assetScopeFor, canViewAsset, type Actor, type AssetRef } from "@tekzaya/shared";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Asset } from "../../models/maintenance.models";

/** Documento plano de un activo, tal como sale de `.lean()`. */
export interface LeanAsset {
  _id: Types.ObjectId;
  number: number;
  name: string;
  type: string;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  areaId: Types.ObjectId;
  usedByAreaId?: Types.ObjectId | null;
  custodianId?: Types.ObjectId | null;
  location: string;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  warrantyUntil?: string | null;
  status: string;
  photoId?: Types.ObjectId | null;
  retiredAt?: Date | null;
  retiredReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function assetRefOf(asset: Pick<LeanAsset, "areaId" | "usedByAreaId" | "custodianId">): AssetRef {
  return {
    areaId: String(asset.areaId),
    usedByAreaId: asset.usedByAreaId ? String(asset.usedByAreaId) : undefined,
    custodianId: asset.custodianId ? String(asset.custodianId) : undefined,
  };
}

/**
 * El alcance de cualquier consulta de activos, desde la sesión. Los filtros del
 * cliente se suman con `$and`, así que solo pueden estrechar esto.
 */
export function assetScopeFilter(actor: Actor): Record<string, unknown> {
  const scope = assetScopeFor(actor);
  if (scope.type === "global") return {};
  const areaId = new Types.ObjectId(scope.areaId);
  return {
    $or: [
      { areaId },
      { usedByAreaId: areaId },
      { custodianId: new Types.ObjectId(scope.userId) },
    ],
  };
}

/**
 * Busca por id o por número (`ACT-0012` o `12`). Lo que no se puede ver responde
 * 404, igual que un ticket ajeno: un 403 confirmaría que el equipo existe.
 */
export async function loadVisibleAsset(key: string, actor: Actor): Promise<LeanAsset> {
  const number = /^(?:ACT-)?(\d{1,9})$/i.exec(key.trim())?.[1];
  const filter = Types.ObjectId.isValid(key) && key.length === 24 ? { _id: key } : number ? { number: Number(number) } : null;
  const asset = filter ? ((await Asset.findOne(filter).lean()) as LeanAsset | null) : null;
  if (!asset || !canViewAsset(actor, assetRefOf(asset))) {
    throw new AppError(404, "not_found", "Ese activo no existe");
  }
  return asset;
}
