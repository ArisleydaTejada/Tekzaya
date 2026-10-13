import {
  meResponse,
  type ChangePasswordInput,
  type LoginInput,
  type MeResponse,
  type UpdateAvailabilityInput,
  type UpdateProfileInput,
} from "@tekzaya/shared";
import { z } from "zod";
import { apiFetch, apiUpload } from "./client";

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

// ── Mi perfil ───────────────────────────────────────

export function updateMyProfile(input: UpdateProfileInput): Promise<MeResponse> {
  return apiFetch("/me", meResponse, { method: "PATCH", body: JSON.stringify(input) });
}

export async function changeMyPassword(input: ChangePasswordInput): Promise<void> {
  await apiFetch("/me/password", z.unknown(), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** La respuesta trae el perfil ya con la foto nueva, para no pedirlo otra vez. */
export function uploadMyAvatar(file: File): Promise<MeResponse> {
  const body = new FormData();
  body.append("file", file);
  return apiUpload("/me/avatar", meResponse, body);
}

export function removeMyAvatar(): Promise<MeResponse> {
  return apiFetch("/me/avatar", meResponse, { method: "DELETE" });
}
