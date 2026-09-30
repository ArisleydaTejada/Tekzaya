import { AvailabilityLog } from "../models/support.models";
import { User } from "../models/user.model";

/**
 * "Ausente hasta el 30 de septiembre" tiene que significar algo el día 30. Al
 * llegar la fecha de regreso la persona vuelve a *Disponible* sola, para que no
 * quede fuera de las sugerencias de asignación por haber olvidado cambiarlo
 * (spec §7.7).
 */
export async function runAvailabilityReturn(now = new Date()): Promise<number> {
  const returning = await User.find({
    "availability.state": "away",
    "availability.awayUntil": { $lte: now },
    status: "active",
  }).select("_id");

  for (const user of returning) {
    user.set("availability", { state: "available" });
    await user.save();

    await AvailabilityLog.updateMany({ userId: user._id, to: null }, { $set: { to: now } });
    await AvailabilityLog.create({ userId: user._id, state: "available", from: now });
  }

  return returning.length;
}
