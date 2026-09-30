import { z } from "zod";
import { isoDateTime, objectId } from "./common";
import { availabilityState, awayReason, role, userStatus, type Role } from "./enums";

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

/** Etiqueta del rol efectivo, derivada del rol base más las banderas (spec §4.2). */
export function roleLabelOf(user: {
  role: Role;
  isAreaSupervisor: boolean;
  hasGlobalReadAccess: boolean;
}): string {
  if (user.role === "admin") return "Administrador";
  if (user.hasGlobalReadAccess) return "Supervisor de RRHH";
  if (user.isAreaSupervisor) return "Supervisor de área";
  return "Empleado";
}

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

// ── Administración de personas (spec §7.7) ────────────────────

/** Fila de la tabla de Usuarios: lo que el administrador necesita ver de un vistazo. */
export const adminUser = user.extend({
  areaName: z.string(),
  /** Falso mientras la invitación siga sin aceptarse: aún no eligió contraseña. */
  hasPassword: z.boolean(),
  /** Tickets activos que tiene asignados; avisa antes de desactivar a alguien. */
  openTickets: z.number().int().min(0),
});
export type AdminUser = z.infer<typeof adminUser>;

export const updateUserInput = z.object({
  name: z.string().min(2).max(80).optional(),
  areaId: objectId.optional(),
  role: role.optional(),
  isAreaSupervisor: z.boolean().optional(),
  hasGlobalReadAccess: z.boolean().optional(),
  /** Nadie se borra: se desactiva, para no perder el historial (spec §7.7). */
  status: z.enum(["active", "disabled"]).optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserInput>;

/**
 * En la Fase 1 no se envía correo: el administrador copia el enlace y lo comparte
 * por su cuenta. El servidor solo guarda su huella, así que este texto es la
 * única copia que existe y no se puede volver a consultar.
 */
export const accessLink = z.object({
  url: z.string(),
  expiresAt: isoDateTime,
});
export type AccessLink = z.infer<typeof accessLink>;

/** Mínimo razonable sin caer en reglas que empujan a apuntar la contraseña. */
export const newPassword = z
  .string()
  .min(10, "Al menos 10 caracteres")
  .max(128)
  .refine((value) => /[a-zA-Z]/.test(value) && /[0-9]/.test(value), {
    message: "Combina letras y números",
  });

export const acceptInviteInput = z.object({
  token: z.string().min(20),
  name: z.string().min(2).max(80).optional(),
  password: newPassword,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteInput>;

export const resetPasswordInput = z.object({
  token: z.string().min(20),
  password: newPassword,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInput>;

/** Lo que la pantalla de invitación muestra antes de pedir la contraseña. */
export const invitePreview = z.object({
  name: z.string(),
  email: z.email(),
  areaName: z.string(),
  purpose: z.enum(["invite", "reset"]),
});
export type InvitePreview = z.infer<typeof invitePreview>;
