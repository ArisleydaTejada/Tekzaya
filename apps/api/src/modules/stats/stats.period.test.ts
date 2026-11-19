import { DEFAULT_BUSINESS_HOURS } from "@tekzaya/shared";
import { describe, expect, it } from "vitest";
import { resolveRange } from "./stats.period";

const zone = { ...DEFAULT_BUSINESS_HOURS, timezone: "America/Santo_Domingo" };
// 19 nov 2026, 14:00 en Santo Domingo (UTC−4).
const now = new Date("2026-11-19T18:00:00.000Z");

describe("rango personalizado", () => {
  it("un fin en el futuro se corta en este momento", () => {
    const range = resolveRange({ scope: "me", period: "range", from: "2026-11-01", to: "2026-12-12" }, zone, now);

    expect(range.from).toBe("2026-11-01T04:00:00.000Z");
    expect(range.to).toBe(now.toISOString());
  });

  it("un fin pasado incluye su día completo", () => {
    const range = resolveRange({ scope: "me", period: "range", from: "2026-11-01", to: "2026-11-07" }, zone, now);

    expect(range.to).toBe("2026-11-08T04:00:00.000Z");
  });

  it("no puede empezar en el futuro", () => {
    expect(() =>
      resolveRange({ scope: "me", period: "range", from: "2026-11-20", to: "2026-11-25" }, zone, now),
    ).toThrow("El rango no puede empezar en el futuro");
  });
});
