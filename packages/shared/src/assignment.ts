import type { AreaWorkloadMember } from "./area";
import { WORKLOAD_WEIGHTS } from "./area";
import type { Priority } from "./enums";

export interface AutoAssignTicket {
  id: string;
  priority: Priority;
}

export interface AutoAssignment {
  ticketId: string;
  assigneeId: string;
}

export interface AutoAssignPlan {
  /** A quién le toca cada ticket, en el orden en que se repartió. */
  assignments: AutoAssignment[];
  /** Carga ponderada de cada persona tras el reparto, por id. */
  loadAfter: Record<string, number>;
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Reparte tickets sin responsable entre la gente disponible del área: cada uno va
 * a quien tenga en ese momento menos carga ponderada (spec §7.5), y esa carga
 * crece con el ticket recién asignado. Así quien llega con poco recibe más y
 * quien llega cargado recibe menos, sin igualar a la fuerza.
 *
 * Los urgentes se reparten primero: son los que más pesan y conviene que caigan
 * en quien está más libre, no en lo que sobre al final. Quien está ausente no
 * recibe nada. Sin nadie disponible, el plan sale vacío.
 */
export function planAutoAssignment(
  tickets: AutoAssignTicket[],
  members: AreaWorkloadMember[],
): AutoAssignPlan {
  const pool = members
    .filter((member) => member.availability.state === "available")
    .map((member) => ({ id: member.id, name: member.name, load: member.load, open: member.openTickets }));

  const loadAfter: Record<string, number> = Object.fromEntries(
    members.map((member) => [member.id, member.load]),
  );
  if (pool.length === 0) return { assignments: [], loadAfter };

  const queue = [...tickets].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  const assignments: AutoAssignPlan["assignments"] = [];

  for (const ticket of queue) {
    // Empate de carga: primero quien tiene menos tickets y, si sigue, por nombre,
    // para que el mismo tablero dé siempre el mismo reparto.
    const target = pool.reduce((best, member) =>
      member.load < best.load ||
      (member.load === best.load &&
        (member.open < best.open ||
          (member.open === best.open && member.name.localeCompare(best.name, "es") < 0)))
        ? member
        : best,
    );
    target.load += WORKLOAD_WEIGHTS[ticket.priority];
    target.open += 1;
    loadAfter[target.id] = target.load;
    assignments.push({ ticketId: ticket.id, assigneeId: target.id });
  }

  return { assignments, loadAfter };
}
