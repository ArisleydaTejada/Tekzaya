import { DEMO_MODULE_LABELS, demoRequestInput, type DemoRequestInput } from "@tekzaya/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env";
import { validateBody } from "../../middleware/validate";
import { DemoRequest } from "../../models/demoRequest.model";
import { User } from "../../models/user.model";
import { notify } from "../notifications/notifications.service";

const router = Router();

// Es la única escritura sin sesión: el límite frena a quien la use para llenar la base.
const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "too_many_requests",
        message: "Ya recibimos varias solicitudes desde este equipo. Inténtalo dentro de una hora.",
      },
    });
  },
});

/**
 * Guarda la solicitud y avisa a los administradores en la campana, con lo
 * necesario para responder sin abrir otra pantalla.
 */
router.post("/demo-requests", demoLimiter, validateBody(demoRequestInput), async (req, res) => {
  const input = req.body as DemoRequestInput;

  // La trampa para robots se responde igual que un envío bueno: así no aprenden a evitarla.
  if (input.website) {
    res.status(201).json({ received: true });
    return;
  }

  await DemoRequest.create({
    name: input.name,
    email: input.email,
    company: input.company,
    module: input.module,
    ...(input.message ? { message: input.message } : {}),
  });

  const admins = await User.find({ role: "admin", status: "active" }).select("_id").lean();
  await notify(
    admins.map((admin) => admin._id),
    {
      type: "demo_request",
      title: `Demo de ${DEMO_MODULE_LABELS[input.module]}`,
      body: `${input.name} · ${input.company} · ${input.email}`,
    },
  );

  res.status(201).json({ received: true });
});

export default router;
