import { Ticket } from "../../models/ticket.model";
import { aiProvider } from "./ai.provider";
import { classifyTicket, detectIncident } from "./ai.service";

/**
 * La clasificación ocurre **después** de crear el ticket, nunca durante. Quien
 * crea un ticket no espera a Gemini: recibe su número al instante y la IA mejora
 * la ficha cuando puede (spec §6.3).
 *
 * Es una cola en memoria a propósito. Lo que la hace fiable no es la cola sino
 * el documento: un ticket con `classificationStatus: "pending"` se puede volver
 * a encolar al arrancar, así que reiniciar la API no pierde trabajo.
 */
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

interface Job {
  ticketId: string;
  attempt: number;
}

const pending = new Set<string>();
let running = false;
const queue: Job[] = [];

export function enqueueClassification(ticketId: string, attempt = 0): void {
  if (pending.has(ticketId)) return;
  pending.add(ticketId);
  queue.push({ ticketId, attempt });
  void drain();
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;

  while (queue.length) {
    const job = queue.shift()!;
    pending.delete(job.ticketId);

    try {
      const result = await classifyTicket(job.ticketId);

      if (result) {
        // La detección de incidentes va detrás de la clasificación, y solo
        // entonces: necesita la categoría ya decidida (spec §6.2, IA-5).
        await detectIncident(job.ticketId);
        continue;
      }

      // Sin resultado puede ser que no haya IA (y entonces no hay nada que
      // reintentar) o que Gemini fallara (y entonces sí).
      const ticket = await Ticket.findById(job.ticketId).select("ai").lean();
      const failed = ticket?.ai?.classificationStatus === "failed";
      if (failed && job.attempt < RETRY_DELAYS_MS.length) {
        scheduleRetry(job);
      }
    } catch (error) {
      console.warn("[ai] la clasificación falló:", error);
      if (job.attempt < RETRY_DELAYS_MS.length) scheduleRetry(job);
    }
  }

  running = false;
}

function scheduleRetry(job: Job): void {
  const delay = RETRY_DELAYS_MS[job.attempt]!;
  const timer = setTimeout(() => enqueueClassification(job.ticketId, job.attempt + 1), delay);
  // No mantiene vivo el proceso: si la API se apaga, el reintento se pierde y lo
  // recoge `requeuePendingClassifications` en el siguiente arranque.
  timer.unref?.();
}

/**
 * Al arrancar, recoge lo que quedó a medias. Es lo que convierte una cola en
 * memoria en algo que se puede reiniciar sin perder tickets sin clasificar.
 */
export async function requeuePendingClassifications(): Promise<number> {
  // Sin IA configurada no hay nada que reintentar: los tickets se quedan en
  // "pending" a propósito, listos por si algún día se pone la clave.
  if (!aiProvider().configured) return 0;

  const stuck = await Ticket.find({
    "ai.classificationStatus": { $in: ["pending", "failed"] },
    createdAt: { $gte: new Date(Date.now() - 24 * 3_600_000) },
  })
    .select("_id")
    .limit(100)
    .lean();

  for (const ticket of stuck) enqueueClassification(String(ticket._id));
  return stuck.length;
}
