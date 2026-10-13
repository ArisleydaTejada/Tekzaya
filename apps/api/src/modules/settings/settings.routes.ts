import {
  canManageSettings,
  canManageSystem,
  SYSTEM_ONLY_SETTINGS,
  updateSettingsInput,
  type UpdateSettingsInput,
} from "@tekzaya/shared";
import { Router, type RequestHandler } from "express";
import { AppError } from "../../middleware/errors";
import { validateBody } from "../../middleware/validate";
import { Settings, SETTINGS_ID } from "../../models/support.models";
import { getSettings, invalidateSettingsCache } from "./settings.service";

const router = Router();

/**
 * El administrador y el supervisor de RRHH, igual para leer que para escribir: de
 * poco sirve esconder la opción en el menú si el endpoint sigue contando la
 * política de SLA a cualquiera que lo pida a mano (spec §4.3).
 *
 * Lo que la interfaz sí necesita para todos — qué funciones de IA hay — viaja
 * por `GET /ai/status`, que no expone nada de la configuración.
 */
const requireSettingsManager: RequestHandler = (_req, res, next) => {
  if (!canManageSettings(res.locals.actor)) {
    next(new AppError(403, "forbidden", "Necesitas permisos para cambiar la configuración"));
    return;
  }
  next();
};

router.get("/settings", requireSettingsManager, async (_req, res) => {
  res.json(await getSettings());
});

router.patch("/settings", requireSettingsManager, validateBody(updateSettingsInput), async (req, res) => {
  const input = req.body as UpdateSettingsInput;

  // RRHH no ve las funciones de IA ni los límites de Reportes, y tampoco puede
  // cambiarlos pidiéndolos a mano.
  if (!canManageSystem(res.locals.actor)) {
    const blocked = SYSTEM_ONLY_SETTINGS.filter((key) => input[key] !== undefined);
    if (blocked.length) {
      throw new AppError(403, "forbidden", "Las funciones de IA y los límites de Reportes son del administrador");
    }
  }

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
