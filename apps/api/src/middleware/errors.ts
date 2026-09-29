import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { isProduction } from "../config/env";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: "not_found", message: `No existe la ruta ${req.method} ${req.originalUrl}` },
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_";
      (fields[key] ??= []).push(issue.message);
    }
    res.status(422).json({
      error: { code: "validation_error", message: "Los datos enviados no son válidos", fields },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: "internal_error",
      message: isProduction
        ? "Error interno del servidor"
        : err instanceof Error
          ? err.message
          : "Error interno del servidor",
    },
  });
};
