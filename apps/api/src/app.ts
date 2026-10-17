import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { requireAuth } from "./middleware/auth";
import { errorHandler, notFound } from "./middleware/errors";
import adminAreasRoutes from "./modules/admin/areas.admin.routes";
import aiRoutes from "./modules/ai/ai.routes";
import assetsRoutes from "./modules/assets/assets.routes";
import adminUsersRoutes from "./modules/admin/users.routes";
import areasRoutes from "./modules/areas/areas.routes";
import attachmentsRoutes from "./modules/attachments/attachments.routes";
import authRoutes from "./modules/auth/auth.routes";
import healthRoutes from "./modules/health/health.routes";
import avatarRoutes from "./modules/me/avatar.routes";
import meRoutes from "./modules/me/me.routes";
import notificationsRoutes from "./modules/notifications/notifications.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import settingsRoutes from "./modules/settings/settings.routes";
import statsRoutes from "./modules/stats/stats.routes";
import ticketActionsRoutes from "./modules/tickets/ticketActions.routes";
import ticketsRoutes from "./modules/tickets/tickets.routes";

export function createApp() {
  const app = express();

  // El navegador llama por el proxy de Vite (mismo origen), pero CORS con
  // credenciales queda listo por si la web se sirve desde otro host.
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  app.use("/api/v1", healthRoutes);
  app.use("/api/v1", authRoutes);

  // Todo lo que va debajo exige sesión; la autorización fina la aplica cada ruta.
  app.use("/api/v1", requireAuth, meRoutes);
  app.use("/api/v1", requireAuth, avatarRoutes);
  app.use("/api/v1", requireAuth, areasRoutes);
  app.use("/api/v1", requireAuth, ticketsRoutes);
  app.use("/api/v1", requireAuth, ticketActionsRoutes);
  app.use("/api/v1", requireAuth, statsRoutes);
  app.use("/api/v1", requireAuth, notificationsRoutes);
  app.use("/api/v1", requireAuth, reportsRoutes);
  app.use("/api/v1", requireAuth, settingsRoutes);
  app.use("/api/v1", requireAuth, adminUsersRoutes);
  app.use("/api/v1", requireAuth, adminAreasRoutes);
  app.use("/api/v1", requireAuth, aiRoutes);
  app.use("/api/v1", requireAuth, attachmentsRoutes);
  app.use("/api/v1", requireAuth, assetsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
