import { healthResponse, type HealthResponse } from "@tekzaya/shared";
import { apiFetch } from "./client";

export function getHealth(): Promise<HealthResponse> {
  return apiFetch("/health", healthResponse);
}
