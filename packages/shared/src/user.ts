import { z } from "zod";
import { isoDateTime, objectId } from "./common";
import { availabilityState, awayReason, role, userStatus } from "./enums";

// Las personas se referencian por identificador, nunca por su nombre.
// Estos esquemas describen lo que la API devuelve: `passwordHash` y `googleId`
// no aparecen aquí y no deben salir nunca del backend.

export const availability = z.object({
  state: availabilityState,
  reason: awayReason.optional(),
  awayUntil: isoDateTime.optional(),
});
export type Availability = z.infer<typeof availability>;

/** Forma mínima para avatares, listas de responsables y miembros de un área. */
export const userSummary = z.object({
  id: objectId,
  name: z.string().min(2).max(80),
  avatarUrl: z.string().url().optional(),
  areaId: objectId,
  availability,
});
export type UserSummary = z.infer<typeof userSummary>;

export const user = userSummary.extend({
  email: z.email(),
  role,
  isAreaSupervisor: z.boolean(),
  hasGlobalReadAccess: z.boolean(),
  status: userStatus,
  lastLoginAt: isoDateTime.optional(),
});
export type User = z.infer<typeof user>;

export const updateAvailabilityInput = z.object({
  state: availabilityState,
  reason: awayReason.optional(),
  awayUntil: isoDateTime.optional(),
});
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilityInput>;

export const inviteUserInput = z.object({
  name: z.string().min(2).max(80),
  email: z.email(),
  areaId: objectId,
  role: role.default("employee"),
  isAreaSupervisor: z.boolean().default(false),
  hasGlobalReadAccess: z.boolean().default(false),
});
export type InviteUserInput = z.infer<typeof inviteUserInput>;
