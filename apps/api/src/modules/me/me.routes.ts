import { canSetAvailabilityOf, updateAvailabilityInput } from "@tekzaya/shared";
import { Router } from "express";
import { AppError } from "../../middleware/errors";
import { validateBody } from "../../middleware/validate";
import { User } from "../../models/user.model";
import { AvailabilityLog } from "../../models/support.models";
import { buildMeResponse } from "../auth/auth.service";

const router = Router();

router.get("/me", async (_req, res) => {
  res.json(await buildMeResponse(res.locals.actor.id));
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
