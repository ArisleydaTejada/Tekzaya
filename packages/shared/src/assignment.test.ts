import { describe, expect, it } from "vitest";
import type { AreaWorkloadMember } from "./area";
import { planAutoAssignment } from "./assignment";

function member(id: string, load: number, partial: Partial<AreaWorkloadMember> = {}): AreaWorkloadMember {
  return {
    id,
    name: id,
    availability: { state: "available" },
    openTickets: load,
    urgentOrHigh: 0,
    atRisk: 0,
    resolvedThisWeek: 0,
    load,
    suggested: false,
    ...partial,
  };
}

const count = (plan: ReturnType<typeof planAutoAssignment>, id: string) =>
  plan.assignments.filter((row) => row.assigneeId === id).length;

describe("planAutoAssignment", () => {
  it("da más a quien llega con menos carga y menos a quien llega cargado", () => {
    const tickets = Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, priority: "low" as const }));
    const plan = planAutoAssignment(tickets, [member("ana", 0), member("luis", 4)]);

    // Ana alcanza a Luis con 4 tickets y los 2 restantes se alternan.
    expect(count(plan, "ana")).toBe(5);
    expect(count(plan, "luis")).toBe(1);
    expect(plan.loadAfter).toEqual({ ana: 5, luis: 5 });
  });

  it("no le da nada a quien está ausente", () => {
    const tickets = [{ id: "t1", priority: "medium" as const }];
    const plan = planAutoAssignment(tickets, [
      member("ana", 0, { availability: { state: "away" } }),
      member("luis", 10),
    ]);
    expect(plan.assignments).toEqual([{ ticketId: "t1", assigneeId: "luis" }]);
  });

  it("sale vacío si nadie está disponible", () => {
    const plan = planAutoAssignment(
      [{ id: "t1", priority: "low" }],
      [member("ana", 0, { availability: { state: "away" } })],
    );
    expect(plan.assignments).toEqual([]);
  });

  it("reparte primero los urgentes, a quien está más libre", () => {
    const plan = planAutoAssignment(
      [
        { id: "bajo", priority: "low" },
        { id: "urgente", priority: "urgent" },
      ],
      [member("ana", 0), member("luis", 1)],
    );
    expect(plan.assignments[0]).toEqual({ ticketId: "urgente", assigneeId: "ana" });
    expect(plan.assignments[1]).toEqual({ ticketId: "bajo", assigneeId: "luis" });
  });
});
