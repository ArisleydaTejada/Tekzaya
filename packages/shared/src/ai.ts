import { z } from "zod";
import { objectId } from "./common";
import { priority } from "./enums";

// Todo lo de IA comparte una regla: **puede no haber respuesta**. Cada esquema
// admite `null`, y la interfaz está obligada a contemplarlo. Es lo que hace que
// apagar Gemini no rompa nada (spec §6.3).

/** Qué funciones de IA puede ofrecer este servidor ahora mismo. */
export const aiStatus = z.object({
  /** Hay clave configurada en el backend. Sin ella, todo lo demás da igual. */
  configured: z.boolean(),
  enabled: z.object({
    suggestArea: z.boolean(),
    classify: z.boolean(),
    summary: z.boolean(),
    autocomplete: z.boolean(),
    detectIncidents: z.boolean(),
  }),
});
export type AiStatus = z.infer<typeof aiStatus>;

// ── IA-1 · Sugerencia de área ─────────────────────────────────

export const suggestAreaInput = z.object({
  title: z.string().trim().max(120).default(""),
  description: z.string().trim().max(5000).default(""),
});
export type SuggestAreaInput = z.infer<typeof suggestAreaInput>;

export const areaSuggestion = z.object({
  areaId: objectId,
  areaName: z.string(),
  /**
   * Categoría propuesta dentro de esa área. Viaja en la misma respuesta porque
   * sale de la misma llamada: pedirla aparte costaría una segunda consulta a
   * Gemini para rellenar dos desplegables que están uno al lado del otro.
   */
  categoryId: objectId.optional(),
  categoryName: z.string().optional(),
  confidence: z.number().min(0).max(1),
  /** Una línea explicando por qué; la interfaz la muestra como ayuda, no como verdad. */
  rationale: z.string().max(280).optional(),
});
export type AreaSuggestion = z.infer<typeof areaSuggestion>;

/** `null` cuando no hay IA, no hay texto suficiente o el modelo no acertó a decidir. */
export const suggestAreaResponse = z.object({ suggestion: areaSuggestion.nullable() });
export type SuggestAreaResponse = z.infer<typeof suggestAreaResponse>;

// ── IA-2 · Clasificación ──────────────────────────────────────

/** Lo que el modelo devuelve al clasificar; se valida antes de guardarlo. */
export const classification = z.object({
  categoryId: objectId.nullable(),
  priority,
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(280),
});
export type Classification = z.infer<typeof classification>;

/** `null` cuando no hay IA configurada, está apagada o el modelo no contestó. */
export const classifyResponse = z.object({ classification: classification.nullable() });
export type ClassifyResponse = z.infer<typeof classifyResponse>;

// ── IA-3 · Resumen ────────────────────────────────────────────

export const summaryResponse = z.object({
  summary: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});
export type SummaryResponse = z.infer<typeof summaryResponse>;

// ── IA-4 · Autocompletado ─────────────────────────────────────

export const autocompleteInput = z.object({
  ticketId: objectId,
  /** Lo que la persona lleva escrito; puede estar vacío al empezar. */
  draft: z.string().max(2000).default(""),
  type: z.enum(["public", "internal"]).default("public"),
});
export type AutocompleteInput = z.infer<typeof autocompleteInput>;

export const autocompleteResponse = z.object({ completion: z.string().nullable() });
export type AutocompleteResponse = z.infer<typeof autocompleteResponse>;

/**
 * El fantasma del redactor se descarta a los 1,5 s (spec §6.3): pasado ese punto
 * la persona ya escribió otra cosa y la sugerencia estorba más de lo que ayuda.
 */
export const AUTOCOMPLETE_TIMEOUT_MS = 1_500;
/** Una petición cada 2 s por persona, para no quemar la cuota gratuita. */
export const AUTOCOMPLETE_MIN_INTERVAL_MS = 2_000;

// ── IA-5 · Incidentes ─────────────────────────────────────────

export const incidentGroup = z.object({
  groupId: z.string(),
  label: z.string().max(120),
  confidence: z.number().min(0).max(1),
  ticketIds: z.array(objectId),
});
export type IncidentGroup = z.infer<typeof incidentGroup>;

export const incidentResponse = z.object({ incident: incidentGroup.nullable() });
export type IncidentResponse = z.infer<typeof incidentResponse>;

/**
 * Modelo por defecto: familia Flash, por velocidad y costo (spec §6.1). Se eligió
 * la variante *lite* tras medirlas con una clave real: responde en ~0,7 s frente
 * a los ~10 s de `gemini-3.5-flash`, y los modelos más nuevos devolvían 503 por
 * saturación. Para clasificar un ticket en tres frases, la rapidez vale más que
 * la capacidad de razonar.
 *
 * Google retira nombres con el tiempo (`gemini-2.5-flash` dejó de aceptar cuentas
 * nuevas y la API responde 404 diciendo cuál usar). Por eso `GEMINI_MODEL` en el
 * `.env` lo cambia sin tocar código.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
