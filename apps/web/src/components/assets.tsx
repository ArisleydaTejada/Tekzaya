import {
  ASSET_STATUS_LABEL,
  MAX_ASSET_PHOTOS,
  WARRANTY_STATE_LABEL,
  type AssetStatus,
  type WarrantyState,
} from "@tekzaya/shared";
import { useState } from "react";
import { attachmentUrl } from "../api/tickets";
import { PHOTO_ACCEPT, uploadAssetPhotos } from "../lib/assetPhotos";
import { formatDay, warrantyCountdown } from "../lib/format";
import { AlertIcon, CheckIcon, PlusIcon, ShieldIcon, WrenchIcon, XIcon } from "./icons";

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
  expired: "text-red",
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

// ── Fotos ─────────────────────────────────────────────────────

/**
 * Las fotos del formulario: miniaturas con su botón de quitar y un selector que
 * admite varias a la vez. La primera es la portada.
 */
export function AssetPhotosField({
  id,
  value,
  onChange,
  onUploading,
  onError,
  max = MAX_ASSET_PHOTOS,
  limitMessage = `Caben ${MAX_ASSET_PHOTOS} fotos por equipo`,
}: {
  id: string;
  max?: number;
  limitMessage?: string;
  value: readonly string[];
  onChange: (photoIds: string[]) => void;
  onUploading: (uploading: boolean) => void;
  onError: (message: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const room = max - value.length;

  async function pick(list: FileList | null) {
    const files = [...(list ?? [])];
    if (!files.length) return;
    if (files.length > room) {
      onError(limitMessage);
      return;
    }
    setUploading(true);
    onUploading(true);
    onError(null);
    try {
      onChange([...value, ...(await uploadAssetPhotos(files))]);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "No se pudo subir la foto");
    } finally {
      setUploading(false);
      onUploading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((photoId, index) => (
        <div key={photoId} className="relative">
          <img
            src={attachmentUrl(photoId)}
            alt={index === 0 ? "Portada" : `Foto ${index + 1}`}
            className="h-14 w-14 rounded-lg border border-[var(--content-border)] object-cover"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((other) => other !== photoId))}
            aria-label={`Quitar foto ${index + 1}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--content-border)] bg-[var(--content-surface)] text-[var(--content-ink-dim)] hover:text-red"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </div>
      ))}
      {room > 0 && (
        <label
          htmlFor={id}
          className="flex h-14 w-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-[var(--content-border)] text-[10px] text-[var(--content-ink-dim)] hover:border-accent hover:text-[var(--content-ink)] has-[:focus-visible]:border-accent"
        >
          <PlusIcon className="h-4 w-4" aria-hidden="true" />
          {uploading ? "Subiendo…" : "Agregar"}
          <input
            id={id}
            type="file"
            multiple
            accept={PHOTO_ACCEPT}
            disabled={uploading}
            onChange={(e) => {
              void pick(e.target.files);
              e.target.value = "";
            }}
            className="sr-only"
          />
        </label>
      )}
    </div>
  );
}
