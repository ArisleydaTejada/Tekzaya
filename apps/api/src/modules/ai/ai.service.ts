import {
  ACTIVE_TICKET_STATUSES,
  AUTOCOMPLETE_MIN_INTERVAL_MS,
  AUTOCOMPLETE_TIMEOUT_MS,
  type AiStatus,
  type AreaSuggestion,
  type Classification,
  type IncidentGroup,
  type SuggestAreaInput,
} from "@tekzaya/shared";
import { z } from "zod";
import { Area } from "../../models/area.model";
import { Message } from "../../models/message.model";
import { Ticket } from "../../models/ticket.model";
import { notify, supervisorsOf } from "../notifications/notifications.service";
import { getSettings } from "../settings/settings.service";
import type { LeanTicket, TicketDoc } from "../tickets/ticket.access";
import { recomputeSlaForPriority } from "../tickets/ticket.lifecycle";
import { allowCall, cacheKey, remember } from "./ai.cache";
import { aiProvider } from "./ai.provider";

/** Mínimo de texto para que preguntar valga la pena (spec §6.2, IA-1). */
const MIN_TEXT_LENGTH = 20;

const SUGGESTION_TTL_MS = 5 * 60_000;

export async function aiStatus(): Promise<AiStatus> {
  const settings = await getSettings();
  return { configured: aiProvider().configured, enabled: settings.aiEnabled };
}

/** ¿Está esta función encendida y hay con qué llamarla? */
async function usable(feature: keyof AiStatus["enabled"]): Promise<boolean> {
  if (!aiProvider().configured) return false;
  const settings = await getSettings();
  return settings.aiEnabled[feature];
}

// ── IA-1 · Sugerencia de área ─────────────────────────────────

export async function suggestArea(input: SuggestAreaInput): Promise<AreaSuggestion | null> {
  const text = `${input.title}\n${input.description}`.trim();
  if (text.length < MIN_TEXT_LENGTH) return null;
  if (!(await usable("suggestArea"))) return null;

  const areas = await Area.find({ isActive: { $ne: false } })
    .select("name description")
    .lean();
  if (areas.length === 0) return null;

  return remember(cacheKey("suggest-area", text), SUGGESTION_TTL_MS, async () => {
    const catalog = areas
      .map((area, index) => `${index + 1}. ${area.name}: ${area.description ?? "sin descripción"}`)
      .join("\n");

    // El modelo elige por número de la lista, no por identificador: no hay forma
    // de que devuelva un id que no exista, y si inventa un número, el esquema lo
    // rechaza y la respuesta se queda en `null`.
    const result = await aiProvider().json({
      instruction:
        "Eres el clasificador de un sistema de tickets de soporte interno. " +
        `Estas son las áreas disponibles:\n${catalog}\n\n` +
        "Devuelve JSON con {areaNumber, confidence, rationale}: el número del área " +
        "que debe atender el ticket, tu confianza de 0 a 1, y una frase breve en " +
        "español explicando por qué. Si el texto no permite decidir, usa confidence baja.",
      data: text,
      schema: z.object({
        areaNumber: z.number().int().min(1).max(areas.length),
        confidence: z.number().min(0).max(1),
        rationale: z.string().max(280).optional(),
      }),
      timeoutMs: 4_000,
      maxOutputTokens: 200,
    });

    if (!result) return null;
    const area = areas[result.areaNumber - 1]!;
    return {
      areaId: String(area._id),
      areaName: area.name!,
      confidence: result.confidence,
      ...(result.rationale ? { rationale: result.rationale } : {}),
    };
  });
}

// ── IA-2 · Clasificación ──────────────────────────────────────

/**
 * Clasifica un ticket ya creado. Nunca se llama en el camino de creación: el
 * ticket ya existe y tiene su SLA corriendo, así que esto solo puede mejorarlo
 * o dejarlo como está (spec §6.3).
 */
export async function classifyTicket(ticketId: string): Promise<Classification | null> {
  if (!(await usable("classify"))) return null;

  const ticket = (await Ticket.findById(ticketId)) as TicketDoc | null;
  if (!ticket) return null;

  const area = await Area.findById(ticket.get("areaId")).select("name categories").lean();
  if (!area) return null;

  const active = (area.categories ?? []).filter((category) => category.isActive !== false);
  const catalog = active.map((category, index) => `${index + 1}. ${category.name}`).join("\n");

  const result = await aiProvider().json({
    instruction:
      `Clasificas tickets del área "${area.name}" en un sistema de soporte interno.\n` +
      (catalog ? `Categorías disponibles:\n${catalog}\n\n` : "No hay categorías definidas.\n\n") +
      "Devuelve JSON con {categoryNumber, priority, confidence, rationale}. " +
      "categoryNumber es el número de la categoría que corresponde, o null si ninguna encaja. " +
      "priority es uno de: urgent, high, medium, low. Usa urgent solo si algo está " +
      "detenido y afecta a varias personas; low para peticiones sin prisa. " +
      "rationale es una frase breve en español.",
    data: `Título: ${ticket.get("title")}\n\nDescripción: ${ticket.get("description")}`,
    schema: z.object({
      categoryNumber: z.number().int().min(1).max(Math.max(1, active.length)).nullable(),
      priority: z.enum(["urgent", "high", "medium", "low"]),
      confidence: z.number().min(0).max(1),
      rationale: z.string().max(280),
    }),
    maxOutputTokens: 250,
  });

  if (!result) {
    ticket.set("ai.classificationStatus", "failed");
    await ticket.save();
    return null;
  }

  const category = result.categoryNumber ? active[result.categoryNumber - 1] : undefined;

  ticket.set("ai.suggestedPriority", result.priority);
  ticket.set("ai.rationale", result.rationale);
  ticket.set("ai.classificationStatus", "done");
  if (category) ticket.set("ai.suggestedCategoryId", category._id);

  // La IA propone; lo que ya decidió una persona no se toca (spec §6.3).
  if (category && !ticket.get("categoryId")) ticket.set("categoryId", category._id);
  if (!ticket.get("stats")?.priorityChangedByHuman && result.priority !== ticket.get("priority")) {
    await recomputeSlaForPriority(ticket, result.priority);
  }

  await ticket.save();

  return {
    categoryId: category ? String(category._id) : null,
    priority: result.priority,
    confidence: result.confidence,
    rationale: result.rationale,
  };
}

// ── IA-3 · Resumen ────────────────────────────────────────────

/**
 * El resumen incluye las notas internas, así que **solo se entrega a quien puede
 * leerlas**. Quien llama es responsable de comprobarlo; la ruta lo hace.
 */
export async function summarizeTicket(
  ticketId: string,
  options: { force?: boolean } = {},
): Promise<{ summary: string; updatedAt: Date } | null> {
  const ticket = (await Ticket.findById(ticketId)) as TicketDoc | null;
  if (!ticket) return null;

  const existing = ticket.get("ai")?.summary as string | undefined;
  const updatedAt = ticket.get("ai")?.summaryUpdatedAt as Date | undefined;
  const stats = ticket.get("stats") ?? {};
  const messageCount = (stats.publicMessageCount ?? 0) + (stats.internalMessageCount ?? 0);
  const countAtSummary = (ticket.get("ai")?.summaryMessageCount ?? 0) as number;

  // Se reutiliza mientras la conversación no haya avanzado tres mensajes: un
  // resumen que no ha cambiado no vale otra llamada a Gemini (spec §6.2, IA-3).
  const stale = messageCount - countAtSummary >= 3;
  if (existing && updatedAt && !stale && !options.force) return { summary: existing, updatedAt };

  if (!(await usable("summary"))) return null;

  const messages = await Message.find({ ticketId, type: { $in: ["public", "internal"] } })
    .sort({ createdAt: 1 })
    .limit(40)
    .lean();

  const conversation = messages
    .map((message) => `[${message.type === "internal" ? "nota interna" : "público"}] ${message.body}`)
    .join("\n");

  const summary = await aiProvider().text({
    instruction:
      "Resume la conversación de un ticket de soporte interno en 3 a 5 líneas, en " +
      "español. Di cuál es el problema, qué se ha intentado y en qué punto está " +
      "ahora. No inventes datos que no aparezcan. Escribe en texto plano, sin viñetas.",
    data: `Título: ${ticket.get("title")}\n\n${conversation}`,
    maxOutputTokens: 300,
  });

  if (!summary) return null;

  const now = new Date();
  ticket.set("ai.summary", summary);
  ticket.set("ai.summaryUpdatedAt", now);
  ticket.set("ai.summaryMessageCount", messageCount);
  await ticket.save();

  return { summary, updatedAt: now };
}

// ── IA-4 · Autocompletado ─────────────────────────────────────

export async function autocomplete(
  userId: string,
  ticketId: string,
  draft: string,
  type: "public" | "internal",
): Promise<string | null> {
  if (!(await usable("autocomplete"))) return null;
  // El redactor pregunta con cada pausa al teclear; sin este freno, una sola
  // persona escribiendo agotaría la cuota del día.
  if (!allowCall(userId, AUTOCOMPLETE_MIN_INTERVAL_MS)) return null;

  const ticket = await Ticket.findById(ticketId).select("title description").lean();
  if (!ticket) return null;

  return aiProvider().text({
    instruction:
      "Continúas la frase que un agente de soporte está escribiendo. Devuelve " +
      "SOLO la continuación, sin repetir lo ya escrito, sin comillas y sin " +
      "saludos. Máximo 25 palabras, en español, tono profesional y directo. " +
      (type === "internal"
        ? "Es una nota interna para el equipo, no la lee quien reportó el problema."
        : "Es una respuesta pública que leerá quien reportó el problema."),
    data:
      `Ticket: ${ticket.title}\nProblema: ${ticket.description}\n\n` +
      `Lleva escrito: ${draft || "(nada todavía)"}`,
    // Pasado este punto la persona ya escribió otra cosa y la sugerencia estorba.
    timeoutMs: AUTOCOMPLETE_TIMEOUT_MS,
    maxOutputTokens: 60,
  });
}

// ── IA-5 · Detección de incidentes ────────────────────────────

/**
 * Antes de gastar cuota se hace una preselección **sin IA**: si en la misma área
 * no hay al menos dos tickets recientes parecidos, no hay incidente posible y no
 * se llama a Gemini (spec §6.2).
 */
export async function detectIncident(ticketId: string): Promise<IncidentGroup | null> {
  if (!(await usable("detectIncidents"))) return null;

  const settings = await getSettings();
  const ticket = (await Ticket.findById(ticketId)) as TicketDoc | null;
  if (!ticket) return null;
  if (ticket.get("ai")?.incident?.status === "dismissed") return null;

  const since = new Date(Date.now() - settings.incidentDetection.windowHours * 3_600_000);
  const words = String(ticket.get("title"))
    .split(/\s+/)
    .filter((word) => word.length > 3);

  const candidates = words.length
    ? ((await Ticket.find(
        {
          _id: { $ne: ticket._id },
          areaId: ticket.get("areaId"),
          status: { $in: [...ACTIVE_TICKET_STATUSES] },
          createdAt: { $gte: since },
          $text: { $search: words.join(" ") },
        },
        { score: { $meta: "textScore" } },
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(10)
        .lean()) as LeanTicket[])
    : [];

  if (candidates.length < settings.incidentDetection.minTickets - 1) return null;

  const list = candidates
    .map(
      (candidate, index) =>
        `${index + 1}. ${candidate["title"]} — ${String(candidate["description"]).slice(0, 160)}`,
    )
    .join("\n");

  const result = await aiProvider().json({
    instruction:
      "Decides si varios tickets de soporte describen el MISMO incidente (un único " +
      "problema reportado por varias personas), no solo temas parecidos.\n" +
      `Candidatos:\n${list}\n\n` +
      "Devuelve JSON con {sameIncident, label, confidence}: sameIncident es la lista " +
      "de números de los candidatos que describen el mismo problema que el ticket " +
      "nuevo (vacía si ninguno), label es un título corto en español para el " +
      'incidente (por ejemplo "Caída del wifi en Ventas"), y confidence de 0 a 1.',
    data: `Ticket nuevo: ${ticket.get("title")}\n${ticket.get("description")}`,
    schema: z.object({
      sameIncident: z.array(z.number().int().min(1).max(candidates.length)),
      label: z.string().max(120),
      confidence: z.number().min(0).max(1),
    }),
    maxOutputTokens: 250,
  });

  if (!result) return null;
  if (result.confidence < settings.incidentDetection.minConfidence) return null;

  const group = [
    String(ticket._id),
    ...result.sameIncident.map((index) => String(candidates[index - 1]!["_id"])),
  ];
  if (group.length < settings.incidentDetection.minTickets) return null;

  // Si alguno del grupo ya pertenece a un incidente, se reutiliza su etiqueta en
  // vez de abrir otro: llegan más tickets del mismo problema (spec §6.2, punto 5).
  const existing = candidates.find(
    (candidate) =>
      candidate["ai"]?.incident?.groupId && candidate["ai"].incident.status !== "dismissed",
  );
  const groupId = existing?.["ai"].incident.groupId ?? `inc-${Date.now()}`;

  const incident = {
    groupId,
    label: result.label,
    confidence: result.confidence,
    status: "detected" as const,
  };
  // Campo a campo: un $set sobre "ai" entero borraría la clasificación.
  await Ticket.updateMany(
    { _id: { $in: group }, "ai.incident.status": { $ne: "dismissed" } },
    { $set: { "ai.incident": incident } },
  );

  await notify(await supervisorsOf(String(ticket.get("areaId"))), {
    type: "incident_detected",
    title: "Posible incidente",
    body: `${group.length} tickets sobre "${result.label}". Revísalos antes de atenderlos por separado.`,
    ticketId: ticket._id as never,
  });

  return { groupId, label: result.label, confidence: result.confidence, ticketIds: group };
}

/** "No es un incidente": quita la etiqueta y la IA no vuelve a agrupar el ticket. */
export async function dismissIncident(ticketId: string): Promise<void> {
  const ticket = await Ticket.findById(ticketId).select("ai").lean();
  const groupId = ticket?.ai?.incident?.groupId;
  if (!groupId) return;

  await Ticket.updateMany(
    { "ai.incident.groupId": groupId },
    { $set: { "ai.incident.status": "dismissed" } },
  );
}
