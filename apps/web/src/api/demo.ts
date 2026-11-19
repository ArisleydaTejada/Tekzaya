import { demoRequestResponse, type DemoRequestInput, type DemoRequestResponse } from "@tekzaya/shared";
import { apiFetch } from "./client";

export function requestDemo(input: DemoRequestInput): Promise<DemoRequestResponse> {
  return apiFetch("/demo-requests", demoRequestResponse, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
