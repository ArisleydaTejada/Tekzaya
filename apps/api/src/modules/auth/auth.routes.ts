import {
  acceptInviteInput,
  googleLoginInput,
  loginInput,
  resetPasswordInput,
  type AcceptInviteInput,
  type ResetPasswordInput,
} from "@tekzaya/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import { env, isGoogleConfigured } from "../../config/env";
import { AppError } from "../../middleware/errors";
import { validateBody } from "../../middleware/validate";
import { Area } from "../../models/area.model";
import { User } from "../../models/user.model";
import {
  consumeAccessToken,
  resolveAccessToken,
} from "../admin/accessLinks.service";
import { buildMeResponse, LOCK_MINUTES, MAX_LOGIN_ATTEMPTS } from "./auth.service";
import { clearSession, issueSession, REFRESH_COOKIE, verifyRefreshToken } from "./tokens";

const router = Router();

// Límite por IP además del bloqueo por cuenta: uno frena la fuerza bruta
// distribuida sobre muchas cuentas, el otro el ataque contra una sola (spec §10.4).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // La suite de pruebas inicia decenas de sesiones desde la misma IP; el límite
  // es una defensa contra fuerza bruta, no parte del contrato de los endpoints.
  skip: () => env.NODE_ENV === "test",
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "too_many_requests",
        message: "Demasiados intentos desde este equipo. Espera unos minutos.",
      },
    });
  },
});

router.post("/auth/login", loginLimiter, validateBody(loginInput), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");

  // Mismo mensaje exista o no la cuenta: no se confirma qué correos están registrados.
  const invalid = new AppError(401, "invalid_credentials", "Correo o contraseña incorrectos");

  if (!user?.passwordHash) throw invalid;

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError(
      423,
      "account_locked",
      `Demasiados intentos. Inténtalo de nuevo en ${minutes} minutos.`,
    );
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    throw invalid;
  }

  if (user.status !== "active") {
    throw new AppError(403, "account_disabled", "Tu cuenta no está habilitada");
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  issueSession(res, String(user._id));
  res.json(await buildMeResponse(String(user._id)));
});

router.post("/auth/google", validateBody(googleLoginInput), async (req, res) => {
  if (!isGoogleConfigured) {
    throw new AppError(
      503,
      "google_not_configured",
      "El acceso con Google no está configurado en este servidor",
    );
  }

  const { credential } = req.body as { credential: string };
  const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  const ticket = await client.verifyIdToken({
    idToken: credential,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const email = payload?.email?.toLowerCase();

  if (!email) throw new AppError(401, "invalid_credentials", "Google no devolvió un correo");

  if (env.ALLOWED_GOOGLE_DOMAIN && !email.endsWith(`@${env.ALLOWED_GOOGLE_DOMAIN}`)) {
    throw new AppError(
      403,
      "google_domain_not_allowed",
      `Solo se permite el acceso con cuentas @${env.ALLOWED_GOOGLE_DOMAIN}`,
    );
  }

  // No hay registro público: si la persona no fue invitada, no entra (spec §3.2).
  const user = await User.findOne({ email });
  if (!user || user.status !== "active") {
    throw new AppError(
      403,
      "unknown_google_account",
      "Tu cuenta no está habilitada. Contacta al administrador.",
    );
  }

  if (!user.googleId && payload?.sub) {
    user.googleId = payload.sub;
  }
  user.lastLoginAt = new Date();
  await user.save();

  issueSession(res, String(user._id));
  res.json(await buildMeResponse(String(user._id)));
});

router.post("/auth/refresh", async (req, res) => {
  const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
  if (!token) throw new AppError(401, "unauthenticated", "No hay sesión que renovar");

  let userId: string;
  try {
    userId = verifyRefreshToken(token).sub;
  } catch {
    clearSession(res);
    throw new AppError(401, "session_expired", "Tu sesión expiró, vuelve a entrar");
  }

  const user = await User.findById(userId).lean();
  if (!user || user.status !== "active") {
    clearSession(res);
    throw new AppError(401, "account_disabled", "Tu cuenta no está activa");
  }

  issueSession(res, userId);
  res.json(await buildMeResponse(userId));
});

// ── Invitaciones y restablecimiento (spec §7.7) ───────────────
// El enlace lo genera el administrador y lo comparte a mano: en la Fase 1 no hay
// envío de correo. Estas rutas son públicas por necesidad —quien las usa todavía
// no tiene sesión—, así que el límite por IP es lo que frena probar enlaces.

const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: "too_many_requests", message: "Demasiados intentos. Espera unos minutos." },
    });
  },
});

/** Lo que la pantalla muestra antes de pedir la contraseña, para dar confianza. */
router.get("/auth/access", tokenLimiter, async (req, res) => {
  const token = String(req.query["token"] ?? "");
  const purpose = req.query["purpose"] === "reset" ? "reset" : "invite";

  const resolved = await resolveAccessToken(token, purpose);
  const user = await User.findById(resolved.userId).select("name email areaId").lean();
  if (!user) throw new AppError(400, "invalid_token", "Este enlace ya no es válido");

  const area = await Area.findById(user.areaId).select("name").lean();
  res.json({
    name: user.name,
    email: user.email,
    areaName: area?.name ?? "Sin área",
    purpose: resolved.purpose,
  });
});

async function applyNewPassword(userId: string, password: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) throw new AppError(400, "invalid_token", "Este enlace ya no es válido");

  user.set("passwordHash", await bcrypt.hash(password, 10));
  user.set("status", "active");
  user.set("failedLoginAttempts", 0);
  user.set("lockedUntil", undefined);
  user.set("lastLoginAt", new Date());
  await user.save();

  await consumeAccessToken(userId);
}

router.post(
  "/auth/accept-invite",
  tokenLimiter,
  validateBody(acceptInviteInput),
  async (req, res) => {
    const input = req.body as AcceptInviteInput;
    const resolved = await resolveAccessToken(input.token, "invite");

    if (input.name) {
      await User.updateOne({ _id: resolved.userId }, { $set: { name: input.name } });
    }
    await applyNewPassword(resolved.userId, input.password);

    // Entra directamente: pedirle que inicie sesión justo después de elegir la
    // contraseña solo añade un paso donde puede equivocarse.
    issueSession(res, resolved.userId);
    res.json(await buildMeResponse(resolved.userId));
  },
);

router.post(
  "/auth/reset-password",
  tokenLimiter,
  validateBody(resetPasswordInput),
  async (req, res) => {
    const input = req.body as ResetPasswordInput;
    const resolved = await resolveAccessToken(input.token, "reset");

    await applyNewPassword(resolved.userId, input.password);

    issueSession(res, resolved.userId);
    res.json(await buildMeResponse(resolved.userId));
  },
);

router.post("/auth/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

export default router;
