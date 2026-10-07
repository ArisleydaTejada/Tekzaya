import {
  ACTIVE_TICKET_STATUSES,
  canSetAvailabilityOf,
  changePasswordInput,
  updateAvailabilityInput,
  updateProfileInput,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from "@tekzaya/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { AppError } from "../../middleware/errors";
import { validateBody } from "../../middleware/validate";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import { AvailabilityLog } from "../../models/support.models";
import { buildMeResponse } from "../auth/auth.service";
import { notify, supervisorsOf } from "../notifications/notifications.service";

const router = Router();

router.get("/me", async (_req, res) => {
  res.json(await buildMeResponse(res.locals.actor.id));
});

// ── Mi perfil (pantalla "Administrar perfil") ─────────────

/**
 * El nombre es lo único de la ficha que cada quien corrige por su cuenta: es
 * cómo aparece firmando en cada ticket. El correo identifica la cuenta y el área
 * y el rol los decide quien administra, así que no entran por aquí.
 */
router.patch("/me", validateBody(updateProfileInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as UpdateProfileInput;

  await User.updateOne({ _id: actor.id }, { $set: { name: input.name } });
  res.json(await buildMeResponse(actor.id));
});

/**
 * Cambiar la contraseña desde dentro. Se pide la actual aunque la sesión ya esté
 * abierta: sin eso, cualquiera que encuentre un equipo sin bloquear se queda con
 * la cuenta. Quien entró con Google y nunca puso contraseña no tiene ninguna que
 * confirmar, así que se le manda al enlace de acceso.
 */
router.post("/me/password", validateBody(changePasswordInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as ChangePasswordInput;

  const user = await User.findById(actor.id).select("+passwordHash");
  if (!user) throw new AppError(404, "not_found", "Esa cuenta no existe");

  const hash = user.get("passwordHash") as string | undefined;
  if (!hash) {
    throw new AppError(
      409,
      "no_password",
      "Tu cuenta entra con Google y no tiene contraseña; pídele al administrador un enlace para crear una",
    );
  }
  if (!(await bcrypt.compare(input.currentPassword, hash))) {
    throw new AppError(422, "invalid_credentials", "La contraseña actual no es correcta");
  }

  user.set("passwordHash", await bcrypt.hash(input.password, 10));
  await user.save();

  res.status(204).end();
});

type AvailabilityBody = {
  state: "available" | "away";
  reason?: "vacation" | "leave" | "sick" | "other";
  awayUntil?: string;
};

async function applyAvailability(
  targetId: string,
  changedById: string,
  body: AvailabilityBody,
): Promise<void> {
  const user = await User.findById(targetId);
  if (!user) throw new AppError(404, "not_found", "Esa persona no existe");

  user.set("availability", {
    state: body.state,
    reason: body.reason,
    awayUntil: body.awayUntil ? new Date(body.awayUntil) : undefined,
    updatedById: changedById,
  });
  await user.save();

  // Cierra el tramo anterior y abre el nuevo: es lo que alimenta la medida
  // "Días de ausencia" de los reportes (spec §11).
  await AvailabilityLog.updateMany({ userId: targetId, to: null }, { $set: { to: new Date() } });
  await AvailabilityLog.create({
    userId: targetId,
    state: body.state,
    reason: body.reason,
    from: new Date(),
    changedById,
  });

  // Marcarse ausente con tickets encima es un hueco que alguien tiene que cubrir, y
  // el supervisor no puede enterarse por casualidad (spec §8, última fila).
  if (body.state === "away") {
    const open = await Ticket.countDocuments({
      assigneeIds: targetId,
      status: { $in: [...ACTIVE_TICKET_STATUSES] },
    });
    if (open > 0) {
      const supervisors = (await supervisorsOf(String(user.get("areaId")))).filter(
        (id) => id !== targetId && id !== changedById,
      );
      await notify(supervisors, {
        type: "assignee_away",
        title: `${user.get("name")} se marcó como ausente`,
        body: `Tiene ${open} ticket(s) sin resolver asignados.`,
      });
    }
  }
}

router.patch("/me/availability", validateBody(updateAvailabilityInput), async (req, res) => {
  const actor = res.locals.actor;
  await applyAvailability(actor.id, actor.id, req.body as AvailabilityBody);
  res.json(await buildMeResponse(actor.id));
});

router.patch("/users/:id/availability", validateBody(updateAvailabilityInput), async (req, res) => {
  const actor = res.locals.actor;
  const rawId = req.params["id"];
  const targetId = Array.isArray(rawId) ? rawId[0]! : rawId!;

  const target = await User.findById(targetId).lean();
  if (!target) throw new AppError(404, "not_found", "Esa persona no existe");

  if (!canSetAvailabilityOf(actor, { id: targetId, areaId: String(target.areaId) })) {
    throw new AppError(403, "forbidden", "Solo su supervisor puede cambiar su disponibilidad");
  }

  await applyAvailability(targetId, actor.id, req.body as AvailabilityBody);
  res.status(204).end();
});

export default router;
