import {
  statsQuery,
  type AvailabilityResponse,
  type StatsByCategory,
  type StatsByPerson,
  type StatsOverview,
  type StatsQuery,
  type StatsTimeseries,
} from "@tekzaya/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { validateQuery } from "../../middleware/validate";
import { Ticket } from "../../models/ticket.model";
import { getSettings } from "../settings/settings.service";
import { csvFile, csvRow, sendCsv, ticketsToCsv } from "../tickets/ticket.csv";
import type { LeanTicket } from "../tickets/ticket.access";
import { PERIOD_FILE_LABEL, resolveRange, windowOf } from "./stats.period";
import { resolveScope, scopeTicketFilter, type ResolvedScope } from "./stats.scope";
import {
  activeIncidentFor,
  areaKpisFor,
  availabilityFor,
  byCategoryFor,
  byPersonFor,
  personalKpisFor,
  timeseriesFor,
} from "./stats.service";

const router = Router();

/** Alcance y ventana resueltos, que es lo primero que hace cada endpoint. */
async function context(res: { locals: Record<string, unknown> }) {
  const query = res.locals["query"] as StatsQuery;
  const actor = res.locals["actor"] as Parameters<typeof resolveScope>[1];
  const scope = await resolveScope(query, actor);
  const settings = await getSettings();
  return { query, scope, range: resolveRange(query, settings.businessHours, new Date()) };
}

// ── KPI del tablero (spec §7.2) ───────────────────────────────

router.get("/stats/overview", validateQuery(statsQuery), async (_req, res) => {
  const { scope, range } = await context(res);

  // El alcance decide qué bloque de 4 tarjetas se devuelve: la vista personal y la
  // de área miden cosas distintas y no son dos versiones de la misma consulta.
  const kpis =
    scope.scope === "me" || scope.scope === "user"
      ? await personalKpisFor(scope, range)
      : await areaKpisFor(scope, range);

  const incident = await activeIncidentFor(scope);

  const response: StatsOverview = {
    scope: scope.scope,
    ...(scope.areaId ? { areaId: scope.areaId } : {}),
    ...(scope.areaName ? { areaName: scope.areaName } : {}),
    range,
    kpis,
    ...(incident ? { incident } : {}),
  };

  res.json(response);
});

// ── Disponibilidad del equipo (spec §7.2.2) ───────────────────

router.get("/stats/availability", validateQuery(statsQuery), async (_req, res) => {
  const { scope } = await context(res);
  const response: AvailabilityResponse = { items: await availabilityFor(scope) };
  res.json(response);
});

// ── Series de las gráficas (spec §7.8) ────────────────────────

router.get("/stats/timeseries", validateQuery(statsQuery), async (_req, res) => {
  const { scope, range } = await context(res);
  const { bucket, points } = await timeseriesFor(scope, range);
  const response: StatsTimeseries = { range, bucket, points };
  res.json(response);
});

router.get("/stats/by-person", validateQuery(statsQuery), async (_req, res) => {
  const { scope, range } = await context(res);
  const response: StatsByPerson = { range, items: await byPersonFor(scope, range) };
  res.json(response);
});

router.get("/stats/by-category", validateQuery(statsQuery), async (_req, res) => {
  const { scope, range } = await context(res);
  const response: StatsByCategory = { range, items: await byCategoryFor(scope, range) };
  res.json(response);
});

// ── Exportación CSV del tablero (spec §7.2.4) ─────────────────

/**
 * Dos bloques en un archivo: primero las KPI del período y después los tickets del
 * período. El PDF se genera en el navegador a partir de la vista, que es donde está
 * el diseño; aquí solo salen los datos.
 */
router.get("/stats/export", validateQuery(statsQuery), async (_req, res) => {
  const { scope, range } = await context(res);
  const window = windowOf(range);

  const kpis =
    scope.scope === "me" || scope.scope === "user"
      ? await personalKpisFor(scope, range)
      : await areaKpisFor(scope, range);

  const summary = [
    csvRow(["Alcance", scope.areaName ?? (scope.scope === "global" ? "Todas las áreas" : "")]),
    csvRow(["Período", range.period, range.from, range.to]),
    "",
    csvRow(["Indicador", "Valor"]),
    ...Object.entries(kpis)
      .filter(([key]) => key !== "kind")
      .map(([key, value]) => csvRow([KPI_LABEL[key] ?? key, value ?? ""])),
    "",
  ].join("\r\n");

  // Los tickets del período son los **creados** en la ventana: es el conjunto que
  // cuadra con lo que la persona ve al filtrar la lista por esas mismas fechas.
  const found = (await Ticket.find({
    $and: [scopeTicketFilter(scope), { createdAt: { $gte: window.from, $lt: window.to } }],
  })
    .sort({ number: 1 })
    .limit(EXPORT_LIMIT)
    .lean()) as LeanTicket[];

  const personal = scope.scope === "me" || scope.scope === "user";
  const tickets = personal ? personalSlice(found, scope) : found;

  sendCsv(
    res,
    `tekzaya-tablero-${PERIOD_FILE_LABEL[range.period]}`,
    csvFile(summary, await ticketsToCsv(tickets)),
  );
});

/** Techo de filas por exportación; más que esto es un reporte, no un vistazo al tablero. */
const EXPORT_LIMIT = 5000;

/** En la vista personal el listado se acota a lo que esa persona pidió o atendió. */
function personalSlice(tickets: LeanTicket[], scope: ResolvedScope): LeanTicket[] {
  const userId = String(scope.userId);
  return tickets.filter((ticket) => {
    const mine =
      String(ticket["requesterId"]) === userId ||
      String(ticket["createdById"]) === userId ||
      ((ticket["assigneeIds"] as Types.ObjectId[] | undefined) ?? []).some(
        (id) => String(id) === userId,
      );
    return mine;
  });
}

const KPI_LABEL: Record<string, string> = {
  pending: "Tickets pendientes",
  unassigned: "Sin asignar",
  resolved: "Tickets resueltos",
  firstResponseHours: "Horas medias de primera respuesta",
  firstResponseMedianHours: "Mediana de horas de primera respuesta",
  slaCompliance: "Cumplimiento de SLA (%)",
  csatAverage: "CSAT medio",
  csatResponses: "Respuestas de CSAT",
  areaPending: "Pendientes del área",
  resolvedByMe: "Resueltos por mí",
  pendingForMe: "Pendientes para mí",
  urgent: "Urgentes",
};

export default router;
