import {
  ASSET_STATUS_LABEL,
  WARRANTY_STATE_LABEL,
  type AssetStatus,
  type WarrantyState,
} from "@tekzaya/shared";
import { formatDay, warrantyCountdown } from "../lib/format";
import { AlertIcon, CheckIcon, ShieldIcon, WrenchIcon, XIcon } from "./icons";

/**
 * Los estados del activo reutilizan los tonos de los tickets: verde operativo,
 * naranja en reparación, gris de baja. Nunca van solo por color (plan A7): cada
 * uno lleva su icono y su texto.
 */
const STATUS_TOKEN: Record<AssetStatus, string> = {
  operational: "resolved",
  in_repair: "in_progress",
  retired: "cancelled",
};

const STATUS_ICON: Record<AssetStatus, typeof CheckIcon> = {
  operational: CheckIcon,
  in_repair: WrenchIcon,
  retired: XIcon,
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const token = STATUS_TOKEN[status];
  const Icon = STATUS_ICON[status];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em]"
      style={{
        background: `var(--st-${token}-bg)`,
        color: `var(--st-${token}-ink)`,
        borderColor: `var(--st-${token}-border)`,
      }}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {ASSET_STATUS_LABEL[status]}
    </span>
  );
}

const WARRANTY_TONE: Record<WarrantyState, string> = {
  active: "text-green",
  expiring: "text-amber",
  expired: "text-[var(--content-ink-dim)]",
  none: "text-[var(--content-ink-dim)]",
};

/**
 * La garantía: estado y fecha; si vence pronto, cuántos días quedan. `stacked`
 * pone la fecha debajo, para la columna estrecha de la lista.
 */
export function WarrantyBadge({
  state,
  until,
  stacked = false,
}: {
  state: WarrantyState;
  until?: string | undefined;
  stacked?: boolean;
}) {
  const Icon = state === "expiring" ? AlertIcon : ShieldIcon;
  const countdown = until && state === "expiring" ? warrantyCountdown(until).toLowerCase() : null;
  // Apilada no repite "vence": la línea de arriba ya dice "Vence pronto".
  const detail = until ? (countdown ? (stacked ? countdown.replace(/^vence /, "") : countdown) : formatDay(until)) : null;
  return (
    <span className={`inline-flex gap-1 text-xs ${stacked ? "items-start" : "items-center whitespace-nowrap"} ${WARRANTY_TONE[state]}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${stacked ? "mt-px" : ""}`} aria-hidden="true" />
      <span className={stacked ? "flex flex-col" : ""}>
        <span className="font-medium">{WARRANTY_STATE_LABEL[state]}</span>
        {detail && (
          <span className={`text-[var(--content-ink-dim)] ${stacked ? "whitespace-nowrap" : ""}`}>
            {stacked ? detail : ` · ${detail}`}
          </span>
        )}
      </span>
    </span>
  );
}
