import {
  AVAILABILITY_STATE_LABEL,
  PRIORITY_LABEL,
  SLA_STATE_LABEL,
  TICKET_STATUS_LABEL,
  type AvailabilityState,
  type DimensionKey,
  type Priority,
  type SlaState,
  type TicketStatus,
} from "@tekzaya/shared";
import { Types, type PipelineStage } from "mongoose";
import { Area } from "../../models/area.model";
import { User } from "../../models/user.model";

/**
 * Cómo se agrupa (spec §7.8.5). Cada dimensión se traduce a una expresión de
 * agregación que produce la clave del grupo, más la forma de convertir esa clave en
 * una etiqueta legible.
 *
 * Las etiquetas que son identificadores (persona, área, categoría) se resuelven en
 * una sola consulta **después** de agregar, no con un `$lookup` por fila: una
 * gráfica de 20 barras no tiene que leer 20 veces la colección de usuarios.
 */
export type LabelKind =
  | "literal"
  | "user"
  | "area"
  | "category"
  | "status"
  | "priority"
  | "sla_state"
  | "time"
  | "weekday_hour"
  | "on_behalf"
  | "ai_result"
  | "csat"
  | "availability";

export interface DimensionPlan {
  expr: unknown;
  /** Campo que hay que desenrollar antes de agrupar (un ticket con 3 responsables da 3 filas). */
  unwind?: string;
  /** Hace falta unir con `users` para leer su disponibilidad. */
  joinMember?: boolean;
  labels: LabelKind;
}

export interface DimensionContext {
  /**
   * Expresión con la fecha sobre la que se agrupa el tiempo: la de la medida, que no
   * siempre es `createdAt` ni siquiera un campo (ver `anchorDateExpr`).
   */
  anchorDate: unknown;
  bucket: "hour" | "day" | "week" | "month";
  timezone: string;
  /** De qué campo salen las personas en esta medida (responsables, quien resolvió…). */
  personField: string;
  now: Date;
}

const MEMBER = "__member";

export function planFor(key: DimensionKey, ctx: DimensionContext): DimensionPlan {
  const date = ctx.anchorDate;

  switch (key) {
    case "time":
      // Se trunca en la zona de la empresa: en UTC, los tickets de la tarde caerían
      // en el día siguiente y la gráfica mentiría por unas horas.
      return {
        expr: { $dateTrunc: { date, unit: ctx.bucket, timezone: ctx.timezone } },
        labels: "time",
      };

    case "weekday_hour":
      return {
        expr: {
          $concat: [
            { $toString: { $isoDayOfWeek: { date, timezone: ctx.timezone } } },
            "-",
            { $toString: { $hour: { date, timezone: ctx.timezone } } },
          ],
        },
        labels: "weekday_hour",
      };

    case "category":
      return { expr: "$categoryId", labels: "category" };

    case "priority":
      return { expr: "$priority", labels: "priority" };

    case "status":
      return { expr: "$status", labels: "status" };

    case "sla_state":
      return { expr: slaStateExpr(ctx.now), labels: "sla_state" };

    case "area":
      return { expr: "$areaId", labels: "area" };

    case "assignee":
      return { expr: `$${ctx.personField}`, unwind: ctx.personField, labels: "user" };

    case "requester":
      return { expr: "$requesterId", labels: "user" };

    case "created_on_behalf":
      return {
        expr: { $cond: [{ $eq: ["$createdById", "$requesterId"] }, "own", "on_behalf"] },
        labels: "on_behalf",
      };

    case "ai_result":
      return { expr: aiResultExpr(), labels: "ai_result" };

    case "csat":
      return { expr: { $ifNull: ["$csat.rating", null] }, labels: "csat" };

    case "availability":
      return {
        expr: { $ifNull: [`$${MEMBER}.availability.state`, "available"] },
        unwind: ctx.personField,
        joinMember: true,
        labels: "availability",
      };
  }
}

/**
 * Mismo criterio que `slaStateAt` del motor de F1, escrito como expresión: un ticket
 * ya marcado como incumplido lo sigue estando, y uno sin resolver se juzga contra
 * sus plazos precalculados.
 */
function slaStateExpr(now: Date): unknown {
  const unresolved = { $eq: [{ $ifNull: ["$sla.resolvedAt", null] }, null] };
  return {
    $switch: {
      branches: [
        { case: { $eq: ["$sla.resolutionBreached", true] }, then: "breached" },
        {
          case: { $and: [unresolved, { $lt: ["$sla.resolutionDueAt", now] }] },
          then: "breached",
        },
        {
          case: { $and: [unresolved, { $lt: ["$sla.resolutionRiskAt", now] }] },
          then: "at_risk",
        },
      ],
      default: "on_time",
    },
  };
}

/** Acertó / corregido por el usuario / sin clasificar (spec §7.8.5). */
function aiResultExpr(): unknown {
  return {
    $switch: {
      branches: [
        { case: { $ne: ["$ai.classificationStatus", "done"] }, then: "unclassified" },
        { case: { $eq: [{ $ifNull: ["$ai.suggestedAreaId", null] }, null] }, then: "unclassified" },
        { case: { $eq: ["$ai.suggestedAreaId", "$areaId"] }, then: "hit" },
      ],
      default: "corrected",
    },
  };
}

/**
 * Etapas que hay que añadir antes del `$group` para esta combinación de dimensiones.
 *
 * Las expresiones se arman a mano y mongoose no puede comprobarlas sin un esquema
 * tipado del ticket (que este proyecto no tiene, a propósito: ver `ticket.access`),
 * así que el cast es el precio de construir la consulta en tiempo de ejecución.
 */
export function preStages(plans: readonly DimensionPlan[]): PipelineStage[] {
  const stages: PipelineStage[] = [];
  const unwound = new Set<string>();

  for (const plan of plans) {
    if (plan.unwind && !unwound.has(plan.unwind)) {
      unwound.add(plan.unwind);
      // Sin `preserveNullAndEmptyArrays` un ticket sin responsables desaparecería
      // del total, y "sin asignar" es justo lo que un supervisor quiere ver.
      stages.push({
        $unwind: { path: `$${plan.unwind}`, preserveNullAndEmptyArrays: true },
      });
    }
  }

  if (plans.some((plan) => plan.joinMember)) {
    const personField = plans.find((plan) => plan.joinMember)!.unwind!;
    stages.push({
      $lookup: {
        from: "users",
        localField: personField,
        foreignField: "_id",
        as: MEMBER,
      },
    });
    stages.push({ $unwind: { path: `$${MEMBER}`, preserveNullAndEmptyArrays: true } });
  }

  return stages;
}

/** Clave estable para un valor de grupo; `""` es "sin valor" (sin clasificar). */
export function keyOf(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

// ── Etiquetas ─────────────────────────────────────────────────

const WEEKDAYS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const ON_BEHALF_LABEL: Record<string, string> = {
  own: "Propio",
  on_behalf: "En nombre de otra persona",
};

const AI_RESULT_LABEL: Record<string, string> = {
  hit: "Acertó",
  corrected: "Corregido por el usuario",
  unclassified: "Sin clasificar",
};

export interface LabelResolver {
  (kind: LabelKind, key: string, bucket: DimensionContext["bucket"]): string;
}

/**
 * Resuelve de una tacada los nombres de las personas, áreas y categorías que
 * aparecen entre las claves. Lo que ya es un enumerado no necesita consulta.
 */
export async function labelResolver(
  needed: { kind: LabelKind; keys: Set<string> }[],
): Promise<LabelResolver> {
  const userIds = new Set<string>();
  const areaIds = new Set<string>();
  let needsCategories = false;

  for (const entry of needed) {
    if (entry.kind === "user") for (const key of entry.keys) if (key) userIds.add(key);
    if (entry.kind === "area") for (const key of entry.keys) if (key) areaIds.add(key);
    if (entry.kind === "category") needsCategories = true;
  }

  const [users, areas, categoryAreas] = await Promise.all([
    userIds.size
      ? User.find({ _id: { $in: [...userIds].filter(isObjectId).map(oid) } })
          .select("name")
          .lean()
      : [],
    areaIds.size
      ? Area.find({ _id: { $in: [...areaIds].filter(isObjectId).map(oid) } })
          .select("name")
          .lean()
      : [],
    needsCategories ? Area.find({}).select("categories").lean() : [],
  ]);

  const userNames = new Map(users.map((user) => [String(user._id), user.name ?? "Usuario"]));
  const areaNames = new Map(areas.map((area) => [String(area._id), area.name ?? "Área"]));
  const categoryNames = new Map<string, string>();
  for (const area of categoryAreas) {
    for (const category of area.categories ?? []) {
      categoryNames.set(String(category._id), category.name ?? "Categoría");
    }
  }

  return (kind, key, bucket) => {
    switch (kind) {
      case "user":
        return key ? (userNames.get(key) ?? "Usuario dado de baja") : "Sin asignar";
      case "area":
        return key ? (areaNames.get(key) ?? "Área retirada") : "Sin área";
      case "category":
        return key ? (categoryNames.get(key) ?? "Categoría retirada") : "Sin clasificar";
      case "status":
        return TICKET_STATUS_LABEL[key as TicketStatus] ?? key;
      case "priority":
        return PRIORITY_LABEL[key as Priority] ?? key;
      case "sla_state":
        return SLA_STATE_LABEL[key as SlaState] ?? key;
      case "availability":
        return AVAILABILITY_STATE_LABEL[key as AvailabilityState] ?? key;
      case "on_behalf":
        return ON_BEHALF_LABEL[key] ?? key;
      case "ai_result":
        return AI_RESULT_LABEL[key] ?? key;
      case "csat":
        return key ? `${key} ${Number(key) === 1 ? "estrella" : "estrellas"}` : "Sin calificar";
      case "weekday_hour": {
        const [day, hour] = key.split("-");
        return `${WEEKDAYS[Number(day)] ?? day} ${String(hour).padStart(2, "0")}:00`;
      }
      case "time":
        return formatBucket(key, bucket);
      case "literal":
        return key || "Sin valor";
    }
  };
}

const isObjectId = (value: string): boolean => Types.ObjectId.isValid(value);
const oid = (value: string): Types.ObjectId => new Types.ObjectId(value);

/** La etiqueta del eje de tiempo se escribe entera aquí: el cliente solo la pinta. */
function formatBucket(iso: string, bucket: DimensionContext["bucket"]): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  switch (bucket) {
    case "hour":
      return date.toLocaleString("es-MX", { hour: "2-digit", minute: "2-digit" });
    case "day":
      return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
    case "week":
      return `Sem. ${date.toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`;
    case "month":
      return date.toLocaleDateString("es-MX", { month: "short", year: "numeric" });
  }
}
