import {
  availabilityResponse,
  csatInput as csatInputSchema,
  statsByCategory,
  statsByPerson,
  statsOverview,
  statsTimeseries,
  ticketDetail,
  type AvailabilityEntry,
  type CsatInput,
  type StatsByCategory,
  type StatsByPerson,
  type StatsOverview,
  type StatsQuery,
  type StatsTimeseries,
  type TicketDetail,
} from "@tekzaya/shared";
import { apiFetch, queryString } from "./client";

/** Lo que el cliente pide; el servidor decide qué concede (spec §10.4). */
export type StatsRequest = Partial<StatsQuery>;

export const statsKeys = {
  all: ["stats"] as const,
  overview: (query: StatsRequest) => [...statsKeys.all, "overview", query] as const,
  availability: (query: StatsRequest) => [...statsKeys.all, "availability", query] as const,
  timeseries: (query: StatsRequest) => [...statsKeys.all, "timeseries", query] as const,
  byPerson: (query: StatsRequest) => [...statsKeys.all, "by-person", query] as const,
  byCategory: (query: StatsRequest) => [...statsKeys.all, "by-category", query] as const,
};

export function getStatsOverview(query: StatsRequest): Promise<StatsOverview> {
  return apiFetch(`/stats/overview${queryString(query)}`, statsOverview);
}

export async function getTeamAvailability(query: StatsRequest): Promise<AvailabilityEntry[]> {
  return (await apiFetch(`/stats/availability${queryString(query)}`, availabilityResponse)).items;
}

export function getStatsTimeseries(query: StatsRequest): Promise<StatsTimeseries> {
  return apiFetch(`/stats/timeseries${queryString(query)}`, statsTimeseries);
}

export function getStatsByPerson(query: StatsRequest): Promise<StatsByPerson> {
  return apiFetch(`/stats/by-person${queryString(query)}`, statsByPerson);
}

export function getStatsByCategory(query: StatsRequest): Promise<StatsByCategory> {
  return apiFetch(`/stats/by-category${queryString(query)}`, statsByCategory);
}

// ── Encuesta de satisfacción ──────────────────────────────────

export function answerCsat(ticketId: string, input: CsatInput): Promise<TicketDetail> {
  return apiFetch(`/tickets/${ticketId}/csat`, ticketDetail, {
    method: "POST",
    body: JSON.stringify(csatInputSchema.parse(input)),
  });
}

// ── Descargas ─────────────────────────────────────────────────

/**
 * El CSV lo genera el servidor, así que basta con navegar a la URL: la cookie de
 * sesión viaja sola y el navegador se encarga de la descarga. Construirlo con
 * `fetch` y un Blob obligaría a replicar aquí el nombre del archivo.
 */
export function statsCsvUrl(query: StatsRequest): string {
  return `/api/v1/stats/export${queryString(query)}`;
}

export function ticketsCsvUrl(query: Record<string, unknown>): string {
  return `/api/v1/tickets/export${queryString(query)}`;
}
