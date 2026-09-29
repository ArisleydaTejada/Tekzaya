import { Router } from "express";
import { healthResponse } from "@tekzaya/shared";
import { dbState } from "../../db/mongo";

const router = Router();

router.get("/health", (_req, res) => {
  const db = dbState();

  // Se valida contra el esquema compartido: si la respuesta deja de cumplir el
  // contrato, falla aquí y no en el navegador.
  const body = healthResponse.parse({
    status: db === "connected" ? "ok" : "degraded",
    db,
    version: process.env["npm_package_version"] ?? "0.1.0",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });

  res.json(body);
});

export default router;
