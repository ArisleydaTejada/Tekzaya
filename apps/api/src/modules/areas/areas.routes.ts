import {
  ACTIVE_TICKET_STATUSES,
  isAdmin,
  slaStateAt,
  WORKLOAD_WEIGHTS,
  type AreaMember,
  type AreaWorkloadMember,
  type Priority,
} from "@tekzaya/shared";
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

  // `hasGlobalReadAccess` entra aquí porque RRHH necesita elegir "una persona" en
  // Reportes (spec §7.8.1) y ya ve la disponibilidad de todas las áreas en el tablero.
  // Sigue siendo lectura: no le da ningún permiso de gestión sobre esas personas.
  if (!isAdmin(actor) && !actor.hasGlobalReadAccess && actor.areaId !== areaId) {
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

/**
 * Carga por persona para el modal de asignación (spec §7.5). Se calcula en el
 * servidor porque hace falta mirar todos los tickets activos del área, y el
 * navegador solo tiene la página que está viendo.
 */
router.get("/areas/:id/workload", async (req, res) => {
  const actor = res.locals.actor;
  const areaId = routeParam(req.params["id"]);
  if (!Types.ObjectId.isValid(areaId)) throw new AppError(404, "not_found", "Esa área no existe");

  if (!isAdmin(actor) && actor.areaId !== areaId) {
    throw new AppError(403, "forbidden", "Solo puedes consultar la carga de tu área");
  }

  const members = await User.find({ areaId, status: "active" })
    .select("name avatarUrl availability")
    .sort({ name: 1 })
    .lean();
  const memberIds = members.map((member) => member._id);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [active, resolved] = await Promise.all([
    Ticket.find({ assigneeIds: { $in: memberIds }, status: { $in: [...ACTIVE_TICKET_STATUSES] } })
      .select("assigneeIds priority sla status")
      .lean(),
    Ticket.aggregate<{ _id: unknown; count: number }>([
      { $match: { "sla.resolvedByIds": { $in: memberIds }, "sla.resolvedAt": { $gte: weekAgo } } },
      { $unwind: "$sla.resolvedByIds" },
      { $group: { _id: "$sla.resolvedByIds", count: { $sum: 1 } } },
    ]),
  ]);

  const resolvedByUser = new Map(resolved.map((row) => [String(row._id), row.count]));
  const now = new Date();

  interface Tally {
    openTickets: number;
    urgentOrHigh: number;
    atRisk: number;
    load: number;
  }
  const tally = new Map<string, Tally>(
    members.map((member) => [
      String(member._id),
      { openTickets: 0, urgentOrHigh: 0, atRisk: 0, load: 0 },
    ]),
  );

  for (const ticket of active) {
    const priority = (ticket.priority ?? "medium") as Priority;
    // Un ticket en riesgo o vencido pesa por su prioridad y además se cuenta
    // aparte: son los que el supervisor necesita ver antes de cargar a nadie más.
    const state = slaStateAt(now, {
      dueAt: ticket.sla!.resolutionDueAt as Date,
      riskAt: ticket.sla!.resolutionRiskAt as Date,
    });
    for (const assignee of ticket.assigneeIds ?? []) {
      const entry = tally.get(String(assignee));
      if (!entry) continue;
      entry.openTickets += 1;
      entry.load += WORKLOAD_WEIGHTS[priority];
      if (priority === "urgent" || priority === "high") entry.urgentOrHigh += 1;
      if (state !== "on_time") entry.atRisk += 1;
    }
  }

  const items: AreaWorkloadMember[] = members.map((member) => {
    const entry = tally.get(String(member._id))!;
    return {
      id: String(member._id),
      name: member.name!,
      ...(member.avatarUrl ? { avatarUrl: member.avatarUrl } : {}),
      availability: {
        state: (member.availability?.state ?? "available") as "available" | "away",
        ...(member.availability?.awayUntil
          ? { awayUntil: member.availability.awayUntil.toISOString() }
          : {}),
      },
      openTickets: entry.openTickets,
      urgentOrHigh: entry.urgentOrHigh,
      atRisk: entry.atRisk,
      resolvedThisWeek: resolvedByUser.get(String(member._id)) ?? 0,
      load: entry.load,
      suggested: false,
    };
  });

  // La sugerencia es la persona DISPONIBLE con menos carga ponderada. Quien está
  // ausente nunca se sugiere, aunque tenga el tablero vacío (spec §7.5).
  const candidates = items.filter((member) => member.availability.state === "available");
  const best = candidates.reduce<AreaWorkloadMember | null>(
    (lowest, member) => (lowest === null || member.load < lowest.load ? member : lowest),
    null,
  );
  if (best) best.suggested = true;

  res.json({ items });
});
