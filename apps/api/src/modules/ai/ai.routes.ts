import {
  autocompleteInput,
  canReadInternalNotes,
  isAdmin,
  suggestAreaInput,
  type AutocompleteInput,
  type SuggestAreaInput,
} from "@tekzaya/shared";
import { Router } from "express";
import { AppError } from "../../middleware/errors";
import { validateBody } from "../../middleware/validate";
import {
  idOf,
  loadVisibleTicket,
  refOf,
  routeParam,
  type LeanTicket,
} from "../tickets/ticket.access";
import {
  aiStatus,
  autocomplete,
  classifyTicket,
  detectIncident,
  dismissIncident,
  suggestArea,
  summarizeTicket,
} from "./ai.service";

const router = Router();

/**
 * Lo primero que consulta la interfaz. Si `configured` es falso, no pinta nada
 * de IA: ni un "analizando…" que no va a terminar, ni un fantasma que no va a
 * llegar. Prometer algo que no puede ocurrir es peor que no ofrecerlo.
 */
router.get("/ai/status", async (_req, res) => {
  res.json(await aiStatus());
});

// ── IA-1 ──────────────────────────────────────────────────────

router.post("/ai/suggest-area", validateBody(suggestAreaInput), async (req, res) => {
  const input = req.body as SuggestAreaInput;
  // Nunca 503 ni error: sin IA la respuesta es "no hay sugerencia", que es un
  // resultado válido y la pantalla ya sabe tratarlo.
  res.json({ suggestion: await suggestArea(input) });
});

// ── IA-2 ──────────────────────────────────────────────────

/**
 * Clasificar un ticket ya creado. Es una acción del área, no un efecto del alta:
 * la IA solo se llama cuando alguien pulsa el botón (spec §6.3).
 *
 * Toca la categoría y puede recalcular el plazo, así que pide lo mismo que
 * cambiar esos campos a mano: pertenecer al área que atiende el ticket.
 */
router.post("/ai/tickets/:id/classify", async (req, res) => {
  const actor = res.locals.actor;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);

  if (!canReadInternalNotes(actor, refOf(ticket.toObject() as LeanTicket))) {
    throw new AppError(403, "forbidden", "Solo el área que atiende el ticket lo clasifica");
  }

  // `null` si no hay IA o si Gemini no contestó; la pantalla ya sabe tratarlo.
  res.json({ classification: await classifyTicket(String(idOf(ticket))) });
});

// ── IA-3 ──────────────────────────────────────────────────────

router.get("/ai/tickets/:id/summary", async (req, res) => {
  const actor = res.locals.actor;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);

  // El resumen se construye con las notas internas dentro, así que solo lo
  // recibe quien puede leerlas (spec §6.2, IA-3).
  if (!canReadInternalNotes(actor, refOf(ticket.toObject() as LeanTicket))) {
    throw new AppError(403, "forbidden", "El resumen es material del área que atiende el ticket");
  }

  const result = await summarizeTicket(String(idOf(ticket)));
  res.json({
    summary: result?.summary ?? null,
    updatedAt: result?.updatedAt.toISOString() ?? null,
  });
});

router.post("/ai/tickets/:id/summary", async (req, res) => {
  const actor = res.locals.actor;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);

  if (!canReadInternalNotes(actor, refOf(ticket.toObject() as LeanTicket))) {
    throw new AppError(403, "forbidden", "El resumen es material del área que atiende el ticket");
  }

  const result = await summarizeTicket(String(idOf(ticket)), { force: true });
  res.json({
    summary: result?.summary ?? null,
    updatedAt: result?.updatedAt.toISOString() ?? null,
  });
});

// ── IA-4 ──────────────────────────────────────────────────────

router.post("/ai/autocomplete", validateBody(autocompleteInput), async (req, res) => {
  const actor = res.locals.actor;
  const input = req.body as AutocompleteInput;
  const ticket = await loadVisibleTicket(input.ticketId, actor);
  const ref = refOf(ticket.toObject() as LeanTicket);

  // El autocompletado es una herramienta de quien atiende, no de quien reporta.
  if (!canReadInternalNotes(actor, ref)) {
    res.json({ completion: null });
    return;
  }

  res.json({
    completion: await autocomplete(actor.id, String(idOf(ticket)), input.draft, input.type),
  });
});

// ── IA-5 ──────────────────────────────────────────────────────

router.post("/ai/tickets/:id/incident", async (req, res) => {
  const actor = res.locals.actor;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const ref = refOf(ticket.toObject() as LeanTicket);

  if (!isAdmin(actor) && actor.areaId !== ref.areaId) {
    throw new AppError(403, "forbidden", "Solo el área que atiende el ticket busca incidentes");
  }

  res.json({ incident: await detectIncident(String(idOf(ticket))) });
});

router.post("/tickets/:id/incident/dismiss", async (req, res) => {
  const actor = res.locals.actor;
  const ticket = await loadVisibleTicket(routeParam(req.params["id"]), actor);
  const ref = refOf(ticket.toObject() as LeanTicket);

  // Descartar un incidente afecta a todo el grupo: es decisión del supervisor.
  if (!isAdmin(actor) && !(actor.isAreaSupervisor && actor.areaId === ref.areaId)) {
    throw new AppError(403, "forbidden", "Solo el supervisor del área descarta un incidente");
  }

  await dismissIncident(String(idOf(ticket)));
  res.status(204).end();
});

export default router;
