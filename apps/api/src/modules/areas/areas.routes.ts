import { ACTIVE_TICKET_STATUSES, isAdmin, type AreaMember } from "@tekzaya/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Area } from "../../models/area.model";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { routeParam } from "../tickets/ticket.access";

const router = Router();

/**
 * Catálogo de áreas y categorías. Lo consumen el formulario de nuevo ticket y
 * los filtros; las desactivadas no aparecen porque ya no admiten tickets nuevos.
 */
router.get("/areas", async (_req, res) => {
  const areas = await Area.find({ isActive: { $ne: false } })
    .sort({ name: 1 })
    .lean();

  res.json({
    items: areas.map((area) => ({
      id: String(area._id),
      name: area.name,
      ...(area.description ? { description: area.description } : {}),
      color: area.color,
      isActive: area.isActive !== false,
      categories: (area.categories ?? [])
        .filter((category) => category.isActive !== false)
        .map((category) => ({
          id: String(category._id),
          name: category.name,
          isActive: category.isActive !== false,
        })),
    })),
  });
});

/**
 * Miembros de un área con su carga actual. Alimenta el selector "en nombre de un
 * compañero" y el modal de asignación, que muestra cuántos tickets abiertos
 * lleva cada persona antes de cargarle otro (spec §7.4).
 */
router.get("/areas/:id/members", async (req, res) => {
  const actor = res.locals.actor;
  const areaId = routeParam(req.params["id"]);
  if (!Types.ObjectId.isValid(areaId)) throw new AppError(404, "not_found", "Esa área no existe");

  if (!isAdmin(actor) && actor.areaId !== areaId) {
    throw new AppError(403, "forbidden", "Solo puedes consultar los miembros de tu área");
  }

  const members = await User.find({ areaId, status: "active" })
    .select("name avatarUrl availability")
    .sort({ name: 1 })
    .lean();

  const load = await Ticket.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $match: {
        assigneeIds: { $in: members.map((member) => member._id) },
        status: { $in: [...ACTIVE_TICKET_STATUSES] },
      },
    },
    { $unwind: "$assigneeIds" },
    { $group: { _id: "$assigneeIds", count: { $sum: 1 } } },
  ]);
  const openByUser = new Map(load.map((row) => [String(row._id), row.count]));

  const items: AreaMember[] = members.map((member) => ({
    id: String(member._id),
    name: member.name!,
    ...(member.avatarUrl ? { avatarUrl: member.avatarUrl } : {}),
    availability: {
      state: (member.availability?.state ?? "available") as "available" | "away",
      ...(member.availability?.awayUntil
        ? { awayUntil: member.availability.awayUntil.toISOString() }
        : {}),
    },
    openTickets: openByUser.get(String(member._id)) ?? 0,
  }));

  res.json({ items });
});

export default router;
