import { describe, expect, it } from "vitest";
import { addPeriod, describeEvery, fixedOccurrences, generationDate, isPlanDue, nextFixedDue } from "./schedule";

describe("sumar periodos", () => {
  it("días y semanas, cruzando meses y años", () => {
    expect(addPeriod("2026-12-28", 5, "day")).toBe("2027-01-02");
    expect(addPeriod("2026-10-20", 2, "week")).toBe("2026-11-03");
  });

  it("los meses se quedan en el último día cuando el día no existe", () => {
    expect(addPeriod("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(addPeriod("2028-01-31", 1, "month")).toBe("2028-02-29");
    expect(addPeriod("2026-08-31", 3, "month")).toBe("2026-11-30");
    expect(addPeriod("2026-11-15", 3, "month")).toBe("2027-02-15");
  });
});

describe("cuándo se genera la OT", () => {
  it("leadDays antes de la fecha", () => {
    expect(generationDate("2026-11-01", 7)).toBe("2026-10-25");
    expect(isPlanDue({ nextDueAt: "2026-11-01", leadDays: 7 }, "2026-10-24")).toBe(false);
    expect(isPlanDue({ nextDueAt: "2026-11-01", leadDays: 7 }, "2026-10-25")).toBe(true);
    // Si el trabajo no corrió ese día, sigue tocando al siguiente.
    expect(isPlanDue({ nextDueAt: "2026-11-01", leadDays: 7 }, "2026-11-10")).toBe(true);
  });
});

describe("calendario fijo", () => {
  const quarterly = { startsOn: "2026-01-31", every: 3, unit: "month" as const };

  it("cuenta desde la fecha de inicio: el 31 no deriva a 28", () => {
    // 31-ene → 30-abr → 31-jul → 31-oct, no 30-abr → 30-jul → 30-oct.
    expect(nextFixedDue(quarterly, "2026-04-30", "2026-04-25")).toBe("2026-07-31");
    expect(nextFixedDue(quarterly, "2026-07-31", "2026-07-25")).toBe("2026-10-31");
  });

  it("si quedaron rondas atrás, salta a la primera posterior a hoy", () => {
    expect(nextFixedDue(quarterly, "2026-01-31", "2026-09-01")).toBe("2026-10-31");
  });

  it("las rondas de un mes, incluida la próxima", () => {
    const weekly = { startsOn: "2026-10-01", nextDueAt: "2026-10-15", every: 1, unit: "week" as const };
    expect(fixedOccurrences(weekly, "2026-10-01", "2026-10-31")).toEqual(["2026-10-15", "2026-10-22", "2026-10-29"]);
  });
});

describe("texto de la recurrencia", () => {
  it("singular y plural", () => {
    expect(describeEvery(1, "month")).toBe("Cada mes");
    expect(describeEvery(3, "month")).toBe("Cada 3 meses");
    expect(describeEvery(2, "week")).toBe("Cada 2 semanas");
  });
});
