import {
  assetDetail,
  assetEventsResponse,
  assetListResponse,
  assetLocationsResponse,
  assetPeopleResponse,
  type AssetDetail,
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
