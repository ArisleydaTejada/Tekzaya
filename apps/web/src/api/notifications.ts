import {
  notificationListResponse,
  type MarkNotificationsInput,
  type NotificationListResponse,
} from "@tekzaya/shared";
import { z } from "zod";
import { apiFetch, queryString } from "./client";

const markResponse = z.object({
  marked: z.number().int().min(0),
  unread: z.number().int().min(0),
});

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (limit: number) => [...notificationKeys.all, limit] as const,
};

export function listNotifications(limit = 20): Promise<NotificationListResponse> {
  return apiFetch(`/notifications${queryString({ limit })}`, notificationListResponse);
}

export function markNotifications(input: MarkNotificationsInput) {
  return apiFetch("/notifications", markResponse, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
