import type { AreaWorkloadMember } from "@tekzaya/shared";

/** Cómo se listan las personas al asignar: por carga o por nombre. */
export type MemberOrder = "load" | "name";

const OPTIONS: { id: MemberOrder; label: string }[] = [
  { id: "load", label: "Menos carga" },
  { id: "name", label: "A–Z" },
];

/**
 * Devuelve una copia ordenada. "Carga" es la ponderada por prioridad, la misma
 * que pinta la barra y decide la sugerencia; el empate se rompe por número de
 * tickets y después por nombre, igual que el reparto automático. Quien está
 * ausente va siempre al final: aparece, pero no se le puede asignar.
 */
export function sortMembers(members: AreaWorkloadMember[], order: MemberOrder) {
  const byName = (a: AreaWorkloadMember, b: AreaWorkloadMember) =>
    a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  const isAway = (member: AreaWorkloadMember) => Number(member.availability.state === "away");
  return [...members].sort(
    (a, b) =>
      isAway(a) - isAway(b) ||
      (order === "load"
        ? a.load - b.load || a.openTickets - b.openTickets || byName(a, b)
        : byName(a, b)),
  );
}

export function MemberOrderToggle({
  value,
  onChange,
}: {
  value: MemberOrder;
  onChange: (order: MemberOrder) => void;
}) {
  return (
    <div role="group" aria-label="Ordenar personas" className="flex items-center gap-1 text-xs">
      <span className="mr-1 text-[var(--content-ink-dim)]">Ordenar:</span>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
            value === option.id
              ? "bg-accent text-white"
              : "border border-[var(--content-border)] text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
