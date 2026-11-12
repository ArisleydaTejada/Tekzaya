import { maintenanceDashboard, type MaintenanceDashboard, type MaintenancePeriod } from "@tekzaya/shared";
import { apiFetch, queryString } from "./client";

export const maintenanceKeys = {
  all: ["maintenance"] as const,
  dashboard: (areaId: string | undefined, period: MaintenancePeriod) =>
    [...maintenanceKeys.all, "dashboard", areaId ?? "all", period] as const,
};

export function getMaintenanceDashboard(areaId: string | undefined, period: MaintenancePeriod): Promise<MaintenanceDashboard> {
  return apiFetch(`/maintenance/dashboard${queryString({ areaId, period })}`, maintenanceDashboard);
}
