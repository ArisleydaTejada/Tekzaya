import { z } from "zod";
import { areaRef } from "../area";
import { objectId } from "../common";
import { assetType, planMode, planUnit, workOrderStatus } from "./enums";
import { maintenancePlanFields } from "./schemas";

// Plan A5: pasar de reparar cuando falla a mantener antes de que falle. Un plan
// cubre un equipo o todos los de un tipo en un área, y el trabajo diario
// genera su OT preventiva unos días antes de cada fecha.

const isoDate = z.iso.date();
const title = z.string().trim().min(3, "Mínimo 3 caracteres").max(120, "Máximo 120 caracteres");
const checklist = z.array(z.string().trim().min(1).max(200)).max(30);

// ── Consulta ──────────────────────────────────────────────────

export const PLAN_STATES = ["active", "paused", "all"] as const;
export const planState = z.enum(PLAN_STATES);
export type PlanState = z.infer<typeof planState>;

export const planListQuery = z.object({
  areaId: objectId.optional(),
  /** Los planes que cubren este equipo: el suyo propio y los de su tipo en su área. */
  assetId: objectId.optional(),
  state: planState.default("active"),
});
export type PlanListQuery = z.input<typeof planListQuery>;
export type ParsedPlanListQuery = z.output<typeof planListQuery>;

// ── Vistas ────────────────────────────────────────────────────

/** Sin la regla de "uno de los dos": el servidor ya solo guarda planes válidos. */
export const planView = maintenancePlanFields.extend({
  area: areaRef,
  /** El equipo, si el plan es de uno solo. */
  asset: z
    .object({ id: objectId, number: z.number().int().positive(), name: z.string(), status: z.string() })
    .optional(),
  /** Cuántos equipos cubre hoy (sin contar los dados de baja). */
  coverage: z.number().int().min(0),
  /** Día en que el trabajo diario generará la OT de la próxima ronda. */
  generatesOn: isoDate,
  /** Órdenes del plan que siguen abiertas. */
  openOrders: z.number().int().min(0),
  permissions: z.object({ manage: z.boolean() }),
});
export type PlanView = z.infer<typeof planView>;

export const planListResponse = z.object({
  items: z.array(planView),
  /** Áreas en las que quien mira puede crear planes. */
  manageableAreas: z.array(areaRef),
  defaultLeadDays: z.number().int().min(0),
});
export type PlanListResponse = z.infer<typeof planListResponse>;

// ── Entradas ──────────────────────────────────────────────────

/**
 * Un plan de **un equipo** (`assetId`) o de **un tipo en un área**
 * (`assetType` + `areaId`): exactamente uno de los dos. El área de un plan de
 * equipo es la que mantiene el equipo, así que no se manda.
 */
export const createPlanInput = z
  .object({
    title,
    assetId: objectId.optional(),
    assetType: assetType.optional(),
    areaId: objectId.optional(),
    checklist: checklist.default([]),
    every: z.number().int().min(1).max(365),
    unit: planUnit,
    mode: planMode,
    /** Primera fecha; en `fixed`, la que fija el calendario de todas las demás. */
    startsOn: isoDate,
    /** Sin ella, vale la antelación por defecto de Configuración. */
    leadDays: z.number().int().min(0).max(60).optional(),
  })
  .refine((input) => (input.assetId === undefined) !== (input.assetType === undefined), {
    message: "Elige un equipo o un tipo de equipo, no ambos",
    path: ["assetId"],
  })
  .refine((input) => input.assetType === undefined || input.areaId !== undefined, {
    message: "Un plan por tipo necesita el área",
    path: ["areaId"],
  });
export type CreatePlanInput = z.input<typeof createPlanInput>;

/**
 * Lo que cubre el plan no cambia: otro equipo es otro plan. `nextDueAt`
 * reprograma la próxima ronda; en `fixed`, mueve también el calendario.
 */
export const updatePlanInput = z.object({
  title: title.optional(),
  checklist: checklist.optional(),
  every: z.number().int().min(1).max(365).optional(),
  unit: planUnit.optional(),
  mode: planMode.optional(),
  leadDays: z.number().int().min(0).max(60).optional(),
  nextDueAt: isoDate.optional(),
});
export type UpdatePlanInput = z.infer<typeof updatePlanInput>;

// ── Calendario ────────────────────────────────────────────────

/** Lo más largo que se pide de una vez: seis semanas, la rejilla de un mes. */
export const CALENDAR_MAX_DAYS = 42;

/**
 * Un tramo de días, ambos incluidos. La rejilla del mes empieza el lunes de la
 * semana del día 1 y acaba el domingo de la del último: pide semanas completas,
 * con los días de los meses vecinos.
 */
export const calendarQuery = z
  .object({
    from: isoDate,
    to: isoDate,
    areaId: objectId.optional(),
  })
  .refine((query) => query.from <= query.to, { message: "El tramo termina antes de empezar", path: ["to"] })
  .refine(
    (query) => Date.parse(query.to) - Date.parse(query.from) < CALENDAR_MAX_DAYS * 86_400_000,
    { message: `Como mucho ${CALENDAR_MAX_DAYS} días`, path: ["to"] },
  );
export type CalendarQuery = z.input<typeof calendarQuery>;

/**
 * Un preventivo en el calendario: una OT que ya existe, o una ronda futura de
 * un plan activo que todavía no se ha generado (`projected`).
 */
export const calendarItem = z.object({
  date: isoDate,
  planId: objectId.optional(),
  title: z.string(),
  area: areaRef,
  kind: z.enum(["order", "projected"]),
  order: z
    .object({
      id: objectId,
      number: z.number().int().positive(),
      status: workOrderStatus,
      overdue: z.boolean(),
    })
    .optional(),
  /** El equipo de la OT, o el del plan si es de uno solo. */
  asset: z.object({ id: objectId, number: z.number().int().positive(), name: z.string() }).optional(),
  /** En una ronda proyectada de un plan por tipo: cuántos equipos recibirán OT. */
  assetCount: z.number().int().min(0).optional(),
});
export type CalendarItem = z.infer<typeof calendarItem>;

export const calendarResponse = z.object({
  from: isoDate,
  to: isoDate,
  today: isoDate,
  items: z.array(calendarItem),
});
export type CalendarResponse = z.infer<typeof calendarResponse>;
