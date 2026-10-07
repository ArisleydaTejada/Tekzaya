import { updateSettingsInput, type UpdateSettingsInput } from "@tekzaya/shared";
import { Router } from "express";
import { requireAdmin } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { Settings, SETTINGS_ID } from "../../models/support.models";
import { getSettings, invalidateSettingsCache } from "./settings.service";

const router = Router();

/**
 * Solo el administrador, igual que la escritura: Configuración es una pantalla
 * de administración entera, y de poco sirve esconder la opción en el menú si el
 * endpoint sigue contando la política de SLA a cualquiera que lo pida a mano
 * (spec §4.3, última fila de la matriz).
 *
 * Lo que la interfaz sí necesita para todos — qué funciones de IA hay — viaja
 * por `GET /ai/status`, que no expone nada de la configuración.
 */
router.get("/settings", requireAdmin, async (_req, res) => {
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
