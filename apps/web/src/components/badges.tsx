import {
  isSettledStatus,
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

type Tone = "red" | "amber" | "amberSoft" | "green" | "muted";

const TONE_DOT: Record<Tone, string> = {
  red: "bg-red",
  amber: "bg-amber",
  amberSoft: "bg-amber/70",
  green: "bg-green",
  muted: "bg-[var(--content-ink-dim)]",
};

const TONE_TEXT: Record<Tone, string> = {
  red: "text-red",
  amber: "text-amber",
  amberSoft: "text-amber",
  green: "text-green",
  muted: "text-[var(--content-ink-dim)]",
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

/**
 * El SLA de un ticket entregado es un veredicto, no una cuenta atrás.
 *
 * Mientras el ticket vive, los tres colores de siempre avisan de lo que está por
 * vencer. En cuanto se entrega, el reloj paró y solo queda decir si se cumplió
 * —información de archivo, en gris— o si no, que sigue en rojo porque es lo que
 * hay que revisar. Un ticket cerrado a tiempo hace dos meses no tiene por qué
 * seguir pintado de verde ni, mucho menos, acumulando días de retraso.
 *
 * Cancelar o fusionar no es incumplir: ese ticket nunca tuvo que resolverse, así
 * que no recibe veredicto, solo la constancia de que ya no corre.
 */
export function SlaTag({
  state,
  label,
  status,
}: {
  state: SlaState;
  label?: string;
  /** Estado del ticket; sin él la etiqueta se comporta como un plazo vivo. */
  status?: TicketStatus;
}) {
  const settled = status !== undefined && isSettledStatus(status);
  const withoutDeadline = status === "cancelled" || status === "merged";
  const missed = settled && !withoutDeadline && state === "breached";

  const tone: Tone = settled ? (missed ? "red" : "muted") : SLA_TONE[state];
  const text =
    label ??
    (withoutDeadline
      ? "Sin plazo"
      : settled
        ? missed
          ? "Fuera de plazo"
          : "Dentro del plazo"
        : SLA_STATE_LABEL[state]);

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${TONE_TEXT[tone]}`}>
      <SlaNeedleIcon className="shrink-0" />
      {text}
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
