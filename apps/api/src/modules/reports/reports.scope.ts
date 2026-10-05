import {
  isAdmin,
  isScopeAllowed,
  maxReportScope,
  type Actor,
  type Perspective,
  type StatsQueryFields,
  type StatsScope,
  type WidgetFilters,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Area } from "../../models/area.model";
import { User } from "../../models/user.model";
import { resolveScope, type ResolvedScope } from "../stats/stats.scope";

type Filter = Record<string, unknown>;

const oid = (value: string): Types.ObjectId => new Types.ObjectId(value);

export { resolveScope, type ResolvedScope };

/**
 * Alcance que el rol concede, en la forma que entiende el selector de la pantalla.
 * El empleado no recibe "Mi área" porque pulsarlo solo le daría un 403 (spec §7.8.1).
 */
export function scopeOptionsFor(actor: Actor): { id: StatsScope; label: string }[] {
  const allowed = maxReportScope(actor);
  const personal = { id: "me" as const, label: "Yo" };
  if (allowed.type === "global") {
    return [
      { id: "global", label: "Todas las áreas" },
      { id: "area", label: "Un área" },
      { id: "user", label: "Una persona" },
      personal,
    ];
  }
  if (allowed.type === "area") {
    return [
      { id: "area", label: "Mi área" },
      { id: "user", label: "Una persona de mi área" },
      personal,
    ];
  }
  return [personal];
}

/**
 * Recorta el alcance guardado a lo que el rol de **hoy** permite. Un reporte que
 * guardó un supervisor y abre un empleado degradado no falla: se abre con sus
 * propios datos y la pantalla lo avisa (spec §7.8.1).
 */
export function narrowScope(
  requested: StatsQueryFields,
  actor: Actor,
): { query: StatsQueryFields; narrowed: boolean } {
  const asDataScope =
    requested.scope === "global"
      ? ({ type: "global" } as const)
      : requested.scope === "area"
        ? ({ type: "area", areaId: requested.areaId ?? actor.areaId } as const)
        : ({ type: "me", userId: requested.userId ?? actor.id } as const);

  if (isScopeAllowed(actor, asDataScope)) return { query: requested, narrowed: false };

  const allowed = maxReportScope(actor);
  if (allowed.type === "area") {
    return { query: { ...requested, scope: "area", areaId: allowed.areaId }, narrowed: true };
  }
  return { query: { ...requested, scope: "me", userId: actor.id }, narrowed: true };
}

/**
 * Perspectiva efectiva: solo significa algo en el alcance personal, donde hay que
 * decidir si se mide lo que la persona **atendió** o lo que **pidió** (spec §7.8.4).
 * En un área o en global el reporte es siempre del lado de quien atiende.
 */
export function effectivePerspective(
  scope: ResolvedScope,
  requested: Perspective | undefined,
): Perspective | undefined {
  if (scope.scope !== "me" && scope.scope !== "user") return undefined;
  return requested ?? "agent";
}

/**
 * Filtro base de la consulta: alcance + perspectiva. Es el techo de todo lo demás;
 * los filtros de la gráfica se añaden encima y nunca lo ensanchan.
 *
 * Los fusionados no se excluyen aquí sino en cada medida, porque la medida que
 * existe para contarlos sí los necesita (spec §9).
 */
export function scopeFilterFor(scope: ResolvedScope, perspective: Perspective | undefined): Filter {
  if (scope.scope === "global") return {};
  if (scope.scope === "area") return { areaId: oid(scope.areaId!) };

  const userId = oid(scope.userId!);
  if (perspective === "requester") {
    return {
      $or: [{ requesterId: userId }, { createdById: userId }, { additionalRequesterIds: userId }],
    };
  }
  // Como agente: lo que tiene asignado, lo que resolvió y lo que respondió primero.
  // Un ticket que ya transfirió sigue siendo trabajo suyo del período.
  return {
    $or: [
      { assigneeIds: userId },
      { "sla.resolvedByIds": userId },
      { "sla.firstResponderId": userId },
    ],
  };
}

/** Filtros del paso 6 del panel. Solo acotan; el alcance ya se decidió. */
export function widgetFilterFor(filters: WidgetFilters, scope: ResolvedScope): Filter {
  const filter: Filter = {};

  if (filters.areaId) {
    // Pedir otra área desde una gráfica no es una vía para saltarse el alcance: en el
    // alcance de área, el único `areaId` admisible es el del propio alcance.
    if (scope.scope === "area" && filters.areaId !== scope.areaId) {
      throw new AppError(403, "forbidden", "Esa área queda fuera de tu alcance");
    }
    filter["areaId"] = oid(filters.areaId);
  }
  if (filters.categoryIds?.length) {
    filter["categoryId"] = { $in: filters.categoryIds.map(oid) };
  }
  if (filters.priorities?.length) filter["priority"] = { $in: filters.priorities };
  if (filters.statuses?.length) filter["status"] = { $in: filters.statuses };
  if (filters.assigneeId) filter["assigneeIds"] = oid(filters.assigneeId);
  if (filters.requesterId) filter["requesterId"] = oid(filters.requesterId);
  if (filters.createdOnBehalf !== undefined) {
    filter["$expr"] = filters.createdOnBehalf
      ? { $ne: ["$createdById", "$requesterId"] }
      : { $eq: ["$createdById", "$requesterId"] };
  }

  return filter;
}

/** El estado del SLA se compara con fechas, así que se filtra con un `$expr`. */
export function slaStateFilter(state: string, now: Date): Filter {
  const unresolved = { $eq: [{ $ifNull: ["$sla.resolvedAt", null] }, null] };
  if (state === "breached") {
    return {
      $or: [
        { "sla.resolutionBreached": true },
        { $expr: { $and: [unresolved, { $lt: ["$sla.resolutionDueAt", now] }] } },
      ],
    };
  }
  if (state === "at_risk") {
    return {
      "sla.resolutionBreached": { $ne: true },
      $expr: {
        $and: [
          unresolved,
          { $lt: ["$sla.resolutionRiskAt", now] },
          { $gte: ["$sla.resolutionDueAt", now] },
        ],
      },
    };
  }
  return {
    "sla.resolutionBreached": { $ne: true },
    $expr: {
      $or: [{ $ne: [{ $ifNull: ["$sla.resolvedAt", null] }, null] }, { $gte: ["$sla.resolutionRiskAt", now] }],
    },
  };
}

/**
 * Alcance de la **lista** de tickets, que no es el de las gráficas (spec §7.8.9).
 * Aquí el empleado sí puede pedir "mi área": puede leer las conversaciones de su área
 * por la regla del §7.5, así que ocultarle la tabla no protegería nada y le quitaría
 * la única vista del histórico que tiene. Lo que sigue siendo suyo y solo suyo son las
 * **gráficas**.
 *
 * Lo que no cambia: un área ajena exige lectura global, y una persona concreta pasa
 * por el mismo motor de permisos que todo lo demás.
 */
export async function resolveListScope(
  query: StatsQueryFields,
  actor: Actor,
): Promise<ResolvedScope> {
  if (query.scope === "area") {
    const areaId = query.areaId ?? actor.areaId;
    if (areaId !== actor.areaId && !isAdmin(actor) && !actor.hasGlobalReadAccess) {
      throw new AppError(403, "forbidden", "Solo puedes consultar los tickets de tu área");
    }
    const area = await Area.findById(areaId).select("name").lean();
    if (!area) throw new AppError(404, "not_found", "Esa área no existe");
    return { scope: "area", areaId, areaName: area.name ?? "Área" };
  }
  return resolveScope(query as never, actor);
}

/** Personas del alcance; solo lo necesitan las medidas que no salen de los tickets. */
export async function memberIdsOf(scope: ResolvedScope): Promise<Types.ObjectId[] | undefined> {
  if (scope.scope === "global") return undefined;
  if (scope.scope === "me" || scope.scope === "user") return [oid(scope.userId!)];
  const members = await User.find({ areaId: oid(scope.areaId!) })
    .select("_id")
    .lean();
  return members.map((member) => member._id as Types.ObjectId);
}

/** ¿Puede este usuario reportar sobre otras personas? Decide qué dimensiones se ofrecen. */
export function canReportOnOthers(actor: Actor): boolean {
  return isAdmin(actor) || actor.hasGlobalReadAccess || actor.isAreaSupervisor;
}
