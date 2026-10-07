import {
  ACTIVE_TICKET_STATUSES,
  canGrantPrivileges,
  formatTicketNumber,
  inviteUserInput,
  updateUserInput,
  type Actor,
  type AdminUser,
  type InviteUserInput,
  type UpdateUserInput,
} from "@tekzaya/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { requireUserManager } from "../../middleware/auth";
import { AppError } from "../../middleware/errors";
import { validateBody } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { notify, supervisorsOf } from "../notifications/notifications.service";
import { routeParam, type TicketDoc } from "../tickets/ticket.access";
import { applyStatusChange, recordSystemEvent } from "../tickets/ticket.lifecycle";
import { issueAccessLink } from "./accessLinks.service";

const router = Router();

// La administración de personas la comparten el administrador y RRHH (spec §7.7).
router.use("/users", requireUserManager);

/**
 * El reparto de privilegios no viaja con el resto de la ficha: lo que decide si
 * alguien es administrador o supervisor de RRHH solo lo toca el administrador, y
 * una cuenta que ya es administradora no la edita nadie más.
 *
 * Se comprueba aquí y no en la pantalla porque la pantalla solo esconde botones.
 */
function assertMayGrant(
  actor: Actor,
  input: { role?: string; hasGlobalReadAccess?: boolean },
  target?: { role?: string },
): void {
  if (canGrantPrivileges(actor)) return;

  if (input.role === "admin") {
    throw new AppError(403, "forbidden", "Solo el administrador nombra administradores");
  }
  if (input.hasGlobalReadAccess === true) {
    throw new AppError(403, "forbidden", "Solo el administrador concede la lectura global de RRHH");
  }
  if (target?.role === "admin") {
    throw new AppError(403, "forbidden", "Solo el administrador edita una cuenta de administrador");
  }
}

function toAdminUser(
  user: Record<string, any>,
  areaName: string,
  openTickets: number,
): AdminUser {
  return {
    id: String(user["_id"]),
    name: user["name"],
    email: user["email"],
    areaId: String(user["areaId"]),
    areaName,
    role: user["role"] ?? "employee",
    isAreaSupervisor: user["isAreaSupervisor"] ?? false,
    hasGlobalReadAccess: user["hasGlobalReadAccess"] ?? false,
    status: user["status"] ?? "invited",
    availability: {
      state: user["availability"]?.state ?? "available",
      ...(user["availability"]?.reason ? { reason: user["availability"].reason } : {}),
      ...(user["availability"]?.awayUntil
        ? { awayUntil: (user["availability"].awayUntil as Date).toISOString() }
        : {}),
    },
    hasPassword: Boolean(user["passwordHash"]),
    openTickets,
    ...(user["avatarUrl"] ? { avatarUrl: user["avatarUrl"] } : {}),
    ...(user["lastLoginAt"] ? { lastLoginAt: (user["lastLoginAt"] as Date).toISOString() } : {}),
  };
}

async function listAdminUsers(filter: Record<string, unknown>): Promise<AdminUser[]> {
  const users = await User.find(filter).select("+passwordHash").sort({ name: 1 }).lean();
  const areas = await Area.find().select("name").lean();
  const areaName = new Map(areas.map((area) => [String(area._id), area.name ?? "Sin área"]));

  const load = await Ticket.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { status: { $in: [...ACTIVE_TICKET_STATUSES] } } },
    { $unwind: "$assigneeIds" },
    { $group: { _id: "$assigneeIds", count: { $sum: 1 } } },
  ]);
  const openByUser = new Map(load.map((row) => [String(row._id), row.count]));

  return users.map((user) =>
    toAdminUser(
      user,
      areaName.get(String(user.areaId)) ?? "Sin área",
      openByUser.get(String(user._id)) ?? 0,
    ),
  );
}

router.get("/users", async (req, res) => {
  const filter: Record<string, unknown> = {};
  const { q, areaId, status } = req.query as Record<string, string | undefined>;

  if (areaId && Types.ObjectId.isValid(areaId)) filter["areaId"] = areaId;
  if (status) filter["status"] = status;
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter["$or"] = [
      { name: { $regex: escaped, $options: "i" } },
      { email: { $regex: escaped, $options: "i" } },
    ];
  }

  res.json({ items: await listAdminUsers(filter) });
});

// ── Invitar ───────────────────────────────────────────────────

router.post("/users", validateBody(inviteUserInput), async (req, res) => {
  const input = req.body as InviteUserInput;
  const email = input.email.toLowerCase();

  assertMayGrant(res.locals.actor, input);

  if (await User.exists({ email })) {
    throw new AppError(409, "email_taken", "Ya existe una cuenta con ese correo");
  }
  const area = await Area.findById(input.areaId).select("name isActive").lean();
  if (!area || area.isActive === false) {
    throw new AppError(422, "validation_error", "Esa área no existe o está desactivada");
  }

  // Nace "invitada" y sin contraseña: la elige la persona al abrir el enlace, así
  // que el administrador nunca conoce la contraseña de nadie (spec §10.4).
  const created = await User.create({
    name: input.name,
    email,
    areaId: input.areaId,
    role: input.role,
    isAreaSupervisor: input.isAreaSupervisor,
    hasGlobalReadAccess: input.hasGlobalReadAccess,
    status: "invited",
  });

  const link = await issueAccessLink(String(created._id), "invite");
  const [user] = await listAdminUsers({ _id: created._id });

  res.status(201).json({ user, link });
});

router.post("/users/:id/access-link", async (req, res) => {
  const id = routeParam(req.params["id"]);
  const user = await User.findById(id).select("status role").lean();
  if (!user) throw new AppError(404, "not_found", "Esa persona no existe");
  assertMayGrant(res.locals.actor, {}, { role: user.role });
  if (user.status === "disabled") {
    throw new AppError(409, "account_disabled", "Reactiva la cuenta antes de generar un enlace");
  }

  // Una cuenta que aún no entró recibe otra invitación; una activa, un enlace
  // para cambiar la contraseña.
  const purpose = user.status === "invited" ? "invite" : "reset";
  res.json(await issueAccessLink(id, purpose));
});

// ── Editar y desactivar ───────────────────────────────────────

/**
 * Al desactivar a alguien hay que sacarlo de sus tickets: si no, quedarían
 * asignados a quien ya no entra. Los que se quedan sin ningún responsable
 * vuelven a *Abierto* y su supervisor recibe el aviso (spec §7.7).
 */
async function releaseTickets(userId: string, actor: { id: string }): Promise<number> {
  const tickets = (await Ticket.find({
    assigneeIds: userId,
    status: { $in: [...ACTIVE_TICKET_STATUSES] },
  })) as TicketDoc[];

  const orphaned: TicketDoc[] = [];
  const at = new Date();

  for (const ticket of tickets) {
    const remaining = (ticket.get("assigneeIds") as unknown[])
      .map(String)
      .filter((id) => id !== userId);

    ticket.set("assigneeIds", remaining.map((id) => new Types.ObjectId(id)));
    for (const entry of ticket.get("assigneeHistory") as { userId: unknown; to?: Date }[]) {
      if (!entry.to && String(entry.userId) === userId) entry.to = at;
    }

    if (remaining.length === 0 && ticket.get("status") !== "open") {
      await applyStatusChange(ticket, "open", actor as never, at);
      orphaned.push(ticket);
    }
    ticket.set("lastActivityAt", at);
    await ticket.save();

    await recordSystemEvent(
      ticket._id as never,
      {
        kind: "assignees_changed",
        to: remaining.length ? `${remaining.length} responsables` : "sin responsables",
        reason: "Se desactivó a una de las personas asignadas",
      },
      at,
    );
  }

  for (const ticket of orphaned) {
    await notify(await supervisorsOf(String(ticket.get("areaId"))), {
      type: "ticket_unassigned",
      title: "Un ticket se quedó sin responsable",
      body: `${formatTicketNumber(ticket.get("number"))} volvió a Abierto al desactivar a su responsable.`,
      ticketId: ticket._id as never,
    });
  }

  return tickets.length;
}

router.patch("/users/:id", validateBody(updateUserInput), async (req, res) => {
  const actor = res.locals.actor;
  const id = routeParam(req.params["id"]);
  const input = req.body as UpdateUserInput;

  const user = await User.findById(id);
  if (!user) throw new AppError(404, "not_found", "Esa persona no existe");

  assertMayGrant(actor, input, { role: user.get("role") });

  // Quedarse sin administrador deja el sistema sin quien lo administre, y no hay
  // forma de recuperarlo desde la propia aplicación.
  const losesAdmin =
    user.get("role") === "admin" &&
    ((input.role !== undefined && input.role !== "admin") || input.status === "disabled");
  if (losesAdmin) {
    const otherAdmins = await User.countDocuments({
      _id: { $ne: user._id },
      role: "admin",
      status: "active",
    });
    if (otherAdmins === 0) {
      throw new AppError(
        409,
        "last_admin",
        "Es la única cuenta de administrador activa: nombra a otra antes de cambiarla",
      );
    }
  }
  if (String(user._id) === actor.id && input.status === "disabled") {
    throw new AppError(409, "self_disable", "No puedes desactivar tu propia cuenta");
  }

  if (input.areaId && input.areaId !== String(user.get("areaId"))) {
    const area = await Area.findById(input.areaId).select("isActive").lean();
    if (!area || area.isActive === false) {
      throw new AppError(422, "validation_error", "Esa área no existe o está desactivada");
    }
    // Cambiar de área deja de ser supervisor de la anterior; el administrador
    // vuelve a marcarlo si toca supervisar la nueva.
    user.set("isAreaSupervisor", input.isAreaSupervisor ?? false);
    user.set("areaId", input.areaId);
  }

  for (const field of ["name", "role", "isAreaSupervisor", "hasGlobalReadAccess"] as const) {
    if (input[field] !== undefined) user.set(field, input[field]);
  }

  let released = 0;
  if (input.status && input.status !== user.get("status")) {
    if (input.status === "disabled") {
      released = await releaseTickets(id, actor);
      user.set("status", "disabled");
      user.set("disabledAt", new Date());
      user.set("disabledById", actor.id);
      // Una cuenta desactivada no debe conservar enlaces de acceso vivos.
      user.set("accessTokenHash", undefined);
      user.set("accessTokenPurpose", undefined);
      user.set("accessTokenExpiresAt", undefined);
    } else {
      user.set("status", "active");
      user.set("disabledAt", undefined);
      user.set("disabledById", undefined);
      user.set("failedLoginAttempts", 0);
      user.set("lockedUntil", undefined);
    }
  }

  await user.save();
  const [updated] = await listAdminUsers({ _id: user._id });
  res.json({ user: updated, releasedTickets: released });
});

export default router;
