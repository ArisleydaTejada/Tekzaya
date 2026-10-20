import {
  WORK_ORDER_HOLD_REASON_LABEL,
  WORK_ORDER_STATUS_LABEL,
  WORK_ORDER_TYPE_LABEL,
  type WorkOrderHoldReason,
  type WorkOrderStatus,
  type WorkOrderType,
} from "@tekzaya/shared";
import { AlertIcon, ShieldIcon, WrenchIcon } from "./icons";

/**
 * Los estados de la OT reutilizan los tonos de los tickets: Pendiente como
 * Abierto, Completada como Resuelto. Siempre con su texto: el color acompaña.
 */
const STATUS_TOKEN: Record<WorkOrderStatus, string> = {
  pending: "open",
  assigned: "assigned",
  in_progress: "in_progress",
  on_hold: "on_hold",
  completed: "resolved",
  cancelled: "cancelled",
};

export function WorkOrderStatusBadge({
  status,
  holdReason,
}: {
  status: WorkOrderStatus;
  holdReason?: WorkOrderHoldReason | undefined;
}) {
  const token = STATUS_TOKEN[status];
  return (
    <span
      className="inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em]"
      style={{
        background: `var(--st-${token}-bg)`,
        color: `var(--st-${token}-ink)`,
        borderColor: `var(--st-${token}-border)`,
      }}
      title={status === "on_hold" && holdReason ? WORK_ORDER_HOLD_REASON_LABEL[holdReason] : undefined}
    >
      {WORK_ORDER_STATUS_LABEL[status]}
    </span>
  );
}

/** Correctiva (una avería) o preventiva (mantenimiento programado), con icono propio. */
export function WorkOrderTypeTag({ type }: { type: WorkOrderType }) {
  const Icon = type === "corrective" ? WrenchIcon : ShieldIcon;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[var(--content-ink-dim)]">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {WORK_ORDER_TYPE_LABEL[type]}
    </span>
  );
}

/** Un preventivo que pasó su fecha: las OT no tienen SLA, pero esto sí se ve. */
export function OverdueTag() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-red">
      <AlertIcon className="h-3.5 w-3.5" aria-hidden="true" />
      Vencida
    </span>
  );
}
