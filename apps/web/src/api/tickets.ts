import {
  area,
  areaMember,
  messageListResponse,
  messageView,
  ticketDetail,
  ticketListResponse,
  uploadedAttachment,
  type Attachment,
  type CreateMessageInput,
  type CreateTicketInput,
  type MessageListResponse,
  type MessageView,
  type SetAssigneesInput,
  type TicketDetail,
  type TicketListQuery,
  type TicketListResponse,
  type UpdateTicketInput,
} from "@tekzaya/shared";
import { z } from "zod";
import { apiFetch, apiUpload, queryString } from "./client";

const areasResponse = z.object({ items: z.array(area) });
const membersResponse = z.object({ items: z.array(areaMember) });

/**
 * Claves de caché en un solo sitio: invalidar después de una mutación es acertar
 * la clave, y tenerlas dispersas por las páginas es la forma más fácil de fallar.
 */
export const ticketKeys = {
  all: ["tickets"] as const,
  lists: () => [...ticketKeys.all, "list"] as const,
  list: (query: Partial<TicketListQuery>) => [...ticketKeys.lists(), query] as const,
  detail: (number: string) => [...ticketKeys.all, "detail", number] as const,
  messages: (id: string) => [...ticketKeys.all, id, "messages"] as const,
};

export const areaKeys = {
  all: ["areas"] as const,
  members: (areaId: string) => ["areas", areaId, "members"] as const,
};

// ── Tickets ───────────────────────────────────────────────────

export function listTickets(query: Partial<TicketListQuery>): Promise<TicketListResponse> {
  return apiFetch(`/tickets${queryString(query)}`, ticketListResponse);
}

/** La interfaz navega por número (`/tickets/TK-000512`), que es lo que la gente comparte. */
export function getTicketByNumber(number: string): Promise<TicketDetail> {
  return apiFetch(`/tickets/by-number/${encodeURIComponent(number)}`, ticketDetail);
}

export function createTicket(input: CreateTicketInput): Promise<TicketDetail> {
  return apiFetch("/tickets", ticketDetail, { method: "POST", body: JSON.stringify(input) });
}

export function updateTicket(id: string, input: UpdateTicketInput): Promise<TicketDetail> {
  return apiFetch(`/tickets/${id}`, ticketDetail, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function setAssignees(id: string, input: SetAssigneesInput): Promise<TicketDetail> {
  return apiFetch(`/tickets/${id}/assignees`, ticketDetail, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function takeTicket(id: string): Promise<TicketDetail> {
  return apiFetch(`/tickets/${id}/take`, ticketDetail, { method: "POST" });
}

// ── Conversación ──────────────────────────────────────────────

export function listMessages(ticketId: string): Promise<MessageListResponse> {
  return apiFetch(`/tickets/${ticketId}/messages`, messageListResponse);
}

export function createMessage(ticketId: string, input: CreateMessageInput): Promise<MessageView> {
  return apiFetch(`/tickets/${ticketId}/messages`, messageView, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ── Adjuntos ──────────────────────────────────────────────────

export function uploadAttachment(file: File): Promise<Attachment> {
  const body = new FormData();
  body.append("file", file);
  return apiUpload("/attachments", uploadedAttachment, body);
}

export function attachmentUrl(id: string): string {
  return `/api/v1/attachments/${id}`;
}

// ── Catálogos ─────────────────────────────────────────────────

export async function listAreas() {
  return (await apiFetch("/areas", areasResponse)).items;
}

export async function listAreaMembers(areaId: string) {
  return (await apiFetch(`/areas/${areaId}/members`, membersResponse)).items;
}
