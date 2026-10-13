import { z } from "zod";

/** Identificador de MongoDB tal como viaja por la API: 24 caracteres hexadecimales. */
export const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Identificador inválido");
export type ObjectId = z.infer<typeof objectId>;

/** Fecha y hora en ISO 8601 y UTC. Las fechas se guardan en UTC (spec §13). */
export const isoDateTime = z.iso.datetime();

/**
 * Foto de perfil: una URL absoluta (la de Google) o la ruta de la API donde vive la
 * que subió la persona. Esa ruta es relativa porque la sirve el mismo origen.
 */
export const avatarUrl = z
  .string()
  .max(500)
  .refine((value) => value.startsWith("/api/v1/avatars/") || /^https?:\/\/\S+$/.test(value), "URL de foto inválida");

/** Tope de la foto de perfil: una foto de móvil recortada cabe de sobra. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
  });
}

export const apiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Errores por campo, con la misma forma que usa el formulario. */
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ApiError = z.infer<typeof apiError>;

/** `123` → `TK-000123`. El número es legible y distinto del `_id` interno (spec §5.1). */
export function formatTicketNumber(n: number): string {
  return `TK-${String(n).padStart(6, "0")}`;
}

/** "Ana Torres" → "AT". Se deriva del nombre en vez de guardarse por separado. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}
