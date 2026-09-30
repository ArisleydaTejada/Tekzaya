import cron from "node-cron";
import { env } from "../config/env";
import { runAvailabilityReturn } from "./availability.job";
import { runLifecycleJobs } from "./lifecycle.job";
import { runSlaWatch } from "./sla.job";

/**
 * El planificador solo decide **cuándo**; el qué vive en funciones que reciben
 * la hora y devuelven un resumen, así que las pruebas las llaman directamente
 * sin esperar a que dé un cuarto de hora.
 */
async function safely(name: string, task: () => Promise<unknown>): Promise<void> {
  try {
    const result = await task();
    console.log(`[job:${name}]`, result);
  } catch (error) {
    // Un trabajo que falla no puede tumbar el proceso: el siguiente ciclo
    // reintenta, y mientras tanto la API sigue atendiendo peticiones.
    console.error(`[job:${name}] falló:`, error);
  }
}

export function startJobs(): void {
  if (env.NODE_ENV === "test") return;

  // El SLA se mira cada 10 minutos: el plazo más corto del spec son 15 minutos
  // de respuesta para los urgentes, así que un aviso nunca llega tarde del todo.
  cron.schedule("*/10 * * * *", () => void safely("sla", () => runSlaWatch()));

  // Los cierres automáticos se cuentan en días hábiles; una pasada por hora
  // sobra y evita concentrar trabajo a medianoche.
  cron.schedule("7 * * * *", () => void safely("ciclo-de-vida", () => runLifecycleJobs()));

  cron.schedule("13 * * * *", () => void safely("disponibilidad", () => runAvailabilityReturn()));

  console.log("Trabajos programados activos: SLA (10 min), ciclo de vida y disponibilidad (cada hora)");
}

export { runAvailabilityReturn, runLifecycleJobs, runSlaWatch };
