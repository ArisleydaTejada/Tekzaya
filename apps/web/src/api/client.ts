import { apiError } from "@tekzaya/shared";
import type { z } from "zod";

const BASE_URL = "/api/v1";

export class ApiRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

// ── Renovación de la sesión ───────────────────────────────────
//
// La cookie de acceso dura 15 minutos y la de renovación, 7 días. Cuando una
// petición vuelve con 401, se pide una cookie de acceso nueva y se repite la
// petición una sola vez. Si la renovación también falla, la sesión terminó de
// verdad y se avisa a quien escuche (el contexto de sesión) para volver al login.

let refreshing: Promise<boolean> | null = null;
const sessionLostListeners = new Set<() => void>();

/** Avisa cuando la sesión no se pudo renovar. Devuelve la función para dejar de escuchar. */
export function onSessionLost(listener: () => void): () => void {
  sessionLostListeners.add(listener);
  return () => sessionLostListeners.delete(listener);
}

/**
 * Renueva la cookie de acceso. Si varias peticiones caducan a la vez, comparten
 * la misma renovación en lugar de lanzar una cada una.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * `fetch` con renovación, para las llamadas que no esperan JSON (borrados,
 * descargas). `path` va sin el prefijo `/api/v1`. Las rutas de `/auth/` no se reintentan: un 401 al
 * iniciar sesión es una contraseña mal escrita, no una sesión caducada.
 */
export async function sessionFetch(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  if (response.status !== 401 || path.startsWith("/auth/")) return response;

  if (await refreshSession()) return fetch(`${BASE_URL}${path}`, init);

  for (const listener of sessionLostListeners) listener();
  return response;
}

/**
 * Punto único de entrada al backend. La respuesta se valida contra el mismo
 * esquema que usa la API, así que un cambio de contrato se nota aquí y no
 * tres pantallas más adelante.
 */
export async function apiFetch<T extends z.ZodType>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const response = await sessionFetch(path, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiError.safeParse(payload);
    throw new ApiRequestError(
      response.status,
      parsed.success ? parsed.data.error.code : "unknown_error",
      parsed.success ? parsed.data.error.message : "No se pudo contactar con el servidor",
    );
  }

  return schema.parse(payload);
}

/**
 * Subida de archivos. No fija `Content-Type`: el navegador lo compone con el
 * `boundary` del formulario, y ponerlo a mano rompe la petición.
 */
export async function apiUpload<T extends z.ZodType>(
  path: string,
  schema: T,
  body: FormData,
): Promise<z.infer<T>> {
  // El mismo `FormData` se puede volver a enviar si hay que repetir la petición.
  const response = await sessionFetch(path, {
    method: "POST",
    credentials: "include",
    body,
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiError.safeParse(payload);
    throw new ApiRequestError(
      response.status,
      parsed.success ? parsed.data.error.code : "unknown_error",
      parsed.success ? parsed.data.error.message : "No se pudo subir el archivo",
    );
  }

  return schema.parse(payload);
}

/** `{ scope: "area", page: 2 }` → `?scope=area&page=2`, saltando lo vacío. */
export function queryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
