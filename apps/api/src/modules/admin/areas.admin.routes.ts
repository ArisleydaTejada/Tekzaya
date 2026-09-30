import {
  ACTIVE_TICKET_STATUSES,
  categoryInput,
  createAreaInput,
  setSupervisorsInput,
  updateAreaInput,
  type AdminArea,
  type CategoryInput,
  type CreateAreaInput,
  type SetSupervisorsInput,
  type UpdateAreaInput,
} from "@tekzaya/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { requireAdmin } from "../../middleware/auth";
import { AppError } from "../../middleware/errors";
import { validateBody } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { routeParam } from "../tickets/ticket.access";

const router = Router();

// Las áreas las lee cualquiera (el formulario de nuevo ticket las necesita),
// pero solo el administrador las toca.
router.use("/admin/areas", requireAdmin);

async function listAdminAreas(): Promise<AdminArea[]> {
  const areas = await Area.find().sort({ name: 1 }).lean();
  const areaIds = areas.map((area) => area._id);

  const [supervisors, members, tickets] = await Promise.all([
    User.find({ areaId: { $in: areaIds }, isAreaSupervisor: true, status: "active" })
      .select("name areaId")
      .lean(),
    User.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { areaId: { $in: areaIds }, status: { $ne: "disabled" } } },
      { $group: { _id: "$areaId", count: { $sum: 1 } } },
    ]),
    Ticket.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { areaId: { $in: areaIds }, status: { $in: [...ACTIVE_TICKET_STATUSES] } } },
      { $group: { _id: "$areaId", count: { $sum: 1 } } },
    ]),
  ]);

  const memberCount = new Map(members.map((row) => [String(row._id), row.count]));
  const ticketCount = new Map(tickets.map((row) => [String(row._id), row.count]));

  return areas.map((area) => ({
    id: String(area._id),
    name: area.name!,
    ...(area.description ? { description: area.description } : {}),
    color: area.color!,
    isActive: area.isActive !== false,
    categories: (area.categories ?? []).map((category) => ({
      id: String(category._id),
      name: category.name!,
      isActive: category.isActive !== false,
    })),
    supervisors: supervisors
      .filter((user) => String(user.areaId) === String(area._id))
      .map((user) => ({ id: String(user._id), name: user.name! })),
    memberCount: memberCount.get(String(area._id)) ?? 0,
    activeTickets: ticketCount.get(String(area._id)) ?? 0,
  }));
}

async function loadArea(id: string) {
  if (!Types.ObjectId.isValid(id)) throw new AppError(404, "not_found", "Esa área no existe");
  const area = await Area.findById(id);
  if (!area) throw new AppError(404, "not_found", "Esa área no existe");
  return area;
}

router.get("/admin/areas", async (_req, res) => {
  res.json({ items: await listAdminAreas() });
});

router.post("/admin/areas", validateBody(createAreaInput), async (req, res) => {
  const input = req.body as CreateAreaInput;

  if (await Area.exists({ name: input.name })) {
    throw new AppError(409, "name_taken", "Ya existe un área con ese nombre");
  }

  await Area.create({
    name: input.name,
    description: input.description,
    color: input.color,
    isActive: true,
    categories: input.categories.map((name) => ({ name, isActive: true })),
  });

  res.status(201).json({ items: await listAdminAreas() });
});

router.patch("/admin/areas/:id", validateBody(updateAreaInput), async (req, res) => {
  const input = req.body as UpdateAreaInput;
  const area = await loadArea(routeParam(req.params["id"]));

  if (input.name && input.name !== area.get("name")) {
    if (await Area.exists({ name: input.name, _id: { $ne: area._id } })) {
      throw new AppError(409, "name_taken", "Ya existe un área con ese nombre");
    }
  }

  // Desactivar un área con trabajo vivo dejaría esos tickets sin quien los
  // atienda y sin forma de transferirlos hacia ella.
  if (input.isActive === false) {
    const pending = await Ticket.countDocuments({
      areaId: area._id,
      status: { $in: [...ACTIVE_TICKET_STATUSES] },
    });
    if (pending > 0) {
      throw new AppError(
        409,
        "area_in_use",
        `El área tiene ${pending} tickets sin cerrar: transfiérelos antes de desactivarla`,
      );
    }
  }

  for (const field of ["name", "description", "color", "isActive"] as const) {
    if (input[field] !== undefined) area.set(field, input[field]);
  }
  await area.save();

  res.json({ items: await listAdminAreas() });
});

// ── Categorías ────────────────────────────────────────────────

router.post("/admin/areas/:id/categories", validateBody(categoryInput), async (req, res) => {
  const input = req.body as CategoryInput;
  const area = await loadArea(routeParam(req.params["id"]));

  const categories = area.get("categories") as { name: string }[];
  if (categories.some((category) => category.name.toLowerCase() === input.name.toLowerCase())) {
    throw new AppError(409, "name_taken", "Esa categoría ya existe en el área");
  }

  categories.push({ name: input.name, isActive: true } as never);
  await area.save();

  res.status(201).json({ items: await listAdminAreas() });
});

router.patch(
  "/admin/areas/:id/categories/:categoryId",
  validateBody(categoryInput.partial()),
  async (req, res) => {
    const input = req.body as Partial<CategoryInput>;
    const area = await loadArea(routeParam(req.params["id"]));
    const categoryId = routeParam(req.params["categoryId"]);

    const categories = area.get("categories") as { _id: unknown; name: string; isActive: boolean }[];
    const category = categories.find((item) => String(item._id) === categoryId);
    if (!category) throw new AppError(404, "not_found", "Esa categoría no existe");

    // Las categorías no se borran: se desactivan. Los tickets antiguos siguen
    // apuntando a ellas y los reportes las necesitan para no perder el pasado.
    if (input.name !== undefined) category.name = input.name;
    if (input.isActive !== undefined) category.isActive = input.isActive;
    await area.save();

    res.json({ items: await listAdminAreas() });
  },
);

// ── Supervisores del área ─────────────────────────────────────

router.put("/admin/areas/:id/supervisors", validateBody(setSupervisorsInput), async (req, res) => {
  const input = req.body as SetSupervisorsInput;
  const area = await loadArea(routeParam(req.params["id"]));

  if (input.userIds.length) {
    const belong = await User.countDocuments({
      _id: { $in: input.userIds },
      areaId: area._id,
      status: "active",
    });
    if (belong !== new Set(input.userIds).size) {
      throw new AppError(422, "validation_error", "Solo se supervisa el área a la que se pertenece");
    }
  }

  // Sustitución completa: quien no está en la lista deja de supervisar.
  await User.updateMany({ areaId: area._id }, { $set: { isAreaSupervisor: false } });
  if (input.userIds.length) {
    await User.updateMany({ _id: { $in: input.userIds } }, { $set: { isAreaSupervisor: true } });
  }

  res.json({ items: await listAdminAreas() });
});

export default router;
