import mongoose from "mongoose";
import { env } from "../config/env";
import { printMaintenanceSummary, seedMaintenance } from "./maintenance";

/**
 * Siembra solo el módulo 2 sobre una base que ya tiene el módulo 1: no toca
 * áreas, personas, tickets, mensajes ni reportes. Útil para añadir los activos a
 * una demo en marcha sin perder lo que se hizo en ella.
 */
async function main(): Promise<void> {
  console.log(`Conectando a ${env.MONGODB_URI}`);
  await mongoose.connect(env.MONGODB_URI);
  const summary = await seedMaintenance(new Date());
  printMaintenanceSummary(summary, summary.workOrders);
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error("La semilla de mantenimiento falló:", error);
  process.exit(1);
});
