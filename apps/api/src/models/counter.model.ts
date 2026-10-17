import type { CounterKind } from "@tekzaya/shared";
import { model, Schema } from "mongoose";

const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter = model("Counter", counterSchema, "counters");

/** Guarda en `seq` el instante, en ms, al que corresponden las fechas sembradas. */
export const SEED_CLOCK_ID = "seedClock";

/**
 * Reserva el siguiente número de una secuencia de forma atómica: sin huecos ni
 * duplicados. Cada tipo (`ticket`, `asset`, `work_order`, `spare_part`) lleva la
 * suya, con el nombre del tipo como `_id`.
 */
export async function nextNumber(kind: CounterKind): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    kind,
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  ).lean();
  return counter!.seq;
}
