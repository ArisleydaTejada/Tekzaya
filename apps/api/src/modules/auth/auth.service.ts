import { initialsOf, type MeResponse } from "@tekzaya/shared";
import { Area } from "../../models/area.model";
import { User } from "../../models/user.model";
import { AppError } from "../../middleware/errors";

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/** Perfil que consume la cabecera de la interfaz. Nunca incluye hash ni googleId. */
export async function buildMeResponse(userId: string): Promise<MeResponse> {
  const user = await User.findById(userId).lean();
  if (!user) throw new AppError(401, "unauthenticated", "Tu cuenta ya no existe");

  const area = await Area.findById(user.areaId).lean();

  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    areaId: String(user.areaId),
    areaName: area?.name ?? "Sin área",
    role: user.role ?? "employee",
    isAreaSupervisor: user.isAreaSupervisor ?? false,
    hasGlobalReadAccess: user.hasGlobalReadAccess ?? false,
    status: user.status ?? "active",
    availability: {
      state: user.availability?.state ?? "available",
      ...(user.availability?.reason ? { reason: user.availability.reason } : {}),
      ...(user.availability?.awayUntil
        ? { awayUntil: user.availability.awayUntil.toISOString() }
        : {}),
    },
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt.toISOString() } : {}),
  };
}

export { initialsOf };
