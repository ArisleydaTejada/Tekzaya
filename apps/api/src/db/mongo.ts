import mongoose from "mongoose";
import type { HealthResponse } from "@tekzaya/shared";

const READY_STATE: Record<number, HealthResponse["db"]> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnected",
};

export function dbState(): HealthResponse["db"] {
  return READY_STATE[mongoose.connection.readyState] ?? "disconnected";
}

/**
 * Conecta sin tumbar la API si MongoDB todavía no está disponible: en desarrollo es
 * normal arrancar el servidor antes que la base. Reintenta en segundo plano.
 */
export async function connectMongo(uri: string, retryMs = 10_000): Promise<void> {
  mongoose.set("strictQuery", true);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5_000 });
    console.log("MongoDB conectado");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`MongoDB no disponible (${reason})`);
    console.warn(`Comprueba que el servicio MongoDB esté iniciado. Reintento en ${retryMs / 1000} s.`);
    setTimeout(() => void connectMongo(uri, retryMs), retryMs).unref();
  }
}
