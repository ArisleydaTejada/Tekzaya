import type { Priority, SlaState, TicketStatus } from "../data/types";
import { PRIORITY_META, SLA_META, STATUS_META, areaById } from "../data/mock";
import type { AreaId } from "../data/types";
import { SlaNeedleIcon } from "./icons";

const TONE_DOT: Record<string, string> = {
  red: "bg-red",
  amber: "bg-amber",
  amberSoft: "bg-amber/70",
  green: "bg-green",
};

const TONE_TEXT: Record<string, string> = {
  red: "text-red",
  amber: "text-amber",
  amberSoft: "text-amber",
  green: "text-green",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${TONE_TEXT[meta.tone]}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[meta.tone]}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--content-border)] bg-[var(--content-surface)] px-2 py-0.5 font-display text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--content-ink-dim)]">
      {meta.label}
    </span>
  );
}

export function SlaTag({ state, label }: { state: SlaState; label?: string }) {
  const meta = SLA_META[state];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${TONE_TEXT[meta.tone]}`}>
      <SlaNeedleIcon className="shrink-0" />
      {label ?? meta.label}
    </span>
  );
}

export function AreaTag({ areaId }: { areaId: AreaId }) {
  const area = areaById(areaId);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--content-border)] px-2 py-0.5 text-xs font-medium text-[var(--content-ink-dim)]">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: area.color }} aria-hidden="true" />
      {area.name}
    </span>
  );
}
