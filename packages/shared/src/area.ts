import { z } from "zod";
import { objectId } from "./common";

// Las áreas dejan de ser una unión cerrada de literales: el administrador puede
// crearlas y desactivarlas, así que solo el identificador es estable.

export const category = z.object({
  id: objectId,
  name: z.string().min(2).max(60),
  isActive: z.boolean(),
});
export type Category = z.infer<typeof category>;

export const area = z.object({
  id: objectId,
  name: z.string().min(2).max(60),
  description: z.string().max(280).optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  isActive: z.boolean(),
  categories: z.array(category),
});
export type Area = z.infer<typeof area>;

export const createAreaInput = area.pick({ name: true, description: true, color: true }).extend({
  categories: z.array(z.string().min(2).max(60)).default([]),
});
export type CreateAreaInput = z.infer<typeof createAreaInput>;

/** Forma mínima del área tal como viaja dentro de un ticket: etiqueta y color. */
export const areaRef = area.pick({ id: true, name: true, color: true });
export type AreaRef = z.infer<typeof areaRef>;

/** Miembro de un área, para asignar responsables o crear en nombre de un compañero. */
export const areaMember = z.object({
  id: objectId,
  name: z.string(),
  avatarUrl: z.string().url().optional(),
  availability: z.object({
    state: z.enum(["available", "away"]),
    awayUntil: z.iso.datetime().optional(),
  }),
  /** Tickets activos que ya tiene encima; alimenta el modal de asignación (spec §7.4). */
  openTickets: z.number().int().min(0),
});
export type AreaMember = z.infer<typeof areaMember>;
