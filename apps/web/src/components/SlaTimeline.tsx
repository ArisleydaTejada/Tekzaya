import { isSettledStatus, type SlaState, type TicketStatus } from "@tekzaya/shared";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatDateTime, formatSlaDelta, formatSlaDuration } from "../lib/format";

/**
 * El SLA de un ticket, dicho en dos caracteres y explicado al pasar por encima.
 *
 * La ficha solo lleva el margen —"4d", "-4h"—, porque eso es lo que se compara de
 * un vistazo entre veinte filas; el signo basta para saber si se va tarde. Lo
 * demás —qué plazo es, cuándo vence, qué ya se cumplió— vive en la línea de
 * tiempo que se abre encima, que es donde se mira cuando hace falta decidir.
 *
 * Con el ticket entregado el reloj paró: la ficha pasa a dar el veredicto en vez
 * de seguir contando días contra un plazo que ya no corre (spec §5.3).
 */

/**
 * Lo que hace falta saber del SLA, tomado tal cual del ticket. La ficha del
 * detalle (`ticket.sla`) lo trae entero; una fila del listado no lleva ni la
 * pausa ni el instante de entrega, y por eso los dos últimos son opcionales: con
 * menos datos se enseña menos, no algo distinto.
 */
export interface SlaFacts {
  responseDueAt: string;
  resolutionDueAt: string;
  responseState: SlaState;
  resolutionState: SlaState;
  firstResponseAt?: string | undefined;
  settledAt?: string | undefined;
  pausedMs?: number | undefined;
  /** El ticket está parado esperando al solicitante desde este instante. */
  onHoldSince?: string | undefined;
  /** Y se cerrará solo en este otro si nadie contesta (spec §5.2). */
  requesterWaitDueAt?: string | undefined;
}

type Tone = "red" | "amber" | "green" | "muted";

const CHIP_TONE: Record<Tone, string> = {
  red: "bg-red/15 text-red",
  amber: "bg-amber/15 text-amber",
  green: "bg-green/15 text-green",
  muted: "bg-[var(--content-bg)] text-[var(--content-ink-dim)]",
};

const STATE_TONE: Record<SlaState, Tone> = {
  on_time: "green",
  at_risk: "amber",
  breached: "red",
};

/** Ancho de la tarjeta (`w-72`), que hace falta en números para no salirse. */
const CARD_WIDTH = 288;

/** Un plazo de la línea de tiempo: el que falta por vencer o el que ya se cumplió. */
interface Leg {
  /** "Responder", "Resolver": qué hay que hacer antes de ese instante. */
  action: string;
  /** El nombre del plazo, tal como lo llama el acuerdo de servicio. */
  metric: string;
  at: string;
  tone: Tone;
  /** Ya ocurrió: en vez del margen se marca como cumplido. */
  done?: boolean;
  /** Sustituye a la fecha cuando hace falta explicar el plazo, no fecharlo. */
  note?: string;
}

/** Dónde cae la tarjeta en la pantalla; se mide al abrir, no en cada render. */
interface Anchor {
  left: number;
  /** Se ancla por arriba o por abajo según el sitio que quede. */
  top?: number;
  bottom?: number;
}

export function SlaTimeline({
  sla,
  status,
  className,
}: {
  sla: SlaFacts;
  status: TicketStatus;
  className?: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  const settled = isSettledStatus(status);
  const withoutDeadline = status === "cancelled" || status === "merged";
  const missed = settled && !withoutDeadline && sla.resolutionState === "breached";

  const tone: Tone = settled ? (missed ? "red" : "muted") : STATE_TONE[sla.resolutionState];
  const label = withoutDeadline
    ? "Sin plazo"
    : settled
      ? missed
        ? "Fuera de plazo"
        : "En plazo"
      : formatSlaDelta(sla.resolutionDueAt);

  /*
   * La tarjeta se dibuja en el `body` y no junto a la ficha porque las tablas
   * tienen scroll horizontal: dentro de ellas, cualquier cosa que se salga del
   * borde se recorta. Al salir del recuadro se pierde la referencia, así que la
   * posición se mide al abrir y se cierra si la página se mueve debajo.
   */
  function show() {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.max(8, Math.min(box.left, window.innerWidth - CARD_WIDTH - 8));
    // Si abajo no cabe, cuelga hacia arriba desde el borde superior de la ficha.
    setAnchor(
      box.bottom + 260 > window.innerHeight && box.top > 260
        ? { left, bottom: window.innerHeight - box.top + 6 }
        : { left, top: box.bottom + 6 },
    );
  }

  const open = anchor !== null;
  useEffect(() => {
    if (!open) return;
    const close = () => setAnchor(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const legs: Leg[] = [
    sla.firstResponseAt
      ? {
          action: "Respondido",
          metric: "Tiempo de primera respuesta",
          at: sla.firstResponseAt,
          tone: "muted",
          done: true,
        }
      : {
          action: "Responder",
          metric: "Tiempo de primera respuesta",
          at: sla.responseDueAt,
          tone: STATE_TONE[sla.responseState],
        },
    settled && sla.settledAt
      ? {
          action: "Entregado",
          metric: "Tiempo de trabajo del agente",
          at: sla.settledAt,
          tone: "muted",
          done: true,
        }
      : {
          action: "Resolver",
          metric: "Tiempo de trabajo del agente",
          at: sla.resolutionDueAt,
          tone: STATE_TONE[sla.resolutionState],
        },
  ];

  /*
   * El ticket está parado esperando al solicitante. Es un plazo de verdad —al
   * vencer, el ticket se cierra solo— pero no es del SLA: vencerlo no es
   * incumplir, así que va en gris y no en rojo. Y se cuenta aparte del tiempo
   * ya acumulado en pausa, que es un total histórico y no una cuenta atrás.
   */
  if (sla.requesterWaitDueAt) {
    legs.push({
      action: "Espera del solicitante",
      metric: "Tiempo de espera del solicitante",
      at: sla.requesterWaitDueAt,
      tone: "muted",
      note: "Si nadie responde, el ticket se cierra solo.",
    });
  }

  return (
    <span
      className={`inline-flex ${className ?? ""}`}
      onMouseEnter={show}
      onMouseLeave={() => setAnchor(null)}
    >
      {/* Se abre al pasar por encima y también al enfocarla, que es como llega
          quien navega con el teclado o toca la pantalla. */}
      <button
        ref={trigger}
        type="button"
        onClick={show}
        onFocus={show}
        onBlur={() => setAnchor(null)}
        aria-expanded={open}
        aria-label={`SLA ${label}`}
        className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-display text-xs font-semibold tabular ${CHIP_TONE[tone]}`}
      >
        {label}
      </button>

      {anchor !== null &&
        createPortal(
          <div
            role="tooltip"
            style={{
              left: anchor.left,
              ...(anchor.top !== undefined ? { top: anchor.top } : {}),
              ...(anchor.bottom !== undefined ? { bottom: anchor.bottom } : {}),
            }}
            className="pointer-events-none fixed z-50 w-72 rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-4 text-left shadow-[var(--content-shadow)]"
          >
            <div className="flex flex-col gap-4">
              {legs.map((leg, index) => (
                <div key={leg.metric} className="relative flex gap-3">
                  {/* El hilo que une los plazos; el último no arrastra cola. */}
                  {index < legs.length - 1 && (
                    <span
                      className="absolute left-[18px] top-7 h-[calc(100%+0.4rem)] w-px bg-[var(--content-border)]"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`z-10 inline-flex h-6 shrink-0 items-center justify-center rounded-md px-1.5 font-display text-[11px] font-semibold tabular ${
                      CHIP_TONE[leg.tone]
                    }`}
                  >
                    {leg.done ? "✓" : formatSlaDelta(leg.at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--content-ink)]">{leg.action}</p>
                    <p className="mt-1 inline-block rounded-md bg-[var(--content-bg)] px-1.5 py-0.5 text-[11px] text-[var(--content-ink-dim)]">
                      {leg.metric}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--content-ink-dim)]">
                      {formatDateTime(leg.at)}
                    </p>
                    {leg.note && (
                      <p className="mt-0.5 text-[11px] text-[var(--content-ink-dim)]">{leg.note}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* El reloj se para en "En espera": sin decirlo, el margen parece
                  regalado (spec §5.2). */}
              {(sla.pausedMs ?? 0) > 0 && (
                <div className="relative flex gap-3">
                  <span className="z-10 inline-flex h-6 shrink-0 items-center justify-center rounded-md bg-[var(--content-bg)] px-1.5 font-display text-[11px] font-semibold tabular text-[var(--content-ink-dim)]">
                    {formatSlaDuration(sla.pausedMs!)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--content-ink)]">Tiempo en pausa</p>
                    <p className="mt-1 inline-block rounded-md bg-[var(--content-bg)] px-1.5 py-0.5 text-[11px] text-[var(--content-ink-dim)]">
                      Acumulado en «En espera»
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--content-ink-dim)]">
                      No cuenta contra el plazo.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
