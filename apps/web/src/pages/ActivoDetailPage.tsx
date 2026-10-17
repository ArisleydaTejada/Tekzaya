import {
  ASSET_EVENT_LABEL,
  ASSET_STATUS_LABEL,
  ASSET_TYPE_LABEL,
  formatAssetNumber,
  formatMoney,
  formatWorkOrderNumber,
  type AssetDetail,
  type AssetEventKind,
  type AssetEventView,
  type AssetStatus,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { assetKeys, getAsset, listAssetEvents, retireAsset } from "../api/assets";
import { attachmentUrl } from "../api/tickets";
import { AssetFormModal } from "../components/AssetFormModal";
import { AssetStatusBadge, WarrantyBadge } from "../components/assets";
import { Avatar } from "../components/Avatar";
import { AreaTag } from "../components/badges";
import { AlertIcon, ArrowRightIcon, PencilIcon, PlusIcon, WrenchIcon, XIcon } from "../components/icons";
import { Modal } from "../components/Modal";
import { Plate } from "../components/Plate";
import { formatDateTime, formatDay, formatWhen, warrantyCountdown } from "../lib/format";

/**
 * Ficha del activo (plan A1): datos, foto, garantía, persona a cargo y, para el
 * área que lo mantiene, la línea de tiempo. El empleado ve su equipo y su estado
 * —para poder reportar una falla—, no su historia ni lo que costó.
 */
export default function ActivoDetailPage() {
  const { number = "" } = useParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(false);

  const { data: asset, isLoading, isError, error } = useQuery({
    queryKey: assetKeys.detail(number),
    queryFn: () => getAsset(number),
    retry: false,
  });

  async function refresh(saved?: AssetDetail) {
    if (saved) queryClient.setQueryData(assetKeys.detail(number), saved);
    await queryClient.invalidateQueries({ queryKey: assetKeys.all });
  }

  if (isLoading) {
    return (
      <Plate className="flex items-center justify-center py-16">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent" aria-label="Cargando activo" />
      </Plate>
    );
  }
  if (isError || !asset) {
    return (
      <Plate className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-[var(--content-ink-dim)]">
          {error instanceof Error ? error.message : "Ese activo no existe."}
        </p>
        <Link to="/activos" className="text-sm font-medium text-accent-ink hover:underline">
          Volver al inventario
        </Link>
      </Plate>
    );
  }

  return (
    <div>
      <Link to="/activos" className="mb-3 inline-block text-xs font-medium text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]">
        ← Activos
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xs tabular text-[var(--content-ink-dim)]">{formatAssetNumber(asset.number)}</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--content-ink)]">{asset.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AssetStatusBadge status={asset.status} />
            <span className="text-sm text-[var(--content-ink-dim)]">
              {ASSET_TYPE_LABEL[asset.type]}
              {(asset.brand || asset.model) && ` · ${[asset.brand, asset.model].filter(Boolean).join(" ")}`}
            </span>
          </div>
        </div>
        {asset.permissions.manage && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
            >
              <PencilIcon className="h-3.5 w-3.5" /> Editar o mover
            </button>
            <button
              onClick={() => setRetiring(true)}
              className="flex items-center gap-1.5 rounded-lg border border-red/40 px-3 py-2 text-xs font-medium text-red hover:bg-red/10"
            >
              <XIcon className="h-3.5 w-3.5" /> Dar de baja
            </button>
          </div>
        )}
      </div>

      {asset.status === "retired" && (
        <div className="mb-4 rounded-xl border border-[var(--content-border)] bg-[var(--content-bg)] px-4 py-3 text-sm text-[var(--content-ink-dim)]">
          <strong className="text-[var(--content-ink)]">Dado de baja</strong>
          {asset.retiredAt && ` el ${formatDateTime(asset.retiredAt)}`}
          {asset.retiredReason && `: ${asset.retiredReason}`}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Plate className="overflow-hidden">
            {asset.photoId ? (
              <img src={attachmentUrl(asset.photoId)} alt={`Foto de ${asset.name}`} className="h-56 w-full object-cover" />
            ) : (
              <div className="flex h-40 flex-col items-center justify-center gap-2 bg-[var(--content-bg)] text-[var(--content-ink-dim)]">
                <WrenchIcon className="h-6 w-6" />
                <span className="text-xs">Sin foto</span>
              </div>
            )}
          </Plate>

          <WarrantyCard asset={asset} />

          <Plate className="p-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-[var(--content-ink)]">Datos del equipo</h2>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <Item label="Ubicación">{asset.location}</Item>
              <Item label="Persona a cargo">
                {asset.custodian ? (
                  <span className="flex items-center gap-2">
                    <Avatar name={asset.custodian.name} src={asset.custodian.avatarUrl} size="sm" />
                    {asset.custodian.name}
                  </span>
                ) : (
                  "Nadie en concreto"
                )}
              </Item>
              <Item label="Área responsable">
                <AreaTag area={asset.area} />
              </Item>
              <Item label="Área que lo usa">{asset.usedByArea ? <AreaTag area={asset.usedByArea} /> : "La misma"}</Item>
              <Item label="Número de serie">{asset.serial ?? "—"}</Item>
              <Item label="Fecha de compra">{asset.purchaseDate ? formatDay(asset.purchaseDate) : "—"}</Item>
              {asset.permissions.viewDetails && (
                <Item label="Costo de compra">
                  {asset.purchaseCost != null ? formatMoney(asset.purchaseCost, asset.currency) : "—"}
                </Item>
              )}
              {asset.openWorkOrders !== undefined && (
                <Item label="Órdenes de trabajo abiertas">{asset.openWorkOrders}</Item>
              )}
            </dl>
          </Plate>
        </div>

        <div>
          {asset.permissions.viewDetails ? (
            <Timeline assetId={asset.id} />
          ) : (
            <Plate className="p-5">
              <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">¿Le pasa algo a este equipo?</h2>
              <p className="mt-1 text-sm text-[var(--content-ink-dim)]">
                Repórtalo con un ticket a {asset.area.name}: es el área que lo mantiene.
              </p>
              <Link
                to="/tickets/nuevo"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Reportar una falla
              </Link>
            </Plate>
          )}
        </div>
      </div>

      <AssetFormModal
        open={editing}
        asset={asset}
        currency={asset.currency}
        onClose={() => setEditing(false)}
        onSaved={async (saved) => {
          setEditing(false);
          await refresh(saved);
        }}
      />
      <RetireModal
        open={retiring}
        asset={asset}
        onClose={() => setRetiring(false)}
        onDone={async (saved) => {
          setRetiring(false);
          await refresh(saved);
        }}
      />
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--content-ink-dim)]">{label}</dt>
      <dd className="mt-0.5 text-[var(--content-ink)]">{children}</dd>
    </div>
  );
}

/** La garantía destaca solo cuando importa: por vencer avisa en ámbar. */
function WarrantyCard({ asset }: { asset: AssetDetail }) {
  if (asset.warranty === "expiring" && asset.warrantyUntil) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
        <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
        <div className="text-sm">
          <p className="font-semibold text-amber">La garantía {warrantyCountdown(asset.warrantyUntil).toLowerCase()}</p>
          <p className="text-[var(--content-ink-dim)]">
            Cubre hasta el {formatDay(asset.warrantyUntil)}. Si el equipo da problemas, conviene reclamarla antes.
          </p>
        </div>
      </div>
    );
  }
  return (
    <Plate className="px-4 py-3">
      <WarrantyBadge state={asset.warranty} until={asset.warrantyUntil} />
    </Plate>
  );
}

// ── Línea de tiempo ───────────────────────────────────────────

const EVENT_DOT: Record<AssetEventKind, string> = {
  created: "bg-accent",
  status_changed: "bg-[var(--content-ink-dim)]",
  failure: "bg-red",
  repair: "bg-green",
  preventive: "bg-green",
  moved: "bg-accent",
  custodian_changed: "bg-accent",
  retired: "bg-[var(--content-ink-dim)]",
};

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
const statusLabel = (value: unknown) =>
  typeof value === "string" && value in ASSET_STATUS_LABEL ? ASSET_STATUS_LABEL[value as AssetStatus] : String(value);

/** Lo que pasó, en una frase. Los nombres ya vienen resueltos del servidor. */
function describe(event: AssetEventView): ReactNode {
  const d = event.data;
  switch (event.kind) {
    case "created":
      return "Alta en el inventario";
    case "moved": {
      const parts: ReactNode[] = [];
      if (text(d["to"])) {
        parts.push(
          <span key="place" className="inline-flex flex-wrap items-center gap-1">
            {text(d["from"]) ?? "—"} <ArrowRightIcon className="h-3 w-3" aria-label="a" /> {text(d["to"])}
          </span>,
        );
      }
      if ("toUsedByAreaName" in d) parts.push(<span key="used">Ahora lo usa {text(d["toUsedByAreaName"]) ?? "su área responsable"}</span>);
      if ("toAreaName" in d) parts.push(<span key="area">Pasa a mantenerlo {text(d["toAreaName"]) ?? "otra área"}</span>);
      return <span className="flex flex-col gap-0.5">{parts}</span>;
    }
    case "custodian_changed":
      return text(d["toName"]) ? `A cargo de ${text(d["toName"])}` : `${text(d["fromName"]) ?? "Su responsable"} deja de tenerlo a cargo`;
    case "status_changed":
      return `${statusLabel(d["from"])} → ${statusLabel(d["to"])}`;
    case "failure":
      return text(d["title"]) ? `Falla: ${text(d["title"])}` : "Falla";
    case "repair":
      return text(d["notes"]) ?? "Reparación completada";
    case "preventive":
      return text(d["plan"]) ?? "Mantenimiento preventivo";
    case "retired":
      return text(d["reason"]) ? `Motivo: ${text(d["reason"])}` : "Baja del inventario";
  }
}

function Timeline({ assetId }: { assetId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: assetKeys.events(assetId),
    queryFn: () => listAssetEvents(assetId),
  });
  // Cada avería deja cuatro pasos: falla, fuera de servicio, reparación y vuelta
  // a operativo. Los cambios de estado de una OT se pliegan en su falla o su
  // reparación ("dejó el equipo fuera de servicio"), y la historia se lee en la
  // mitad de líneas sin perder nada.
  const all = data?.items ?? [];
  const folded = new Set(
    all
      .filter((event) => event.kind === "failure" || event.kind === "repair")
      .map((event) => `${event.kind}:${event.workOrder?.id ?? ""}`),
  );
  const outOfService = new Set<string>();
  const backInService = new Set<string>();
  const events = all.filter((event) => {
    if (event.kind !== "status_changed" || !event.workOrder) return true;
    const to = event.data["to"];
    if (to === "in_repair" && folded.has(`failure:${event.workOrder.id}`)) {
      outOfService.add(event.workOrder.id);
      return false;
    }
    if (to === "operational" && folded.has(`repair:${event.workOrder.id}`)) {
      backInService.add(event.workOrder.id);
      return false;
    }
    return true;
  });

  return (
    <Plate className="p-4">
      <h2 className="mb-4 font-display text-sm font-semibold text-[var(--content-ink)]">Línea de tiempo</h2>
      {isLoading ? (
        <p className="text-sm text-[var(--content-ink-dim)]">Cargando historial…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-[var(--content-ink-dim)]">Sin movimientos todavía.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-[var(--content-border)] pl-5">
          {events.map((event) => (
            <li key={event.id} className="relative">
              <span
                className={`absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--content-surface)] ${EVENT_DOT[event.kind]}`}
                aria-hidden="true"
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-[var(--content-ink)]">
                  {ASSET_EVENT_LABEL[event.kind]}
                  {event.workOrder && (
                    <span className="ml-1.5 font-display text-xs font-normal tabular text-[var(--content-ink-dim)]">
                      {formatWorkOrderNumber(event.workOrder.number)}
                    </span>
                  )}
                </p>
                <time dateTime={event.at} title={formatDateTime(event.at)} className="text-xs text-[var(--content-ink-dim)]">
                  {formatWhen(event.at)}
                </time>
              </div>
              <div className="mt-0.5 text-sm text-[var(--content-ink-dim)]">{describe(event)}</div>
              {event.kind === "failure" && event.workOrder && outOfService.has(event.workOrder.id) && (
                <p className="mt-0.5 text-xs font-medium text-amber">Quedó fuera de servicio</p>
              )}
              {event.kind === "repair" && event.workOrder && backInService.has(event.workOrder.id) && (
                <p className="mt-0.5 text-xs font-medium text-green">Vuelve a estar operativo</p>
              )}
              {event.actor && <p className="mt-0.5 text-xs text-[var(--content-ink-dim)]">por {event.actor.name}</p>}
            </li>
          ))}
        </ol>
      )}
    </Plate>
  );
}

// ── Baja ──────────────────────────────────────────────────────

function RetireModal({
  open,
  asset,
  onClose,
  onDone,
}: {
  open: boolean;
  asset: AssetDetail;
  onClose: () => void;
  onDone: (asset: AssetDetail) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setReason("");
      setError(null);
    }
  }

  const retire = useMutation({
    mutationFn: () => retireAsset(asset.id, { reason: reason.trim() }),
    onSuccess: onDone,
    onError: (cause) => setError(cause.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Dar de baja ${formatAssetNumber(asset.number)}`}
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
            Cancelar
          </button>
          <button
            onClick={() => retire.mutate()}
            disabled={reason.trim().length < 3 || retire.isPending}
            className="rounded-lg bg-red px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Dar de baja
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">
        El equipo sigue en el inventario con su historial, pero ya no se edita ni recibe mantenimiento: sus planes
        preventivos se pausan.
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Motivo</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          placeholder="Reparación más cara que un equipo nuevo, fin de vida útil…"
          className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
        />
      </label>
    </Modal>
  );
}
