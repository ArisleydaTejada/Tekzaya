import {
  PRIORITY_LABEL,
  SLA_STATE_LABEL,
  TICKET_STATUS_LABEL,
  type AreaRef,
  type Priority,
  type SlaState,
  type TicketStatus,
} from "@tekzaya/shared";
import { SlaNeedleIcon } from "./icons";

// Los valores viajan en inglés (`urgent`, `at_risk`); la etiqueta en español sale
// del contrato compartido, así que interfaz y API nunca se desincronizan.

type Tone = "red" | "amber" | "amberSoft" | "green";

const TONE_DOT: Record<Tone, string> = {
  red: "bg-red",
  amber: "bg-amber",
  amberSoft: "bg-amber/70",
  green: "bg-green",
};

const TONE_TEXT: Record<Tone, string> = {
  red: "text-red",
  amber: "text-amber",
  amberSoft: "text-amber",
  green: "text-green",
};

const PRIORITY_TONE: Record<Priority, Tone> = {
  urgent: "red",
  high: "amber",
  medium: "amberSoft",
  low: "green",
};

const SLA_TONE: Record<SlaState, Tone> = {
  on_time: "green",
  at_risk: "amber",
  breached: "red",
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone = PRIORITY_TONE[priority];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${TONE_TEXT[tone]}`}>
      {/* La prioridad nunca va solo por color: el punto acompaña al texto (§13). */}
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--content-border)] bg-[var(--content-surface)] px-2 py-0.5 font-display text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--content-ink-dim)]">
      {TICKET_STATUS_LABEL[status]}
    </span>
  );
}

export function SlaTag({ state, label }: { state: SlaState; label?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${TONE_TEXT[SLA_TONE[state]]}`}
    >
      <SlaNeedleIcon className="shrink-0" />
      {label ?? SLA_STATE_LABEL[state]}
    </span>
  );
}

export function AreaTag({ area }: { area: AreaRef }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--content-border)] px-2 py-0.5 text-xs font-medium text-[var(--content-ink-dim)]">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: area.color }}
        aria-hidden="true"
      />
      {area.name}
    </span>
  );
}
