import {
  createReportInput,
  reportQueryInput,
  reportTicketsQuery,
  updateReportInput,
  type Actor,
  type CreateReportInput,
  type ReportQueryInput,
  type ReportTicketsQuery,
  type SavedReportList,
  type UpdateReportInput,
} from "@tekzaya/shared";
import { Router } from "express";
import { validateBody, validateQuery } from "../../middleware/validate";
import { getSettings } from "../settings/settings.service";
import { csvFile, sendCsv } from "../tickets/ticket.csv";
import { routeParam } from "../tickets/ticket.access";
import { PERIOD_FILE_LABEL, resolveRange } from "../stats/stats.period";
import { catalogFor } from "./reports.catalog";
import { chartToCsv, ticketRowsToCsv } from "./reports.csv";
import { runWidget } from "./reports.query";
import {
  createReport,
  deleteReport,
  duplicateReport,
  getReport,
  listReports,
  updateReport,
} from "./reports.saved";
import { effectivePerspective, resolveListScope, resolveScope } from "./reports.scope";
import { buildResponse, listTicketsOfPeriod } from "./reports.tickets";

const router = Router();

/**
 * Alcance y ventana, resueltos **desde la sesión** en cada consulta. Es el punto que
 * sostiene toda la sección: el `areaId` y el `userId` del payload son una petición, y
 * `resolveScope` responde 403 si piden más de lo que el rol concede (spec §7.8.1).
 */
async function context(
  query: { scope: string; period: string } & Record<string, unknown>,
  actor: Actor,
  /** La lista de tickets llega más lejos que las gráficas; ver `resolveListScope`. */
  kind: "charts" | "list" = "charts",
) {
  const scope =
    kind === "list"
      ? await resolveListScope(query as never, actor)
      : await resolveScope(query as never, actor);
  const settings = await getSettings();
  return { scope, range: resolveRange(query as never, settings.businessHours, new Date()) };
}

// ── Catálogo y plantillas (spec §7.8.1, §7.8.7) ───────────────

router.get("/reports/catalog", async (_req, res) => {
  res.json(await catalogFor(res.locals.actor));
});

// ── Reportes guardados (spec §7.8.8) ──────────────────────────
// Se declaran antes de `/reports/:id` para que "catalog", "query" y "tickets" no se
// lean como identificadores de reporte.

router.get("/reports", async (_req, res) => {
  const response: SavedReportList = { items: await listReports(res.locals.actor) };
  res.json(response);
});

router.post("/reports", validateBody(createReportInput), async (req, res) => {
  res.status(201).json(await createReport(req.body as CreateReportInput, res.locals.actor));
});

// ── Una gráfica: `POST /reports/query` ────────────────────────

/**
 * Una consulta por gráfica (spec §7.8.8, rendimiento): cada tarjeta pide la suya y
 * muestra su propio esqueleto de carga, así que un fallo en una no deja la página en
 * blanco. Es `POST` porque la definición de la gráfica no cabe en una cadena de
 * consulta sin volverse ilegible.
 */
router.post("/reports/query", validateBody(reportQueryInput), async (req, res) => {
  const actor = res.locals.actor as Actor;
  const input = req.body as ReportQueryInput;
  const { scope, range } = await context(input as never, actor);

  res.json(
    await runWidget({
      actor,
      widget: input.widget,
      scope,
      perspective: effectivePerspective(scope, input.widget.perspective),
      range,
      now: new Date(),
    }),
  );
});

// ── Lista de tickets del período (spec §7.8.9) ────────────────

router.get("/reports/tickets", validateQuery(reportTicketsQuery), async (_req, res) => {
  const actor = res.locals.actor as Actor;
  const query = res.locals.query as ReportTicketsQuery;
  const { scope, range } = await context(query as never, actor, "list");
  const now = new Date();
  const perspective = effectivePerspective(scope, undefined);

  const result = await listTicketsOfPeriod(query, scope, perspective, actor, range, now);
  res.json(buildResponse(result, query, scope, range));
});

/**
 * El CSV lo genera siempre el servidor, con los mismos filtros y el mismo alcance que
 * la tabla, y con todas las filas en vez de la página a la vista (spec §7.8.9).
 */
router.get("/reports/tickets/export", validateQuery(reportTicketsQuery), async (_req, res) => {
  const actor = res.locals.actor as Actor;
  const query = res.locals.query as ReportTicketsQuery;
  const { scope, range } = await context(query as never, actor, "list");

  const result = await listTicketsOfPeriod(
    query,
    scope,
    effectivePerspective(scope, undefined),
    actor,
    range,
    new Date(),
    { all: true },
  );

  sendCsv(
    res,
    `tekzaya-reporte-tickets-${PERIOD_FILE_LABEL[range.period]}`,
    csvFile(ticketRowsToCsv(result.items, query.columns)),
  );
});

/** Los datos de una gráfica en CSV, desde su menú `⋯` (spec §7.8.8). */
router.post("/reports/query/export", validateBody(reportQueryInput), async (req, res) => {
  const actor = res.locals.actor as Actor;
  const input = req.body as ReportQueryInput;
  const { scope, range } = await context(input as never, actor);

  const result = await runWidget({
    actor,
    widget: input.widget,
    scope,
    perspective: effectivePerspective(scope, input.widget.perspective),
    range,
    now: new Date(),
  });

  sendCsv(res, "tekzaya-grafica", csvFile(chartToCsv(result, input.widget.title)));
});

router.get("/reports/:id", async (_req, res) => {
  res.json(await getReport(routeParam(_req.params["id"]), res.locals.actor));
});

router.put("/reports/:id", validateBody(updateReportInput), async (req, res) => {
  const updated = await updateReport(
    routeParam(req.params["id"]),
    req.body as UpdateReportInput,
    res.locals.actor,
  );
  res.json(updated);
});

router.post("/reports/:id/duplicate", async (req, res) => {
  res.status(201).json(await duplicateReport(routeParam(req.params["id"]), res.locals.actor));
});

router.delete("/reports/:id", async (req, res) => {
  await deleteReport(routeParam(req.params["id"]), res.locals.actor);
  res.status(204).end();
});

export default router;
