import type { TicketStatus } from "@tekzaya/shared";
import mongoose from "mongoose";
import { env } from "../config/env";
import { Counter, SEED_CLOCK_ID } from "../models/counter.model";
import { Message } from "../models/message.model";
import { AvailabilityLog, Notification, Settings } from "../models/support.models";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";

/**
 * Pone al día los datos de demostración sin volver a sembrar.
 *
 * La semilla fecha todo respecto del momento en que corrió: unos días después,
 * los tickets vivos aparecen vencidos. Este script adelanta cada fecha el tiempo
 * transcurrido desde entonces, de modo que el tablero vuelve a verse como recién
 * sembrado, y conserva lo que se hizo después (ajustes, fotos, reportes, mensajes).
 *
 * Los sucesos (creación, respuestas, cambios de estado…) nunca quedan en el futuro:
 * se recortan a "ahora". Los plazos de SLA y los regresos de ausencia sí pueden
 * quedar en el futuro, que es justo lo que se busca.
 */

const FUTURE_FIELDS = new Set([
  "responseDueAt",
  "responseRiskAt",
  "resolutionDueAt",
  "resolutionRiskAt",
  "awayUntil",
]);

const LIVE_STATUSES: TicketStatus[] = ["open", "assigned", "in_progress", "on_hold", "reopened"];

const now = new Date();

function shiftDates(value: unknown, delta: number, key = ""): unknown {
  if (value instanceof Date) {
    const shifted = value.getTime() + delta;
    return new Date(FUTURE_FIELDS.has(key) ? shifted : Math.min(shifted, now.getTime()));
  }
  if (Array.isArray(value)) return value.map((item) => shiftDates(item, delta));
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDates(v, delta, k)]));
  }
  return value;
}

async function shiftCollection(
  collection: mongoose.Collection,
  delta: number,
  fields: string[] | "all",
): Promise<number> {
  const docs = await collection.find({}).toArray();
  const operations = docs.map((doc) => {
    const keys = fields === "all" ? Object.keys(doc).filter((k) => k !== "_id") : fields;
    const $set: Record<string, unknown> = {};
    for (const key of keys) {
      if (doc[key] !== undefined) $set[key] = shiftDates(doc[key], delta, key);
    }
    return { updateOne: { filter: { _id: doc._id }, update: { $set } } };
  });
  if (operations.length) await collection.bulkWrite(operations);
  return operations.length;
}

async function main(): Promise<void> {
  console.log(`Conectando a ${env.MONGODB_URI}`);
  await mongoose.connect(env.MONGODB_URI);

  const clock = await Counter.findById(SEED_CLOCK_ID).lean();
  // Bases sembradas antes de existir el reloj: los ajustes se crean junto con la semilla.
  const settings = clock ? null : await Settings.findOne().lean();
  const seededAt = clock ? new Date(clock.seq) : (settings?.["createdAt"] as Date | undefined);
  if (!seededAt) throw new Error("No hay datos sembrados: ejecuta primero npm run seed.");

  const delta = now.getTime() - seededAt.getTime();
  const days = (delta / 86_400_000).toFixed(1);
  console.log(`Datos de ${seededAt.toISOString()}: se adelantan ${days} días.`);

  const tickets = await shiftCollection(Ticket.collection, delta, "all");
  const messages = await shiftCollection(Message.collection, delta, ["createdAt", "updatedAt"]);
  const logs = await shiftCollection(AvailabilityLog.collection, delta, ["from", "to"]);
  await shiftCollection(User.collection, delta, ["availability"]);

  // Los avisos de SLA describen el estado viejo. Se borran y se reinician las
  // marcas para que el job de SLA avise de nuevo según el estado actual.
  const { deletedCount } = await Notification.deleteMany({
    type: { $in: ["sla_breached", "sla_at_risk"] },
  });
  await shiftCollection(Notification.collection, delta, ["createdAt", "updatedAt", "readAt"]);
  await Ticket.updateMany(
    { status: { $in: LIVE_STATUSES } },
    { $unset: { "sla.breachNotifiedAt": "", "sla.riskNotifiedAt": "" } },
  );

  // Las marcas de incumplimiento se recalculan con las fechas nuevas.
  await Ticket.collection.updateMany({}, [
    {
      $set: {
        "sla.responseBreached": {
          $cond: [
            { $ifNull: ["$sla.firstResponseAt", false] },
            { $gt: ["$sla.firstResponseAt", "$sla.responseDueAt"] },
            {
              $and: [{ $in: ["$status", LIVE_STATUSES] }, { $lt: ["$sla.responseDueAt", now] }],
            },
          ],
        },
        "sla.resolutionBreached": {
          $cond: [
            { $ifNull: ["$sla.resolvedAt", false] },
            { $gt: ["$sla.resolvedAt", "$sla.resolutionDueAt"] },
            {
              $and: [{ $in: ["$status", LIVE_STATUSES] }, { $lt: ["$sla.resolutionDueAt", now] }],
            },
          ],
        },
      },
    },
  ]);

  await Counter.updateOne({ _id: SEED_CLOCK_ID }, { seq: now.getTime() }, { upsert: true });

  const overdue = await Ticket.countDocuments({
    status: { $in: LIVE_STATUSES },
    "sla.resolutionDueAt": { $lt: now },
  });
  const live = await Ticket.countDocuments({ status: { $in: LIVE_STATUSES } });

  console.log(`  ${tickets} tickets · ${messages} mensajes · ${logs} ausencias actualizados`);
  console.log(`  ${deletedCount} avisos de SLA antiguos borrados`);
  console.log(`  Tickets vivos vencidos: ${overdue} de ${live}`);

  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error("No se pudieron actualizar las fechas:", error);
  process.exit(1);
});
