import {
  businessMinutesBetween,
  formatTicketNumber,
  PRIORITY_LABEL,
  slaStateAt,
  SLA_STATE_LABEL,
  TICKET_STATUS_LABEL,
  type BusinessCalendar,
  type Priority,
  type TicketStatus,
} from "@tekzaya/shared";
import type { Response } from "express";
import { getCalendar } from "../settings/settings.service";
import { hydrate, type Hydration } from "./ticket.view";
import type { LeanTicket } from "./ticket.access";

/**
 * Una celda de CSV. Se entrecomilla siempre que el texto pueda contener el
 * separador, un salto de línea o una comilla; un título de ticket trae cualquiera
 * de las tres cosas tarde o temprano.
 */
function cell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function row(values: readonly unknown[]): string {
  return values.map(cell).join(",");
}

const COLUMNS = [
  "Número",
  "Título",
  "Área",
  "Categoría",
  "Prioridad",
  "Estado",
  "Solicitante",
  "Creado por",
  "Responsables",
  "Creado",
  "Primera respuesta",
  "Resuelto",
  "Cerrado",
  "Horas 1.ª respuesta",
  "Horas resolución",
  "SLA respuesta",
  "SLA resolución",
  "CSAT",
  "Comentario CSAT",
] as const;

const iso = (date: Date | undefined | null): string => (date ? date.toISOString() : "");

/** Horas laborales entre dos fechas, descontando las pausas (spec §9). */
function workingHours(
  from: Date,
  to: Date | undefined,
  pausedMs: number,
  calendar: BusinessCalendar,
): string {
  if (!to) return "";
  const minutes = businessMinutesBetween(from, to, calendar) - Math.round(pausedMs / 60_000);
  return (Math.max(0, minutes) / 60).toFixed(2);
}

/**
 * Serializa tickets a CSV. **Nunca** incluye el contenido de la conversación ni de
 * las notas internas (spec §7.2.4): una exportación no es una puerta lateral a la
 * trastienda del área.
 */
export async function ticketsToCsv(tickets: LeanTicket[], now = new Date()): Promise<string> {
  const [hydration, calendar] = await Promise.all([hydrate(tickets), getCalendar()]);
  return [
    row(COLUMNS),
    ...tickets.map((ticket) => ticketRow(ticket, hydration, calendar, now)),
  ].join("\r\n");
}

/**
 * Un archivo CSV completo a partir de uno o varios bloques. El BOM va una sola vez
 * y al principio: sin él Excel abre el archivo en la codificación del sistema y los
 * acentos salen partidos.
 */
export function csvFile(...blocks: readonly string[]): string {
  return `﻿${blocks.join("\r\n")}\r\n`;
}

function ticketRow(
  ticket: LeanTicket,
  hydration: Hydration,
  calendar: BusinessCalendar,
  now: Date,
): string {
  const sla = ticket["sla"] ?? {};
  const createdAt = ticket["createdAt"] as Date;
  const nameOf = (id: unknown): string => hydration.users.get(String(id))?.name ?? "";

  const responseState = slaStateAt(now, {
    dueAt: sla.responseDueAt as Date,
    riskAt: sla.responseRiskAt as Date,
    completedAt: sla.firstResponseAt as Date | undefined,
  });
  const resolutionState = slaStateAt(now, {
    dueAt: sla.resolutionDueAt as Date,
    riskAt: sla.resolutionRiskAt as Date,
    completedAt: sla.resolvedAt as Date | undefined,
  });

  return row([
    formatTicketNumber(ticket["number"] as number),
    ticket["title"],
    hydration.areas.get(String(ticket["areaId"]))?.name ?? "",
    ticket["categoryId"] ? (hydration.categories.get(String(ticket["categoryId"])) ?? "") : "",
    PRIORITY_LABEL[ticket["priority"] as Priority],
    TICKET_STATUS_LABEL[ticket["status"] as TicketStatus],
    nameOf(ticket["requesterId"]),
    nameOf(ticket["createdById"]),
    ((ticket["assigneeIds"] as unknown[] | undefined) ?? []).map(nameOf).filter(Boolean).join(" · "),
    iso(createdAt),
    iso(sla.firstResponseAt as Date | undefined),
    iso(sla.resolvedAt as Date | undefined),
    iso(sla.closedAt as Date | undefined),
    workingHours(createdAt, sla.firstResponseAt as Date | undefined, sla.pausedMs ?? 0, calendar),
    workingHours(createdAt, sla.resolvedAt as Date | undefined, sla.pausedMs ?? 0, calendar),
    SLA_STATE_LABEL[responseState],
    SLA_STATE_LABEL[resolutionState],
    ticket["csat"]?.rating ?? "",
    ticket["csat"]?.comment ?? "",
  ]);
}

/** Cabeceras de descarga; el nombre del archivo lleva la fecha para no pisarse. */
export function sendCsv(res: Response, basename: string, body: string): void {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${basename}-${stamp}.csv"`);
  res.send(body);
}

export { row as csvRow };
