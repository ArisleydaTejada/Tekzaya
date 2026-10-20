import {
  sparePartDetail,
  sparePartListResponse,
  stockMovementsResponse,
  type CreateSparePartInput,
  type CreateStockMovementInput,
  type SparePartDetail,
  type SparePartListQuery,
  type SparePartListResponse,
  type StockMovementsResponse,
  type UpdateSparePartInput,
} from "@tekzaya/shared";
import { apiFetch, queryString } from "./client";

export const sparePartKeys = {
  all: ["spare-parts"] as const,
  list: (query: Partial<SparePartListQuery>) => [...sparePartKeys.all, "list", query] as const,
  detail: (number: string) => [...sparePartKeys.all, "detail", number] as const,
  movements: (id: string, page: number) => [...sparePartKeys.all, id, "movements", page] as const,
};

export function listSpareParts(query: Partial<SparePartListQuery>): Promise<SparePartListResponse> {
  return apiFetch(`/spare-parts${queryString(query)}`, sparePartListResponse);
}

/** Acepta el número (`REP-0003`), que es lo que va en la dirección de la página. */
export function getSparePart(key: string): Promise<SparePartDetail> {
  return apiFetch(`/spare-parts/${encodeURIComponent(key)}`, sparePartDetail);
}

export function createSparePart(input: CreateSparePartInput): Promise<SparePartDetail> {
  return apiFetch("/spare-parts", sparePartDetail, { method: "POST", body: JSON.stringify(input) });
}

export function updateSparePart(id: string, input: UpdateSparePartInput): Promise<SparePartDetail> {
  return apiFetch(`/spare-parts/${id}`, sparePartDetail, { method: "PATCH", body: JSON.stringify(input) });
}

export function listStockMovements(id: string, page: number, limit: number): Promise<StockMovementsResponse> {
  return apiFetch(`/spare-parts/${id}/movements${queryString({ page, limit })}`, stockMovementsResponse);
}

export function createStockMovement(id: string, input: CreateStockMovementInput): Promise<SparePartDetail> {
  return apiFetch(`/spare-parts/${id}/movements`, sparePartDetail, { method: "POST", body: JSON.stringify(input) });
}

export function sparePartsCsvUrl(query: Record<string, unknown>): string {
  return `/api/v1/spare-parts/export${queryString(query)}`;
}
