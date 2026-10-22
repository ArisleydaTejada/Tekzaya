import {
  aiStatus,
  autocompleteResponse,
  classifyResponse,
  incidentResponse,
  repairEstimateResponse,
  replacementAdviceResponse,
  suggestAreaResponse,
  summaryResponse,
  type AiStatus,
  type AreaSuggestion,
  type AutocompleteInput,
  type Classification,
  type IncidentGroup,
  type RepairEstimateResponse,
  type ReplacementAdvice,
  type SuggestAreaInput,
  type SummaryResponse,
} from "@tekzaya/shared";
import { apiFetch, sessionFetch } from "./client";

export const aiKeys = {
  status: ["ai", "status"] as const,
  summary: (ticketId: string) => ["ai", "summary", ticketId] as const,
  replacement: (assetId: string) => ["ai", "replacement", assetId] as const,
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

/** IA-2 a petición: clasifica un ticket que ya existe y devuelve lo que decidió. */
export async function classifyTicket(ticketId: string): Promise<Classification | null> {
  return (
    await apiFetch(`/ai/tickets/${ticketId}/classify`, classifyResponse, { method: "POST" })
  ).classification;
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
  await sessionFetch(`/tickets/${ticketId}/incident/dismiss`, {
    method: "POST",
    credentials: "include",
  });
}

// ── Módulo 2 (plan A7) ────────────────────────────────────────

/** `null` si el equipo no es candidato a reemplazo o no hay IA: la tarjeta no se monta. */
export async function getReplacementAdvice(assetId: string): Promise<ReplacementAdvice | null> {
  return (await apiFetch(`/ai/assets/${assetId}/replacement`, replacementAdviceResponse)).advice;
}

export function estimateRepair(workOrderId: string): Promise<RepairEstimateResponse> {
  return apiFetch(`/ai/work-orders/${workOrderId}/estimate`, repairEstimateResponse, { method: "POST" });
}
