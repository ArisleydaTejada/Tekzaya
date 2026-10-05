import {
  validateWidget,
  type Actor,
  type CreateReportInput,
  type SavedReport,
  type StatsQueryFields,
  type UpdateReportInput,
} from "@tekzaya/shared";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Report } from "../../models/report.model";
import { getSettings } from "../settings/settings.service";
import { narrowScope } from "./reports.scope";

type LeanReport = Record<string, any>;

/**
 * Los reportes son **personales**: no se comparten. Por eso basta con filtrar por
 * dueño para que nadie llegue a un alcance ajeno por esa vía (spec §7.8.1). Y por eso
 * un reporte de otro responde 404 y no 403: ni su existencia es asunto de quien pregunta.
 */
async function loadOwn(id: string, actor: Actor): Promise<LeanReport> {
  if (!Types.ObjectId.isValid(id)) throw new AppError(404, "not_found", "Ese reporte no existe");
  const report = await Report.findOne({ _id: id, ownerId: actor.id }).lean();
  if (!report) throw new AppError(404, "not_found", "Ese reporte no existe");
  return report;
}

export function toSavedReport(report: LeanReport, actor: Actor): SavedReport {
  const requested: StatsQueryFields = {
    scope: report["scope"],
    ...(report["areaId"] ? { areaId: String(report["areaId"]) } : {}),
    ...(report["userId"] ? { userId: String(report["userId"]) } : {}),
    period: report["period"],
    ...(report["from"] ? { from: report["from"] as string } : {}),
    ...(report["to"] ? { to: report["to"] as string } : {}),
  };

  // El alcance se revalida al abrirlo, no al guardarlo: quien dejó de ser supervisor
  // abre su reporte recortado a sus propios datos, y la pantalla lo avisa (spec §7.8.1).
  const { query, narrowed } = narrowScope(requested, actor);

  return {
    id: String(report["_id"]),
    title: report["title"] as string,
    ...(report["description"] ? { description: report["description"] as string } : {}),
    scope: requested.scope,
    ...(requested.areaId ? { areaId: requested.areaId } : {}),
    ...(requested.userId ? { userId: requested.userId } : {}),
    period: requested.period,
    ...(requested.from ? { from: requested.from } : {}),
    ...(requested.to ? { to: requested.to } : {}),
    ...(report["perspective"] ? { perspective: report["perspective"] } : {}),
    widgets: (report["widgets"] ?? []) as SavedReport["widgets"],
    ...(report["ticketFilters"] ? { ticketFilters: report["ticketFilters"] } : {}),
    ...(report["columns"]?.length ? { columns: report["columns"] } : {}),
    createdAt: (report["createdAt"] as Date).toISOString(),
    updatedAt: (report["updatedAt"] as Date).toISOString(),
    effectiveScope: query.scope,
    scopeNarrowed: narrowed,
  };
}

export async function listReports(actor: Actor): Promise<SavedReport[]> {
  const reports = await Report.find({ ownerId: actor.id }).sort({ updatedAt: -1 }).lean();
  return reports.map((report) => toSavedReport(report, actor));
}

export async function getReport(id: string, actor: Actor): Promise<SavedReport> {
  return toSavedReport(await loadOwn(id, actor), actor);
}

/** Cada gráfica se valida al guardar: un reporte roto no se descubre al abrirlo. */
async function assertWidgets(widgets: CreateReportInput["widgets"]): Promise<void> {
  const settings = await getSettings();
  if (widgets.length > settings.reportLimits.maxWidgetsPerReport) {
    throw new AppError(
      422,
      "validation_error",
      `Un reporte admite hasta ${settings.reportLimits.maxWidgetsPerReport} gráficas`,
    );
  }
  for (const widget of widgets) {
    const invalid = validateWidget(widget);
    if (invalid) throw new AppError(422, "validation_error", `«${widget.title}»: ${invalid}`);
  }
}

export async function createReport(
  input: CreateReportInput,
  actor: Actor,
): Promise<SavedReport> {
  const settings = await getSettings();
  const count = await Report.countDocuments({ ownerId: actor.id });
  if (count >= settings.reportLimits.maxSavedReports) {
    throw new AppError(
      409,
      "limit_reached",
      `Has llegado al límite de ${settings.reportLimits.maxSavedReports} reportes guardados`,
    );
  }
  await assertWidgets(input.widgets);

  // Se guarda el alcance **pedido**, no el concedido: si mañana la persona vuelve a
  // ser supervisora, su reporte vuelve a abrirse completo sin tener que rehacerlo.
  const report = await Report.create({ ...documentOf(input), ownerId: actor.id });
  return toSavedReport(report.toObject() as LeanReport, actor);
}

export async function updateReport(
  id: string,
  input: UpdateReportInput,
  actor: Actor,
): Promise<SavedReport> {
  await loadOwn(id, actor);
  if (input.widgets) await assertWidgets(input.widgets);

  const updated = await Report.findOneAndUpdate(
    { _id: id, ownerId: actor.id },
    { $set: documentOf(input) },
    { returnDocument: "after" },
  ).lean();
  return toSavedReport(updated!, actor);
}

export async function deleteReport(id: string, actor: Actor): Promise<void> {
  await loadOwn(id, actor);
  await Report.deleteOne({ _id: id, ownerId: actor.id });
}

/** Duplicar: el mismo reporte con otro nombre, listo para divergir (spec §7.8.2). */
export async function duplicateReport(id: string, actor: Actor): Promise<SavedReport> {
  const source = await loadOwn(id, actor);
  return createReport(
    {
      title: `${source["title"]} (copia)`,
      ...(source["description"] ? { description: source["description"] as string } : {}),
      scope: source["scope"],
      ...(source["areaId"] ? { areaId: String(source["areaId"]) } : {}),
      ...(source["userId"] ? { userId: String(source["userId"]) } : {}),
      period: source["period"],
      ...(source["from"] ? { from: source["from"] as string } : {}),
      ...(source["to"] ? { to: source["to"] as string } : {}),
      ...(source["perspective"] ? { perspective: source["perspective"] } : {}),
      widgets: (source["widgets"] ?? []) as CreateReportInput["widgets"],
      ...(source["ticketFilters"] ? { ticketFilters: source["ticketFilters"] } : {}),
      ...(source["columns"]?.length ? { columns: source["columns"] } : {}),
    },
    actor,
  );
}

/** Solo lo que llegó: una edición parcial no borra lo que no se tocó. */
function documentOf(input: UpdateReportInput): Record<string, unknown> {
  const document: Record<string, unknown> = {};
  const assign = (key: string, value: unknown): void => {
    if (value !== undefined) document[key] = value;
  };
  assign("title", input.title);
  assign("description", input.description);
  assign("scope", input.scope);
  assign("areaId", input.areaId);
  assign("userId", input.userId);
  assign("period", input.period);
  assign("from", input.from);
  assign("to", input.to);
  assign("perspective", input.perspective);
  assign("widgets", input.widgets);
  assign("ticketFilters", input.ticketFilters);
  assign("columns", input.columns);
  return document;
}
