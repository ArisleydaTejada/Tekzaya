import { z } from "zod";
import { isoDateTime } from "./common";

export const healthResponse = z.object({
  /** `degraded` = la API responde pero le falta una dependencia (hoy, MongoDB). */
  status: z.enum(["ok", "degraded"]),
  db: z.enum(["connected", "connecting", "disconnected"]),
  version: z.string(),
  uptimeSeconds: z.number().min(0),
  timestamp: isoDateTime,
});
export type HealthResponse = z.infer<typeof healthResponse>;
