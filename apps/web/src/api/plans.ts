import {
  calendarResponse,
  planListResponse,
  planView,
  type CalendarQuery,
  type CalendarResponse,
  type CreatePlanInput,
  type PlanListQuery,
  type PlanListResponse,
  type PlanView,
  type UpdatePlanInput,
} from "@tekzaya/shared";
import { apiFetch, queryString } from "./client";

export const planKeys = {
  all: ["maintenance-plans"] as const,
  list: (query: Partial<PlanListQuery>) => [...planKeys.all, "list", query] as const,
  calendar: (query: CalendarQuery) => [...planKeys.all, "calendar", query] as const,
};

export function listPlans(query: Partial<PlanListQuery>): Promise<PlanListResponse> {
  return apiFetch(`/maintenance-plans${queryString(query)}`, planListResponse);
}

export function getPlanCalendar(query: CalendarQuery): Promise<CalendarResponse> {
  return apiFetch(`/maintenance-plans/calendar${queryString(query)}`, calendarResponse);
}

export function createPlan(input: CreatePlanInput): Promise<PlanView> {
  return apiFetch("/maintenance-plans", planView, { method: "POST", body: JSON.stringify(input) });
}

export function updatePlan(id: string, input: UpdatePlanInput): Promise<PlanView> {
  return apiFetch(`/maintenance-plans/${id}`, planView, { method: "PATCH", body: JSON.stringify(input) });
}

export function setPlanActive(id: string, active: boolean): Promise<PlanView> {
  return apiFetch(`/maintenance-plans/${id}/${active ? "resume" : "pause"}`, planView, { method: "POST" });
}
