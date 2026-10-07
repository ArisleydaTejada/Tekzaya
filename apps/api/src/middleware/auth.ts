import { canManageUsers, type Actor } from "@tekzaya/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { User } from "../models/user.model";
import { ACCESS_COOKIE, verifyAccessToken } from "../modules/auth/tokens";
import { AppError } from "./errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      actor: Actor;
    }
  }
}

/**
 * Toda ruta que no sea de autenticación pasa por aquí. El actor se reconstruye
 * desde la base en cada petición, no desde el token: así un cambio de área o de
 * rol surte efecto de inmediato en vez de esperar a que caduque la sesión.
 */
export const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const token = (req.cookies as Record<string, string | undefined>)[ACCESS_COOKIE];
  if (!token) {
    next(new AppError(401, "unauthenticated", "Inicia sesión para continuar"));
    return;
  }

  let userId: string;
  try {
    userId = verifyAccessToken(token).sub;
  } catch {
    next(new AppError(401, "session_expired", "Tu sesión expiró, vuelve a entrar"));
    return;
  }

  void User.findById(userId)
    .lean()
    .then((user) => {
      if (!user || user.status !== "active") {
        next(new AppError(401, "account_disabled", "Tu cuenta no está activa"));
        return;
      }
      res.locals.actor = {
        id: String(user._id),
        areaId: String(user.areaId),
        role: user.role ?? "employee",
        isAreaSupervisor: user.isAreaSupervisor ?? false,
        hasGlobalReadAccess: user.hasGlobalReadAccess ?? false,
      };
      next();
    })
    .catch(next);
};

/** Atajo para las rutas de administración (spec §4.3: última fila de la matriz). */
export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (res.locals.actor.role !== "admin") {
    next(new AppError(403, "forbidden", "Necesitas permisos de administrador"));
    return;
  }
  next();
};

/**
 * Administración de personas: el administrador y el supervisor de RRHH. Lo que
 * cada uno puede hacer una vez dentro lo decide la ruta, porque RRHH lleva las
 * altas y bajas pero no reparte privilegios.
 */
export const requireUserManager: RequestHandler = (_req, res, next) => {
  if (!canManageUsers(res.locals.actor)) {
    next(new AppError(403, "forbidden", "Necesitas permisos para administrar personas"));
    return;
  }
  next();
};
