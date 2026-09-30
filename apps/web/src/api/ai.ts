import {
  aiStatus,
  autocompleteResponse,
  incidentResponse,
  suggestAreaResponse,
  summaryResponse,
  type AiStatus,
  type AreaSuggestion,
  type AutocompleteInput,
  type IncidentGroup,
  type SuggestAreaInput,
  type SummaryResponse,
} from "@tekzaya/shared";
import { apiFetch } from "./client";

export const aiKeys = {
  status: ["ai", "status"] as const,
  summary: (ticketId: string) => ["ai", "summary", ticketId] as const,
};

/**
 * Lo primero que pregunta la interfaz. Todo lo de IA se pinta solo si esto dice
 * que sí, para no prometer nada que no pueda ocurrir (spec §6.3).
 */
export function getAiStatus(): Promise<AiStatus> {
  return apiFetch("/ai/status", aiStatus);
}

export async function suggestArea(input: SuggestAreaInput): Promise<AreaSuggestion | null> {
  return (
    await apiFetch("/ai/suggest-area", suggestAreaResponse, {
      method: "POST",
      body: JSON.stringify(input),
    })
  ).suggestion;
}

export function getSummary(ticketId: string): Promise<SummaryResponse> {
  return apiFetch(`/ai/tickets/${ticketId}/summary`, summaryResponse);
}

export function regenerateSummary(ticketId: string): Promise<SummaryResponse> {
  return apiFetch(`/ai/tickets/${ticketId}/summary`, summaryResponse, { method: "POST" });
}

export async function autocomplete(input: AutocompleteInput): Promise<string | null> {
  return (
    await apiFetch("/ai/autocomplete", autocompleteResponse, {
      method: "POST",
      body: JSON.stringify(input),
    })
  ).completion;
}

export async function detectIncident(ticketId: string): Promise<IncidentGroup | null> {
  return (
    await apiFetch(`/ai/tickets/${ticketId}/incident`, incidentResponse, { method: "POST" })
  ).incident;
}

export async function dismissIncident(ticketId: string): Promise<void> {
  await fetch(`/api/v1/tickets/${ticketId}/incident/dismiss`, {
    method: "POST",
    credentials: "include",
  });
}
