import {
  workOrderAssigneeOptionsResponse,
  workOrderDetail,
  workOrderListResponse,
  workOrderPartOptionsResponse,
  type AddExternalCostInput,
  type AddWorkOrderPartInput,
  type CompleteWorkOrderInput,
  type CreateWorkOrderInput,
  type SetRequiredPartInput,
  type UpdateWorkOrderInput,
  type WorkOrderDetail,
  type WorkOrderListQuery,
  type WorkOrderListResponse,
} from "@tekzaya/shared";
import { apiFetch, queryString } from "./client";

export const workOrderKeys = {
  all: ["work-orders"] as const,
  lists: () => [...workOrderKeys.all, "list"] as const,
  list: (query: Partial<WorkOrderListQuery>) => [...workOrderKeys.lists(), query] as const,
  detail: (number: string) => [...workOrderKeys.all, "detail", number] as const,
  partOptions: (id: string) => [...workOrderKeys.all, id, "part-options"] as const,
  assigneeOptions: (id: string) => [...workOrderKeys.all, id, "assignee-options"] as const,
};

export function listWorkOrders(query: Partial<WorkOrderListQuery>): Promise<WorkOrderListResponse> {
  return apiFetch(`/work-orders${queryString(query)}`, workOrderListResponse);
}

/** Acepta el número (`OT-0012`), que es lo que va en la dirección de la página. */
export function getWorkOrder(key: string): Promise<WorkOrderDetail> {
  return apiFetch(`/work-orders/${encodeURIComponent(key)}`, workOrderDetail);
}

const send = (path: string, method: string, body?: unknown) =>
  apiFetch(path, workOrderDetail, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

export const createWorkOrder = (input: CreateWorkOrderInput) => send("/work-orders", "POST", input);
export const updateWorkOrder = (id: string, input: UpdateWorkOrderInput) => send(`/work-orders/${id}`, "PATCH", input);
export const setWorkOrderAssignees = (id: string, assigneeIds: string[]) =>
  send(`/work-orders/${id}/assignees`, "PUT", { assigneeIds });
export const takeWorkOrder = (id: string) => send(`/work-orders/${id}/take`, "POST");
export const addWorkOrderPart = (id: string, input: AddWorkOrderPartInput) => send(`/work-orders/${id}/parts`, "POST", input);
export const removeWorkOrderPart = (id: string, usageId: string) => send(`/work-orders/${id}/parts/${usageId}`, "DELETE");
export const setRequiredPart = (id: string, input: SetRequiredPartInput) =>
  send(`/work-orders/${id}/required-parts`, "PUT", input);
export const removeRequiredPart = (id: string, itemId: string) =>
  send(`/work-orders/${id}/required-parts/${itemId}`, "DELETE");
export const addExternalCost = (id: string, input: AddExternalCostInput) =>
  send(`/work-orders/${id}/external-costs`, "POST", input);
export const removeExternalCost = (id: string, costId: string) =>
  send(`/work-orders/${id}/external-costs/${costId}`, "DELETE");
export const completeWorkOrder = (id: string, input: CompleteWorkOrderInput) =>
  send(`/work-orders/${id}/complete`, "POST", input);

export async function listWorkOrderPartOptions(id: string) {
  return (await apiFetch(`/work-orders/${id}/part-options`, workOrderPartOptionsResponse)).items;
}

export async function listWorkOrderAssigneeOptions(id: string) {
  return (await apiFetch(`/work-orders/${id}/assignee-options`, workOrderAssigneeOptionsResponse)).items;
}
