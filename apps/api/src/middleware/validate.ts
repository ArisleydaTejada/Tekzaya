import type { RequestHandler } from "express";
import type { z } from "zod";

/** Tras este middleware, `req.body` ya viene normalizado por el esquema. */
export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

/** En Express 5 `req.query` es de solo lectura, así que lo validado va a `res.locals.query`. */
export function validateQuery<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    res.locals.query = result.data;
    next();
  };
}
