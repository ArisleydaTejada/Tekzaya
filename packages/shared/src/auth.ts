import { z } from "zod";
import { user } from "./user";

export const loginInput = z.object({
  email: z.email("Escribe un correo válido"),
  password: z.string().min(1, "Escribe tu contraseña"),
});
export type LoginInput = z.infer<typeof loginInput>;

export const googleLoginInput = z.object({
  /** Credencial que devuelve Google Identity Services en el navegador. */
  credential: z.string().min(10),
});
export type GoogleLoginInput = z.infer<typeof googleLoginInput>;

/** `/me`: el perfil más lo que la interfaz necesita para pintar la cabecera. */
export const meResponse = user.extend({
  areaName: z.string(),
  /**
   * Su área mantiene algún equipo (módulo 2): decide si la barra lateral ofrece
   * "Órdenes de trabajo". Las OT son del área responsable del equipo.
   */
  maintainsAssets: z.boolean().default(false),
});
export type MeResponse = z.infer<typeof meResponse>;

/**
 * Respuesta de `GET /auth/session`: la persona con sesión, o `null` si no la hay.
 * No tener sesión no es un error, así que viaja como 200 y no ensucia la consola.
 */
export const sessionResponse = z.object({ me: meResponse.nullable() });
export type SessionResponse = z.infer<typeof sessionResponse>;

/** Motivos de rechazo que la interfaz distingue para dar un mensaje útil. */
export const AUTH_ERROR_CODES = [
  "invalid_credentials",
  "account_locked",
  "account_disabled",
  "google_not_configured",
  "google_domain_not_allowed",
  "unknown_google_account",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
