import { model, Schema } from "mongoose";

const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter = model("Counter", counterSchema, "counters");

/** Reserva el siguiente número de ticket de forma atómica: sin huecos ni duplicados. */
export async function nextTicketNumber(): Promise<number> {
  const counter = await Counter.findByIdAndUpdate(
    "ticket",
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  ).lean();
  return counter!.seq;
}
