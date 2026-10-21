import { maintenanceDashboard, type MaintenanceDashboard } from "@tekzaya/shared";
import { apiFetch, queryString } from "./client";

export const maintenanceKeys = {
  all: ["maintenance"] as const,
  dashboard: (areaId: string | undefined) => [...maintenanceKeys.all, "dashboard", areaId ?? "all"] as const,
};

export function getMaintenanceDashboard(areaId?: string): Promise<MaintenanceDashboard> {
  return apiFetch(`/maintenance/dashboard${queryString({ areaId })}`, maintenanceDashboard);
}
