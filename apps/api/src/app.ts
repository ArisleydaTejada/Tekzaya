import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middleware/errors";
import healthRoutes from "./modules/health/health.routes";

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/v1", healthRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
