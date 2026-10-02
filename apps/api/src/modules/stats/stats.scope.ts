import {
  isAdmin,
  isScopeAllowed,
  maxReportScope,
  type Actor,
  type DataScope,
  type StatsQuery,
  type StatsScope,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Area } from "../../models/area.model";
import { User } from "../../models/user.model";

/**
 * Alcance ya resuelto por el servidor. Lo que el cliente mandó es una petición; lo
 * que vale es esto, calculado desde la sesión. Un empleado que manipule el `areaId`
 * del payload recibe 403, no datos de otra área (spec §10.4).
 */
export interface ResolvedScope {
  scope: StatsScope;
  /** Área sobre la que se agrega; ausente en el alcance global. */
  areaId?: string;
  /** Persona sobre la que se agrega, en `me` y `user`. */
  userId?: string;
  areaName?: string;
}

function dataScopeOf(query: StatsQuery, actor: Actor): DataScope {
  switch (query.scope) {
    case "global":
      return { type: "global" };
    case "area":
      return { type: "area", areaId: query.areaId ?? actor.areaId };
    case "user":
      return { type: "me", userId: query.userId! };
    case "me":
      return { type: "me", userId: actor.id };
  }
}

export async function resolveScope(query: StatsQuery, actor: Actor): Promise<ResolvedScope> {
  const requested = dataScopeOf(query, actor);

  if (!isScopeAllowed(actor, requested)) {
    throw new AppError(
      403,
      "forbidden",
      maxReportScope(actor).type === "me"
        ? "Solo puedes consultar tus propias estadísticas"
        : "Solo puedes consultar las estadísticas de tu área",
    );
  }

  if (query.scope === "global") return { scope: "global" };

  if (query.scope === "area") {
    const areaId = query.areaId ?? actor.areaId;
    if (!Types.ObjectId.isValid(areaId)) {
      throw new AppError(404, "not_found", "Esa área no existe");
    }
    const area = await Area.findById(areaId).select("name").lean();
    if (!area) throw new AppError(404, "not_found", "Esa área no existe");
    return { scope: "area", areaId, areaName: area.name };
  }

  // `me` y `user` son la misma vista personal; la diferencia es de quién.
  const userId = query.scope === "user" ? query.userId! : actor.id;
  const target = await User.findById(userId).select("areaId status").lean();
  if (!target) throw new AppError(404, "not_found", "Esa persona no existe");

  // `isScopeAllowed` deja pasar "una persona concreta" para un supervisor; aquí se
  // comprueba lo que esa función deja explícitamente al endpoint: que sea de su área.
  if (userId !== actor.id && !isAdmin(actor) && !actor.hasGlobalReadAccess) {
    if (String(target.areaId) !== actor.areaId) {
      throw new AppError(403, "forbidden", "Esa persona no es de tu área");
    }
  }

  const area = await Area.findById(target.areaId).select("name").lean();
  return {
    scope: query.scope,
    userId,
    areaId: String(target.areaId),
    ...(area?.name ? { areaName: area.name } : {}),
  };
}

/**
 * Filtro base de tickets para el alcance. Los **fusionados quedan fuera de toda
 * métrica**: el principal ya cuenta el problema una vez, y contar el duplicado
 * también inflaría el volumen, los tiempos y el cumplimiento (spec §9).
 *
 * En el alcance personal no se filtra por área: lo que esa persona resolvió sigue
 * siendo suyo aunque el ticket se transfiriera después. Las dos medidas que sí
 * hablan del área ("pendientes del área", "urgentes") añaden el `areaId` aparte.
 */
export function scopeTicketFilter(scope: ResolvedScope): Record<string, unknown> {
  const filter: Record<string, unknown> = { status: { $ne: "merged" } };
  if (scope.scope === "area") filter["areaId"] = new Types.ObjectId(scope.areaId!);
  return filter;
}
