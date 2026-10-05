import { z } from "zod";
import { isoDateTime, objectId } from "./common";
import { availability } from "./user";

// Las definiciones de cada medida están en el spec §9. Aquí viaja el resultado;
// el cálculo vive en el servidor, que es el único que puede validar el alcance.

export const STATS_SCOPES = ["me", "area", "user", "global"] as const;
export const statsScope = z.enum(STATS_SCOPES);
export type StatsScope = z.infer<typeof statsScope>;

export const STATS_PERIODS = ["day", "week", "month", "year", "range"] as const;
export const statsPeriod = z.enum(STATS_PERIODS);
export type StatsPeriod = z.infer<typeof statsPeriod>;

export const STATS_PERIOD_LABEL: Record<StatsPeriod, string> = {
  day: "Día",
  week: "Semana",
  month: "Mes",
  year: "Año",
  range: "Rango",
};

/**
 * `areaId` y `userId` son **peticiones**, no concesiones: el servidor recalcula el
 * alcance desde la sesión y responde 403 si el payload pide más de lo permitido
 * (spec §10.4). El mismo esquema sirve para las KPI, las gráficas y el CSV.
 */
export const statsQueryFields = z.object({
  scope: statsScope.default("area"),
  areaId: objectId.optional(),
  userId: objectId.optional(),
  period: statsPeriod.default("week"),
  /** Solo con `period=range`; fechas en la zona de la empresa. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type StatsQueryFields = z.infer<typeof statsQueryFields>;

/**
 * Las dos reglas que acompañan a ese par de campos. Van aparte para que los
 * esquemas de Reportes (§7.8), que añaden gráficas, filtros y columnas sobre el
 * mismo alcance y período, no tengan que repetirlas ni puedan olvidarlas.
 */
export function scopeRangeRules(value: StatsQueryFields, ctx: z.RefinementCtx): void {
  if (value.period === "range" && (value.from === undefined || value.to === undefined)) {
    ctx.addIssue({
      code: "custom",
      message: "Un rango personalizado necesita fecha de inicio y de fin",
      path: ["from"],
    });
  }
  if (value.scope === "user" && value.userId === undefined) {
    ctx.addIssue({
      code: "custom",
      message: "Indica de quién son las estadísticas",
      path: ["userId"],
    });
  }
}

export const statsQuery = statsQueryFields.superRefine(scopeRangeRules);
export type StatsQuery = z.infer<typeof statsQuery>;

/** Ventana que el servidor resolvió a partir del período; la interfaz la muestra tal cual. */
export const statsRange = z.object({
  period: statsPeriod,
  from: isoDateTime,
  to: isoDateTime,
});
export type StatsRange = z.infer<typeof statsRange>;

// ── KPI del tablero (spec §7.2) ───────────────────────────────

/** Las 4 tarjetas de la vista personal (spec §7.2.1). */
export const personalKpis = z.object({
  kind: z.literal("personal"),
  /** Pendientes del área de la persona, no solo los suyos. */
  areaPending: z.number().int().min(0),
  resolvedByMe: z.number().int().min(0),
  pendingForMe: z.number().int().min(0),
  /** Urgentes sin resolver donde es responsable, o sin asignar en su área. */
  urgent: z.number().int().min(0),
});
export type PersonalKpis = z.infer<typeof personalKpis>;

/** Las 4 tarjetas de la vista de área o global (spec §7.2.2). */
export const areaKpis = z.object({
  kind: z.literal("area"),
  pending: z.number().int().min(0),
  unassigned: z.number().int().min(0),
  resolved: z.number().int().min(0),
  /** Media en **horas laborales**, descontando las pausas. `null` si nadie respondió. */
  firstResponseHours: z.number().min(0).nullable(),
  /** Mediana, más representativa cuando hay casos extremos (spec §9). */
  firstResponseMedianHours: z.number().min(0).nullable(),
  /** % de resueltos dentro del plazo; `null` si no se resolvió nada. */
  slaCompliance: z.number().min(0).max(100).nullable(),
  csatAverage: z.number().min(1).max(5).nullable(),
  csatResponses: z.number().int().min(0),
});
export type AreaKpis = z.infer<typeof areaKpis>;

/** Franja de aviso del tablero: el incidente abierto con más tickets (spec §7.2.2). */
export const statsIncident = z.object({
  groupId: z.string(),
  label: z.string(),
  ticketCount: z.number().int().min(2),
});
export type StatsIncident = z.infer<typeof statsIncident>;

export const statsOverview = z.object({
  /** Alcance concedido. Puede ser más estrecho que el pedido si el cliente pidió de más. */
  scope: statsScope,
  areaId: objectId.optional(),
  areaName: z.string().optional(),
  range: statsRange,
  kpis: z.discriminatedUnion("kind", [personalKpis, areaKpis]),
  incident: statsIncident.optional(),
});
export type StatsOverview = z.infer<typeof statsOverview>;

// ── Disponibilidad del equipo (spec §7.2.2) ───────────────────

export const availabilityEntry = z.object({
  id: objectId,
  name: z.string(),
  avatarUrl: z.string().url().optional(),
  areaId: objectId,
  areaName: z.string(),
  availability,
  /** Tickets activos que tiene encima; un ausente con carga es lo que hay que ver. */
  openTickets: z.number().int().min(0),
});
export type AvailabilityEntry = z.infer<typeof availabilityEntry>;

export const availabilityResponse = z.object({ items: z.array(availabilityEntry) });
export type AvailabilityResponse = z.infer<typeof availabilityResponse>;

// ── Series para las gráficas de Reportes (spec §7.8) ──────────

export const timeseriesPoint = z.object({
  date: z.iso.date(),
  created: z.number().int().min(0),
  resolved: z.number().int().min(0),
});
export type TimeseriesPoint = z.infer<typeof timeseriesPoint>;

export const statsTimeseries = z.object({
  range: statsRange,
  /** Agrupación elegida por el servidor según el largo de la ventana. */
  bucket: z.enum(["hour", "day", "week", "month"]),
  points: z.array(timeseriesPoint),
});
export type StatsTimeseries = z.infer<typeof statsTimeseries>;

/**
 * Un ticket resuelto cuenta para **cada** responsable al momento de resolverlo, así
 * que la suma por persona puede superar el total del área (spec §9, atribución).
 */
export const personRow = z.object({
  userId: objectId,
  name: z.string(),
  resolved: z.number().int().min(0),
  firstResponseHours: z.number().min(0).nullable(),
  csatAverage: z.number().min(1).max(5).nullable(),
});
export type PersonRow = z.infer<typeof personRow>;

export const statsByPerson = z.object({ range: statsRange, items: z.array(personRow) });
export type StatsByPerson = z.infer<typeof statsByPerson>;

export const categoryRow = z.object({
  /** Ausente en los tickets que nadie clasificó todavía. */
  categoryId: objectId.optional(),
  name: z.string(),
  count: z.number().int().min(0),
});
export type CategoryRow = z.infer<typeof categoryRow>;

export const statsByCategory = z.object({ range: statsRange, items: z.array(categoryRow) });
export type StatsByCategory = z.infer<typeof statsByCategory>;
