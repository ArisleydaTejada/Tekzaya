import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AccessLink } from "@tekzaya/shared";
import { env } from "../../config/env";
import { AppError } from "../../middleware/errors";
import { User } from "../../models/user.model";

export type AccessPurpose = "invite" | "reset";

/** Una invitación puede tardar en compartirse; un restablecimiento, no debería. */
const TTL_HOURS: Record<AccessPurpose, number> = { invite: 7 * 24, reset: 2 };

const hash = (token: string): string => createHash("sha256").update(token).digest("hex");

/**
 * Genera el enlace y guarda **solo su huella**. El texto completo se devuelve una
 * vez, para que el administrador lo copie; ni el servidor ni la base pueden
 * reconstruirlo después, así que un volcado de la base no abre ninguna cuenta.
 *
 * En la Fase 1 no se envía correo (spec §7.7): el enlace se comparte a mano.
 */
export async function issueAccessLink(
  userId: string,
  purpose: AccessPurpose,
): Promise<AccessLink> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_HOURS[purpose] * 3_600_000);

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        accessTokenHash: hash(token),
        accessTokenPurpose: purpose,
        accessTokenExpiresAt: expiresAt,
      },
    },
  );

  const path = purpose === "invite" ? "invitacion" : "restablecer";
  return {
    url: `${env.WEB_ORIGIN}/${path}?token=${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}

export interface ResolvedToken {
  userId: string;
  purpose: AccessPurpose;
}

/**
 * Busca por huella y compara en tiempo constante. Un token caducado o de otro
 * propósito se rechaza con el mismo mensaje que uno inventado: no hay forma de
 * distinguir "no existe" de "ya venció" probando enlaces.
 */
export async function resolveAccessToken(
  token: string,
  expected: AccessPurpose,
): Promise<ResolvedToken> {
  const invalid = new AppError(
    400,
    "invalid_token",
    "Este enlace ya no es válido. Pídele al administrador uno nuevo.",
  );

  const digest = hash(token);
  const user = await User.findOne({ accessTokenHash: digest })
    .select("+accessTokenHash accessTokenPurpose accessTokenExpiresAt status")
    .lean();

  if (!user?.accessTokenHash) throw invalid;

  const stored = Buffer.from(user.accessTokenHash, "hex");
  const given = Buffer.from(digest, "hex");
  if (stored.length !== given.length || !timingSafeEqual(stored, given)) throw invalid;

  if (user.accessTokenPurpose !== expected) throw invalid;
  if (!user.accessTokenExpiresAt || user.accessTokenExpiresAt < new Date()) throw invalid;
  if (user.status === "disabled") throw invalid;

  return { userId: String(user._id), purpose: expected };
}

/** Un enlace sirve una sola vez: al usarse deja de existir. */
export async function consumeAccessToken(userId: string): Promise<void> {
  await User.updateOne(
    { _id: userId },
    {
      $unset: { accessTokenHash: "", accessTokenPurpose: "", accessTokenExpiresAt: "" },
    },
  );
}
