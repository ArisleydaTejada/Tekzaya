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
  const response = await fetch(`${BASE_URL}${path}`, {
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
  const response = await fetch(`${BASE_URL}${path}`, {
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
