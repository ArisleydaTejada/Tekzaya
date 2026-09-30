import { updateSettingsInput, type UpdateSettingsInput } from "@tekzaya/shared";
import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { Settings, SETTINGS_ID } from "../../models/support.models";
import { getSettings, invalidateSettingsCache } from "./settings.service";

const router = Router();

/**
 * Lectura abierta a cualquier sesión: la jornada laboral y los interruptores de
 * IA los necesita la interfaz para explicar plazos y ocultar funciones, y aquí no
 * hay nada secreto — las claves viven en el `.env`, nunca en la base.
 */
router.get("/settings", async (_req, res) => {
  res.json(await getSettings());
});

router.patch("/settings", requireAdmin, validateBody(updateSettingsInput), async (req, res) => {
  const input = req.body as UpdateSettingsInput;

  // Solo se escribe lo que llegó: la pantalla manda el apartado que se tocó.
  const update = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );

  await Settings.findByIdAndUpdate(SETTINGS_ID, { $set: update }, { upsert: true });
  invalidateSettingsCache();

  // Los tickets que ya existen conservan su plazo: cambiar la política no puede
  // vencer de golpe lo que ayer estaba en tiempo. Los nuevos usan la política nueva.
  res.json(await getSettings());
});

export default router;
