import {
  accessLink,
  adminArea,
  adminUser,
  invitePreview,
  meResponse,
  type AcceptInviteInput,
  type AccessLink,
  type AdminArea,
  type AdminUser,
  type CategoryInput,
  type CreateAreaInput,
  type InvitePreview,
  type InviteUserInput,
  type MeResponse,
  type ResetPasswordInput,
  type SetSupervisorsInput,
  type UpdateAreaInput,
  type UpdateUserInput,
} from "@tekzaya/shared";
import { z } from "zod";
import { apiFetch } from "./client";

const usersResponse = z.object({ items: z.array(adminUser) });
const areasResponse = z.object({ items: z.array(adminArea) });
const inviteResponse = z.object({ user: adminUser, link: accessLink });
const userResponse = z.object({
  user: adminUser,
  /** Tickets de los que se sacó a la persona al desactivarla. */
  releasedTickets: z.number().int().min(0),
});

export const adminKeys = {
  users: (query: Record<string, string>) => ["admin", "users", query] as const,
  areas: ["admin", "areas"] as const,
};

// ── Personas ──────────────────────────────────────────────────

export async function listUsers(query: Record<string, string> = {}): Promise<AdminUser[]> {
  const search = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== ""),
  ).toString();
  return (await apiFetch(`/users${search ? `?${search}` : ""}`, usersResponse)).items;
}

export function inviteUser(input: InviteUserInput) {
  return apiFetch("/users", inviteResponse, { method: "POST", body: JSON.stringify(input) });
}

export function updateUser(id: string, input: UpdateUserInput) {
  return apiFetch(`/users/${id}`, userResponse, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** Devuelve el enlace una sola vez: el servidor guarda solo su huella. */
export function createAccessLink(id: string): Promise<AccessLink> {
  return apiFetch(`/users/${id}/access-link`, accessLink, { method: "POST" });
}

// ── Áreas ─────────────────────────────────────────────────────

export async function listAdminAreas(): Promise<AdminArea[]> {
  return (await apiFetch("/admin/areas", areasResponse)).items;
}

export async function createArea(input: CreateAreaInput): Promise<AdminArea[]> {
  return (
    await apiFetch("/admin/areas", areasResponse, {
      method: "POST",
      body: JSON.stringify(input),
    })
  ).items;
}

export async function updateArea(id: string, input: UpdateAreaInput): Promise<AdminArea[]> {
  return (
    await apiFetch(`/admin/areas/${id}`, areasResponse, {
      method: "PATCH",
      body: JSON.stringify(input),
    })
  ).items;
}

export async function addCategory(areaId: string, input: CategoryInput): Promise<AdminArea[]> {
  return (
    await apiFetch(`/admin/areas/${areaId}/categories`, areasResponse, {
      method: "POST",
      body: JSON.stringify(input),
    })
  ).items;
}

export async function updateCategory(
  areaId: string,
  categoryId: string,
  input: Partial<CategoryInput>,
): Promise<AdminArea[]> {
  return (
    await apiFetch(`/admin/areas/${areaId}/categories/${categoryId}`, areasResponse, {
      method: "PATCH",
      body: JSON.stringify(input),
    })
  ).items;
}

export async function setSupervisors(
  areaId: string,
  input: SetSupervisorsInput,
): Promise<AdminArea[]> {
  return (
    await apiFetch(`/admin/areas/${areaId}/supervisors`, areasResponse, {
      method: "PUT",
      body: JSON.stringify(input),
    })
  ).items;
}

// ── Invitación y restablecimiento (sin sesión) ────────────────

export function readAccessLink(
  token: string,
  purpose: "invite" | "reset",
): Promise<InvitePreview> {
  return apiFetch(
    `/auth/access?token=${encodeURIComponent(token)}&purpose=${purpose}`,
    invitePreview,
  );
}

export function acceptInvite(input: AcceptInviteInput): Promise<MeResponse> {
  return apiFetch("/auth/accept-invite", meResponse, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function resetPassword(input: ResetPasswordInput): Promise<MeResponse> {
  return apiFetch("/auth/reset-password", meResponse, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
