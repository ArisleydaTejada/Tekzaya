import {
  meResponse,
  type LoginInput,
  type MeResponse,
  type UpdateAvailabilityInput,
} from "@tekzaya/shared";
import { apiFetch } from "./client";

export function getMe(): Promise<MeResponse> {
  return apiFetch("/me", meResponse);
}

export function login(input: LoginInput): Promise<MeResponse> {
  return apiFetch("/auth/login", meResponse, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loginWithGoogle(credential: string): Promise<MeResponse> {
  return apiFetch("/auth/google", meResponse, {
    method: "POST",
    body: JSON.stringify({ credential }),
  });
}

export async function logout(): Promise<void> {
  await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
}

export function updateMyAvailability(input: UpdateAvailabilityInput): Promise<MeResponse> {
  return apiFetch("/me/availability", meResponse, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
