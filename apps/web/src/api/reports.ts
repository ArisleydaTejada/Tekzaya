import {
  createReportInput as createReportInputSchema,
  reportCatalog,
  reportQueryResult,
  reportTicketsResponse,
  savedReport,
  savedReportList,
  updateReportInput as updateReportInputSchema,
  type CreateReportInput,
  type ReportCatalog,
  type ReportQueryResult,
  type ReportTicketsResponse,
  type ReportWidget,
  type SavedReport,
  type StatsQueryFields,
  type UpdateReportInput,
} from "@tekzaya/shared";
import { apiFetch, queryString } from "./client";

/**
 * Lo que el cliente **pide**. El alcance que devuelve el servidor puede ser más
 * estrecho: él lo recalcula desde la sesión en cada consulta (spec §7.8.1).
 */
export type ReportScopeRequest = Partial<StatsQueryFields>;

export const reportKeys = {
  all: ["reports"] as const,
  catalog: () => [...reportKeys.all, "catalog"] as const,
  saved: () => [...reportKeys.all, "saved"] as const,
  one: (id: string) => [...reportKeys.all, "saved", id] as const,
  widget: (scope: ReportScopeRequest, widget: ReportWidget) =>
    [...reportKeys.all, "widget", scope, widget] as const,
  tickets: (query: Record<string, unknown>) => [...reportKeys.all, "tickets", query] as const,
};

export function getReportCatalog(): Promise<ReportCatalog> {
  return apiFetch("/reports/catalog", reportCatalog);
}

/**
 * Una llamada por gráfica, no una por reporte: cada tarjeta carga y falla por su
 * cuenta, así que un error en una no deja la página en blanco (spec §7.8.8).
 */
export function runReportWidget(
  scope: ReportScopeRequest,
  widget: ReportWidget,
): Promise<ReportQueryResult> {
  return apiFetch("/reports/query", reportQueryResult, {
    method: "POST",
    body: JSON.stringify({ ...scope, widget }),
  });
}

export function listReportTickets(
  query: Record<string, unknown>,
): Promise<ReportTicketsResponse> {
  return apiFetch(`/reports/tickets${queryString(query)}`, reportTicketsResponse);
}

// ── Reportes guardados ────────────────────────────────────────

export async function listSavedReports(): Promise<SavedReport[]> {
  return (await apiFetch("/reports", savedReportList)).items;
}

export function getSavedReport(id: string): Promise<SavedReport> {
  return apiFetch(`/reports/${id}`, savedReport);
}

export function createSavedReport(input: CreateReportInput): Promise<SavedReport> {
  return apiFetch("/reports", savedReport, {
    method: "POST",
    body: JSON.stringify(createReportInputSchema.parse(input)),
  });
}

export function updateSavedReport(id: string, input: UpdateReportInput): Promise<SavedReport> {
  return apiFetch(`/reports/${id}`, savedReport, {
    method: "PUT",
    body: JSON.stringify(updateReportInputSchema.parse(input)),
  });
}

export function duplicateSavedReport(id: string): Promise<SavedReport> {
  return apiFetch(`/reports/${id}/duplicate`, savedReport, { method: "POST" });
}

export async function deleteSavedReport(id: string): Promise<void> {
  await fetch(`/api/v1/reports/${id}`, { method: "DELETE", credentials: "include" });
}

// ── Descargas ─────────────────────────────────────────────────

/**
 * El CSV lo arma el servidor con los mismos filtros, el mismo alcance y **todas** las
 * filas, no la página a la vista. Basta con navegar al enlace: la cookie de sesión
 * viaja sola (spec §7.8.9).
 */
export function reportTicketsCsvUrl(query: Record<string, unknown>): string {
  return `/api/v1/reports/tickets/export${queryString(query)}`;
}

/** El CSV de una gráfica va por POST, así que se descarga con un `Blob`. */
export async function downloadWidgetCsv(
  scope: ReportScopeRequest,
  widget: ReportWidget,
): Promise<void> {
  const response = await fetch("/api/v1/reports/query/export", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...scope, widget }),
  });
  if (!response.ok) throw new Error("No se pudo exportar la gráfica");

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${widget.title.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
