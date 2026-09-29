import type { Response } from "express";
import jwt from "jsonwebtoken";
import { isProduction, secrets } from "../../config/env";

const ACCESS_COOKIE = "tk_access";
const REFRESH_COOKIE = "tk_refresh";
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface TokenPayload {
  sub: string;
}

function sign(userId: string, secret: string, expiresInSeconds: number): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: expiresInSeconds });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, secrets.access) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, secrets.refresh) as TokenPayload;
}

/**
 * Los tokens viajan en cookies httpOnly: el JavaScript de la página no puede
 * leerlos, que es la defensa contra el robo de sesión por XSS (spec §10.4).
 */
export function issueSession(res: Response, userId: string): void {
  const common = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
  };
  res.cookie(ACCESS_COOKIE, sign(userId, secrets.access, ACCESS_TTL_SECONDS), {
    ...common,
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, sign(userId, secrets.refresh, REFRESH_TTL_SECONDS), {
    ...common,
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_COOKIE, { path: "/" });
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
