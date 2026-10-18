import {
  assetDetail,
  assetEventsResponse,
  assetListResponse,
  assetLocationsResponse,
  assetPeopleResponse,
  assetPickerResponse,
  ticketDetail,
  type AssetDetail,
  type AssetPickerQuery,
  type AssetPickerResponse,
  type CreateWorkOrderFromTicketInput,
  type LinkTicketAssetInput,
  type TicketDetail,
  type AssetEventsResponse,
  type AssetListQuery,
  type AssetListResponse,
  type CreateAssetInput,
  type RetireAssetInput,
  type UpdateAssetInput,
} from "@tekzaya/shared";
import { apiFetch, queryString } from "./client";

export const assetKeys = {
  all: ["assets"] as const,
  list: (query: Partial<AssetListQuery>) => [...assetKeys.all, "list", query] as const,
  detail: (number: string) => [...assetKeys.all, "detail", number] as const,
  events: (id: string) => [...assetKeys.all, id, "events"] as const,
  locations: () => [...assetKeys.all, "locations"] as const,
  people: (areaId: string) => [...assetKeys.all, "people", areaId] as const,
  linkOptions: (query: Partial<AssetPickerQuery>) => [...assetKeys.all, "link-options", query] as const,
};

export function listAssets(query: Partial<AssetListQuery>): Promise<AssetListResponse> {
  return apiFetch(`/assets${queryString(query)}`, assetListResponse);
}

/** Acepta el número (`ACT-0012`), que es lo que va en la dirección de la página. */
export function getAsset(key: string): Promise<AssetDetail> {
  return apiFetch(`/assets/${encodeURIComponent(key)}`, assetDetail);
}

export function createAsset(input: CreateAssetInput): Promise<AssetDetail> {
  return apiFetch("/assets", assetDetail, { method: "POST", body: JSON.stringify(input) });
}

export function updateAsset(id: string, input: UpdateAssetInput): Promise<AssetDetail> {
  return apiFetch(`/assets/${id}`, assetDetail, { method: "PATCH", body: JSON.stringify(input) });
}

export function retireAsset(id: string, input: RetireAssetInput): Promise<AssetDetail> {
  return apiFetch(`/assets/${id}/retire`, assetDetail, { method: "POST", body: JSON.stringify(input) });
}

export function listAssetEvents(id: string): Promise<AssetEventsResponse> {
  return apiFetch(`/assets/${id}/events`, assetEventsResponse);
}

export async function listAssetLocations(): Promise<string[]> {
  return (await apiFetch("/assets/locations", assetLocationsResponse)).items;
}

export async function listAssetPeople(areaId: string) {
  return (await apiFetch(`/assets/people${queryString({ areaId })}`, assetPeopleResponse)).items;
}

export function assetsCsvUrl(query: Record<string, unknown>): string {
  return `/api/v1/assets/export${queryString(query)}`;
}

// ── Ticket ↔ equipo (plan A2) ─────────────────────────────────

export function listAssetLinkOptions(query: Partial<AssetPickerQuery>): Promise<AssetPickerResponse> {
  return apiFetch(`/assets/link-options${queryString(query)}`, assetPickerResponse);
}

export function linkTicketAsset(ticketId: string, input: LinkTicketAssetInput): Promise<TicketDetail> {
  return apiFetch(`/tickets/${ticketId}/asset`, ticketDetail, { method: "PATCH", body: JSON.stringify(input) });
}

export function createWorkOrderFromTicket(
  ticketId: string,
  input: CreateWorkOrderFromTicketInput,
): Promise<TicketDetail> {
  return apiFetch(`/tickets/${ticketId}/work-order`, ticketDetail, { method: "POST", body: JSON.stringify(input) });
}
