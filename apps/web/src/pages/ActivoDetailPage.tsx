import {
  ASSET_EVENT_LABEL,
  ASSET_STATUS_LABEL,
  ASSET_TYPE_LABEL,
  formatAssetNumber,
  formatMoney,
  formatSparePartNumber,
  formatTicketNumber,
  formatWorkOrderNumber,
  describeEvery,
  type AssetDetail,
  type AssetEventKind,
  type AssetEventView,
  type AssetStatus,
  type WorkOrderDetail,
  type WorkOrderStatus,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { assetKeys, getAsset, listAssetEvents, retireAsset } from "../api/assets";
import { listPlans, planKeys } from "../api/plans";
import { listSpareParts, sparePartKeys } from "../api/spareParts";
import { attachmentUrl } from "../api/tickets";
import { getWorkOrder, listWorkOrders, updateWorkOrder, workOrderKeys } from "../api/workOrders";
import { AssetFormModal } from "../components/AssetFormModal";
import { AssetStatusBadge, WarrantyBadge } from "../components/assets";
import { Avatar, AvatarStack } from "../components/Avatar";
import { AreaTag } from "../components/badges";
import { AlertIcon, ArrowRightIcon, PencilIcon, PlusIcon, WrenchIcon, XIcon } from "../components/icons";
import { Modal } from "../components/Modal";
import { ReplacementAdviceCard } from "../components/maintenanceAi";
import { NewWorkOrderModal } from "../components/NewWorkOrderModal";
import { Plate } from "../components/Plate";
import { PlanFormModal } from "../components/plans";
import { RequiredPartStatus, WorkOrderStatusBadge, WorkOrderTypeTag } from "../components/workOrders";
import { formatDateTime, formatDay, formatQuantity, formatWhen, warrantyCountdown } from "../lib/format";

const VIEWS = ["resumen", "historial", "ordenes"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, string> = {
  resumen: "Resumen",
  historial: "Historial",
  ordenes: "Órdenes de trabajo",
};

const OPEN_STATUSES: WorkOrderStatus[] = ["pending", "assigned", "in_progress", "on_hold"];

/**
 * Ficha del activo (plan A1): una cabecera con quién es el equipo, dónde está y
 * cómo está, y debajo un resumen para el área que lo mantiene —estado, fallas que
 * se repiten, la orden en curso y lo último que se le hizo—. El empleado ve su
 * equipo y su estado —para poder reportar una falla—, no su historia ni lo que costó.
 */
export default function ActivoDetailPage() {
  const { number = "" } = useParams();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const requested = params.get("vista");
  const view: View = VIEWS.includes(requested as View) ? (requested as View) : "resumen";
  const show = (next: View) =>
    setParams(
      (current) => {
        const copy = new URLSearchParams(current);
        if (next === "resumen") copy.delete("vista");
        else copy.set("vista", next);
        return copy;
      },
      { replace: true },
    );

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link to="/activos" className="text-xs font-medium text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]">
          ← Activos
        </Link>
        {(asset.permissions.manage || asset.permissions.createWorkOrder) && (
          <div className="flex flex-wrap gap-2">
            {asset.permissions.createWorkOrder && (
              <button
                onClick={() => setOrdering(true)}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Nueva orden de trabajo
              </button>
            )}
            {asset.permissions.manage && (
              <>
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
              </>
            )}
          </div>
        )}
      </div>

      <AssetHeader asset={asset} />

      {asset.status === "retired" && (
        <div className="mt-4 rounded-xl border border-[var(--content-border)] bg-[var(--content-bg)] px-4 py-3 text-sm text-[var(--content-ink-dim)]">
          <strong className="text-[var(--content-ink)]">Dado de baja</strong>
          {asset.retiredAt && ` el ${formatDateTime(asset.retiredAt)}`}
          {asset.retiredReason && `: ${asset.retiredReason}`}
        </div>
      )}
      <WarrantyAlert asset={asset} />

      {asset.permissions.viewDetails ? (
        <>
          <div className="mb-4 mt-5 flex flex-wrap gap-1 border-b border-[var(--content-border)]" role="tablist" aria-label="Secciones del activo">
            {VIEWS.map((option) => (
              <button
                key={option}
                role="tab"
                id={`tab-${option}`}
                aria-selected={view === option}
                aria-controls={`panel-${option}`}
                onClick={() => show(option)}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                  view === option
                    ? "border-accent text-[var(--content-ink)]"
                    : "border-transparent text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                }`}
              >
                {VIEW_LABEL[option]}
                {option === "ordenes" && !!asset.openWorkOrders && (
                  <span className="rounded-full bg-accent/15 px-1.5 text-[10px] font-semibold tabular text-accent-ink">
                    {asset.openWorkOrders}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`}>
            {view === "resumen" && (
              <Overview
                asset={asset}
                onShow={show}
                onNewOrder={asset.permissions.createWorkOrder ? () => setOrdering(true) : undefined}
                onEdit={asset.permissions.manage && asset.status !== "retired" ? () => setEditing(true) : undefined}
              />
            )}
            {view === "historial" && <Timeline assetId={asset.id} />}
            {view === "ordenes" && <AssetWorkOrders assetId={asset.id} />}
          </div>
        </>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <EquipmentData asset={asset} />
          <Plate className="self-start p-5">
            <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">¿Le pasa algo a este equipo?</h2>
            <p className="mt-1 text-sm text-[var(--content-ink-dim)]">
              Repórtalo con un ticket a {asset.area.name}: es el área que lo mantiene.
            </p>
            <Link
              to={`/tickets/nuevo?activo=${formatAssetNumber(asset.number)}`}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Reportar una falla
            </Link>
          </Plate>
        </div>
      )}

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
      <NewWorkOrderModal
        open={ordering}
        asset={asset}
        onClose={() => setOrdering(false)}
        onCreated={async (order) => {
          setOrdering(false);
          await refresh();
          navigate(`/ordenes/${formatWorkOrderNumber(order.number)}`);
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

// ── Cabecera ──────────────────────────────────────────────────

/** Quién es, dónde está y cómo está: lo que se busca al abrir la ficha, de un vistazo. */
function AssetHeader({ asset }: { asset: AssetDetail }) {
  return (
    <Plate className="grid gap-4 p-4 md:grid-cols-[auto_minmax(0,1fr)] xl:grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
      {asset.photoId ? (
        <img
          src={attachmentUrl(asset.photoId)}
          alt={`Foto de ${asset.name}`}
          className="h-28 w-full rounded-xl object-cover md:w-40"
        />
      ) : (
        <div className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-[var(--content-bg)] text-[var(--content-ink-dim)] md:w-40">
          <WrenchIcon className="h-6 w-6" />
          <span className="text-xs">Sin foto</span>
        </div>
      )}

      <div className="min-w-0 self-center">
        <p className="text-xs text-[var(--content-ink-dim)]">
          {ASSET_TYPE_LABEL[asset.type]} · <span className="font-display tabular">{formatAssetNumber(asset.number)}</span>
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--content-ink)]">{asset.name}</h1>
        {asset.serial && (
          <p className="mt-0.5 font-display text-sm tabular tracking-wide text-[var(--content-ink)]">N/S {asset.serial}</p>
        )}
        {(asset.brand || asset.model) && (
          <p className="mt-0.5 text-sm text-[var(--content-ink-dim)]">{[asset.brand, asset.model].filter(Boolean).join(" · ")}</p>
        )}
      </div>

      <dl className="grid content-center gap-2 text-sm md:col-span-2 xl:col-span-1 xl:border-l xl:border-[var(--content-border)] xl:pl-4">
        <HeaderRow label="Ubicación">{asset.location}</HeaderRow>
        <HeaderRow label="Mantiene">
          <AreaTag area={asset.area} />
        </HeaderRow>
        <HeaderRow label="Lo usa">
          <AreaTag area={asset.usedByArea ?? asset.area} />
        </HeaderRow>
        <HeaderRow label="Compra">{asset.purchaseDate ? formatDay(asset.purchaseDate) : "—"}</HeaderRow>
      </dl>

      <dl className="grid content-center gap-2 text-sm md:col-span-2 xl:col-span-1 xl:border-l xl:border-[var(--content-border)] xl:pl-4">
        <HeaderRow label="Estado">
          <AssetStatusBadge status={asset.status} />
        </HeaderRow>
        <HeaderRow label="Garantía">
          <WarrantyBadge state={asset.warranty} until={asset.warrantyUntil} />
        </HeaderRow>
        <HeaderRow label="A cargo">
          {asset.custodian ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar name={asset.custodian.name} src={asset.custodian.avatarUrl} size="sm" />
              <span className="truncate">{asset.custodian.name}</span>
            </span>
          ) : (
            "Nadie en concreto"
          )}
        </HeaderRow>
      </dl>
    </Plate>
  );
}

function HeaderRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2">
      <dt className="text-xs text-[var(--content-ink-dim)]">{label}</dt>
      <dd className="min-w-0 text-[var(--content-ink)]">{children}</dd>
    </div>
  );
}

/** La garantía destaca solo cuando importa: por vencer avisa en ámbar. */
function WarrantyAlert({ asset }: { asset: AssetDetail }) {
  if (asset.warranty !== "expiring" || !asset.warrantyUntil || asset.status === "retired") return null;
  return (
    <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-amber/40 bg-amber/10 px-4 py-3">
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

// ── Resumen ───────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** Fallas de los últimos `days` días, de la más reciente a la más antigua. */
function failuresWithin(events: readonly AssetEventView[], days: number): AssetEventView[] {
  const since = Date.now() - days * DAY_MS;
  return events.filter((event) => event.kind === "failure" && Date.parse(event.at) > since);
}

/** El estado al que lleva un paso de la historia, si lo cambia. */
function statusAfter(event: AssetEventView): AssetStatus | undefined {
  if (event.kind === "created") return "operational";
  if (event.kind === "retired") return "retired";
  if (event.kind === "status_changed" && typeof event.data["to"] === "string") return event.data["to"] as AssetStatus;
  return undefined;
}

/**
 * Qué parte de los últimos `days` días estuvo el equipo fuera de reparación, en
 * tiempo de calendario (los reportes miden la parada en horas laborables: esto es
 * la foto rápida de la ficha). `null` si el equipo es demasiado nuevo para decir algo.
 */
function availability(events: readonly AssetEventView[], createdAt: string, days: number): number | null {
  const now = Date.now();
  const start = Math.max(now - days * DAY_MS, Date.parse(createdAt));
  if (now - start < 60 * 60_000) return null;
  let status: AssetStatus = "operational";
  let since = start;
  let down = 0;
  // La historia llega del más reciente al más antiguo.
  for (const event of [...events].reverse()) {
    const next = statusAfter(event);
    if (!next) continue;
    const at = Date.parse(event.at);
    if (at > since) {
      if (status === "in_repair") down += at - since;
      since = at;
    }
    status = next;
  }
  if (status === "in_repair") down += now - since;
  return 1 - down / (now - start);
}

const STATUS_DOT: Record<AssetStatus, string> = {
  operational: "bg-green",
  in_repair: "bg-amber",
  retired: "bg-[var(--content-ink-dim)]",
};

function Overview({
  asset,
  onShow,
  onNewOrder,
  onEdit,
}: {
  asset: AssetDetail;
  onShow: (view: View) => void;
  onNewOrder: (() => void) | undefined;
  onEdit: (() => void) | undefined;
}) {
  const { data, isLoading } = useQuery({
    queryKey: assetKeys.events(asset.id),
    queryFn: () => listAssetEvents(asset.id),
  });
  const events = data?.items ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <div className="space-y-4">
        <CurrentState asset={asset} events={events} loading={isLoading} />
        <EquipmentData asset={asset} onEdit={onEdit} />
      </div>
      <div className="space-y-4">
        <RecurringFailure events={events} onShow={() => onShow("historial")} />
        <ReplacementAdviceCard assetId={asset.id} />
        <RecentActivity events={events} loading={isLoading} onShow={() => onShow("historial")} />
        <ServiceHistory events={events} loading={isLoading} onShow={() => onShow("historial")} />
      </div>
      <div className="space-y-4 lg:col-span-2 xl:col-span-1">
        <ActiveWorkOrder asset={asset} onShowAll={() => onShow("ordenes")} onNewOrder={onNewOrder} />
        <AssetParts asset={asset} />
        <TechnicianNotes events={events} />
        <AssetPlans asset={asset} />
      </div>
    </div>
  );
}

function CardTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">{title}</h2>
      {action}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="text-xs font-medium text-accent-ink hover:underline">
      {children}
    </button>
  );
}

function CurrentState({ asset, events, loading }: { asset: AssetDetail; events: readonly AssetEventView[]; loading: boolean }) {
  const lastChange = events.find((event) => statusAfter(event) === asset.status);
  const lastFailure = events.find((event) => event.kind === "failure");
  const share = asset.status === "retired" ? null : availability(events, asset.createdAt, 30);
  const failures90 = failuresWithin(events, 90).length;

  return (
    <Plate className="p-4 text-sm">
      <CardTitle title="Estado actual" />
      <div className="flex items-start gap-2.5">
        <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${STATUS_DOT[asset.status]}`} aria-hidden="true" />
        <div>
          <p className="font-semibold text-[var(--content-ink)]">{ASSET_STATUS_LABEL[asset.status]}</p>
          {lastChange && (
            <p className="text-xs text-[var(--content-ink-dim)]">
              Desde <time dateTime={lastChange.at}>{formatDateTime(lastChange.at)}</time>
            </p>
          )}
        </div>
      </div>
      <dl className="mt-3 divide-y divide-[var(--content-border)] border-t border-[var(--content-border)]">
        <StatRow
          label="Disponibilidad (30 días)"
          hint="Parte del último mes en que el equipo no estuvo en reparación, en tiempo de calendario."
        >
          {loading ? "…" : share === null ? "—" : `${(Math.floor(share * 1000) / 10).toLocaleString("es-MX")} %`}
        </StatRow>
        <StatRow label="Fallas (90 días)">{loading ? "…" : failures90}</StatRow>
        <StatRow label="Última falla">
          {loading ? "…" : lastFailure ? <time dateTime={lastFailure.at} title={formatDateTime(lastFailure.at)}>{formatWhen(lastFailure.at)}</time> : "Ninguna"}
        </StatRow>
      </dl>
    </Plate>
  );
}

function StatRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-xs text-[var(--content-ink-dim)]" title={hint}>
        {label}
      </dt>
      <dd className="font-display font-semibold tabular text-[var(--content-ink)]">{children}</dd>
    </div>
  );
}

function EquipmentData({ asset, onEdit }: { asset: AssetDetail; onEdit?: (() => void) | undefined }) {
  return (
    <Plate className="p-4">
      <CardTitle title="Datos del equipo" action={onEdit && <LinkButton onClick={onEdit}>Editar</LinkButton>} />
      <dl className="divide-y divide-[var(--content-border)] text-sm">
        <Item label="Tipo">{ASSET_TYPE_LABEL[asset.type]}</Item>
        <Item label="Marca">{asset.brand ?? "—"}</Item>
        <Item label="Modelo">{asset.model ?? "—"}</Item>
        <Item label="Número de serie">{asset.serial ?? "—"}</Item>
        <Item label="Ubicación">{asset.location}</Item>
        <Item label="Persona a cargo">{asset.custodian?.name ?? "Nadie en concreto"}</Item>
        <Item label="Área responsable">{asset.area.name}</Item>
        <Item label="Área que lo usa">{(asset.usedByArea ?? asset.area).name}</Item>
        <Item label="Fecha de compra">{asset.purchaseDate ? formatDay(asset.purchaseDate) : "—"}</Item>
        {asset.permissions.viewDetails && (
          <Item label="Costo de compra">
            {asset.purchaseCost != null ? formatMoney(asset.purchaseCost, asset.currency) : "—"}
          </Item>
        )}
        <Item label="Garantía">
          <WarrantyBadge state={asset.warranty} until={asset.warrantyUntil} />
        </Item>
      </dl>
    </Plate>
  );
}

/**
 * Dos o más fallas en 30 días: algo no quedó bien arreglado. Si además se repite
 * el mismo título, lo dice —suele ser la pista para cambiar de enfoque—.
 */
function RecurringFailure({ events, onShow }: { events: readonly AssetEventView[]; onShow: () => void }) {
  const recent = failuresWithin(events, 30);
  if (recent.length < 2) return null;
  const titles = recent.map((event) => text(event.data["title"])?.toLowerCase()).filter(Boolean);
  const repeated = titles.find((title, index) => titles.indexOf(title) !== index);
  const lastService = events.find((event) => event.kind === "repair" || event.kind === "preventive");
  const latestTitle = text(recent[0]?.data["title"]);

  return (
    <button
      onClick={onShow}
      className="flex w-full items-start gap-3 rounded-2xl border border-amber/50 bg-amber/10 p-4 text-left hover:bg-amber/15"
    >
      <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-sm">
        <span className="block text-xs font-semibold uppercase tracking-wide text-amber">Falla recurrente</span>
        {latestTitle && <span className="mt-1 block font-semibold text-red">{latestTitle}</span>}
        <span className="block text-red">{recent.length} fallas en los últimos 30 días</span>
        <span className="mt-2 block text-xs text-[var(--content-ink)]">
          {lastService
            ? `Última intervención: ${formatWhen(lastService.at)}.`
            : "Sin reparaciones registradas todavía."}
          {repeated && " Se repite la misma falla."}
        </span>
      </span>
      <ArrowRightIcon className="mt-1 h-4 w-4 shrink-0 text-amber" aria-hidden="true" />
    </button>
  );
}

/** Lo último que pasó, en una línea por paso; la historia completa está en su pestaña. */
function RecentActivity({
  events,
  loading,
  onShow,
}: {
  events: readonly AssetEventView[];
  loading: boolean;
  onShow: () => void;
}) {
  const shown = events.slice(0, 5);
  return (
    <Plate className="p-4">
      <CardTitle title="Actividad reciente" action={events.length > 0 && <LinkButton onClick={onShow}>Ver todo</LinkButton>} />
      {loading ? (
        <p className="text-sm text-[var(--content-ink-dim)]">Cargando historial…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-[var(--content-ink-dim)]">Sin movimientos todavía.</p>
      ) : (
        <ul className="divide-y divide-[var(--content-border)] text-sm">
          {shown.map((event) => (
            <li key={event.id} className="grid grid-cols-[5.5rem_auto_minmax(0,1fr)] items-baseline gap-2 py-2">
              <time dateTime={event.at} title={formatDateTime(event.at)} className="text-xs text-[var(--content-ink-dim)]">
                {formatWhen(event.at)}
              </time>
              <span className={`h-2 w-2 translate-y-[-1px] rounded-full ${EVENT_DOT[event.kind]}`} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[var(--content-ink)]">{ASSET_EVENT_LABEL[event.kind]}</span>
                <span className="block truncate text-xs text-[var(--content-ink-dim)]">{describe(event)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Plate>
  );
}

/** Lo que se le hizo al equipo: reparaciones y preventivos, con quién y en qué orden. */
function ServiceHistory({
  events,
  loading,
  onShow,
}: {
  events: readonly AssetEventView[];
  loading: boolean;
  onShow: () => void;
}) {
  const service = events.filter((event) => event.kind === "repair" || event.kind === "preventive");
  const shown = service.slice(0, 4);
  return (
    <Plate className="p-4">
      <CardTitle title="Historial de servicio" action={service.length > shown.length && <LinkButton onClick={onShow}>Ver todo</LinkButton>} />
      {loading ? (
        <p className="text-sm text-[var(--content-ink-dim)]">Cargando…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-[var(--content-ink-dim)]">Todavía no se le ha hecho ningún servicio.</p>
      ) : (
        <ul className="divide-y divide-[var(--content-border)] text-sm">
          {shown.map((event) => {
            const body = (
              <>
                <span className="text-xs text-[var(--content-ink-dim)]">
                  <time dateTime={event.at}>{formatWhen(event.at)}</time>
                  {event.actor && <span className="block truncate">{event.actor.name}</span>}
                </span>
                <span className="min-w-0">
                  <span className="block text-[var(--content-ink)]">{ASSET_EVENT_LABEL[event.kind]}</span>
                  <span className="line-clamp-2 text-xs text-[var(--content-ink-dim)]">{describe(event)}</span>
                </span>
                {event.workOrder && <ArrowRightIcon className="h-3.5 w-3.5 text-[var(--content-ink-dim)]" aria-hidden="true" />}
              </>
            );
            const layout = "grid grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-2 py-2";
            return (
              <li key={event.id}>
                {event.workOrder ? (
                  <Link
                    to={`/ordenes/${formatWorkOrderNumber(event.workOrder.number)}`}
                    aria-label={`${ASSET_EVENT_LABEL[event.kind]} · ${formatWorkOrderNumber(event.workOrder.number)}`}
                    className={`${layout} -mx-2 rounded-lg px-2 hover:bg-[var(--content-bg)]`}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={layout}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Plate>
  );
}

/** Las notas de cierre de las últimas reparaciones: el relevo entre técnicos. */
function TechnicianNotes({ events }: { events: readonly AssetEventView[] }) {
  const notes = events.filter((event) => event.kind === "repair" && text(event.data["notes"])).slice(0, 2);
  if (notes.length === 0) return null;
  return (
    <Plate className="p-4">
      <CardTitle title="Notas del técnico" />
      <ul className="space-y-2">
        {notes.map((event) => (
          <li key={event.id} className="rounded-lg bg-[var(--content-bg)] px-3 py-2.5 text-sm">
            <p className="whitespace-pre-line text-[var(--content-ink)]">“{text(event.data["notes"])}”</p>
            <p className="mt-1.5 text-xs text-[var(--content-ink-dim)]">
              {event.actor ? `— ${event.actor.name} · ` : ""}
              <time dateTime={event.at}>{formatDateTime(event.at)}</time>
              {event.workOrder && (
                <>
                  {" · "}
                  <Link
                    to={`/ordenes/${formatWorkOrderNumber(event.workOrder.number)}`}
                    className="font-display tabular text-accent-ink hover:underline"
                  >
                    {formatWorkOrderNumber(event.workOrder.number)}
                  </Link>
                </>
              )}
            </p>
          </li>
        ))}
      </ul>
    </Plate>
  );
}

// ── Orden activa ──────────────────────────────────────────────

/**
 * La orden abierta más reciente, con su lista de verificación a mano: quien la
 * trabaja puede ir marcando sin salir de la ficha.
 */
function ActiveWorkOrder({
  asset,
  onShowAll,
  onNewOrder,
}: {
  asset: AssetDetail;
  onShowAll: () => void;
  onNewOrder: (() => void) | undefined;
}) {
  const query = { assetId: asset.id, status: OPEN_STATUSES, sort: "updatedAt", dir: "desc", limit: 5 } as const;
  const { data: list, isLoading } = useQuery({
    queryKey: workOrderKeys.list(query),
    queryFn: () => listWorkOrders({ ...query, status: [...OPEN_STATUSES] }),
  });
  const first = list?.items[0];
  const key = first ? formatWorkOrderNumber(first.number) : "";
  const { data: order } = useQuery({
    queryKey: workOrderKeys.detail(key),
    queryFn: () => getWorkOrder(key),
    enabled: !!first,
  });
  const others = (list?.total ?? 0) - 1;

  if (isLoading || (first && !order)) {
    return (
      <Plate className="p-4">
        <CardTitle title="Orden activa" />
        <p className="text-sm text-[var(--content-ink-dim)]">Cargando…</p>
      </Plate>
    );
  }
  if (!order) {
    return (
      <Plate className="p-4">
        <CardTitle title="Orden activa" />
        <p className="text-sm text-[var(--content-ink-dim)]">Ninguna orden abierta sobre este equipo.</p>
        {onNewOrder && asset.status !== "retired" && (
          <button
            onClick={onNewOrder}
            className="mt-3 flex items-center gap-1 rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
          >
            <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" /> Abrir una orden
          </button>
        )}
      </Plate>
    );
  }
  return (
    <>
      <ActiveWorkOrderCard key={order.id} order={order} others={others} onShowAll={onShowAll} />
      <RequiredParts order={order} />
    </>
  );
}

/**
 * Las piezas que la orden activa va a necesitar y si el almacén las cubre: se
 * sabe antes de ir al equipo si hay que esperar un repuesto.
 */
function RequiredParts({ order }: { order: WorkOrderDetail }) {
  const path = `/ordenes/${formatWorkOrderNumber(order.number)}`;
  if (order.requiredParts.length === 0) return null;
  return (
    <Plate className="p-4 text-sm">
      <CardTitle
        title="Repuestos requeridos"
        action={
          <Link to="/repuestos" className="text-xs font-medium text-accent-ink hover:underline">
            Ver almacén
          </Link>
        }
      />
      <ul className="divide-y divide-[var(--content-border)]">
          {order.requiredParts.map((item) => (
            <li key={item.id}>
              <Link
                to={`/repuestos/${formatSparePartNumber(item.part.number)}`}
                className="-mx-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[var(--content-ink)]">{item.part.name}</span>
                  <span className="block font-display text-xs tabular text-[var(--content-ink-dim)]">
                    {formatSparePartNumber(item.part.number)} · ×{item.qty}
                  </span>
                </span>
                <RequiredPartStatus item={item} />
                <ArrowRightIcon className="h-3.5 w-3.5 text-[var(--content-ink-dim)]" aria-hidden="true" />
              </Link>
            </li>
          ))}
      </ul>
      <p className="mt-2 text-xs text-[var(--content-ink-dim)]">
        Previstos en{" "}
        <Link to={path} className="font-display tabular text-accent-ink hover:underline">
          {formatWorkOrderNumber(order.number)}
        </Link>
      </p>
    </Plate>
  );
}

/**
 * Las piezas del almacén vinculadas a este equipo, con lo que queda de cada una:
 * antes de abrir una orden ya se sabe si habrá que esperar un repuesto.
 */
function AssetParts({ asset }: { asset: AssetDetail }) {
  const query = { assetId: asset.id, state: "active", sort: "name", limit: 50 } as const;
  const { data, isLoading, isError } = useQuery({
    queryKey: sparePartKeys.list(query),
    queryFn: () => listSpareParts(query),
  });
  if (isError) return null;
  const parts = data?.items ?? [];
  const canLink = (data?.manageableAreas ?? []).some((area) => area.id === asset.areaId);

  return (
    <Plate className="p-4 text-sm">
      <CardTitle
        title="Repuestos del equipo"
        action={
          <Link to="/repuestos" className="text-xs font-medium text-accent-ink hover:underline">
            Ver almacén
          </Link>
        }
      />
      {isLoading ? (
        <p className="text-xs text-[var(--content-ink-dim)]">Cargando…</p>
      ) : parts.length === 0 ? (
        <p className="text-xs text-[var(--content-ink-dim)]">
          Ningún repuesto vinculado a este equipo.
          {canLink && " Al dar de alta o editar un repuesto, elige en qué equipos se usa."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--content-border)]">
          {parts.map((part) => {
            const tone = part.stock === 0 ? "out" : part.low ? "low" : "ok";
            return (
              <li key={part.id}>
                <Link
                  to={`/repuestos/${formatSparePartNumber(part.number)}`}
                  className="-mx-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[var(--content-ink)]">{part.name}</span>
                    <span className="block font-display text-xs tabular text-[var(--content-ink-dim)]">
                      {formatSparePartNumber(part.number)}
                    </span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${
                      tone === "out" ? "text-red" : tone === "low" ? "text-amber" : "text-green"
                    }`}
                  >
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${tone === "out" ? "bg-red" : tone === "low" ? "bg-amber" : "bg-green"}`}
                      aria-hidden="true"
                    />
                    {tone === "out" ? "Sin existencias" : `${formatQuantity(part.stock, part.unit)}${tone === "low" ? " · bajo mínimo" : " en stock"}`}
                  </span>
                  <ArrowRightIcon className="h-3.5 w-3.5 text-[var(--content-ink-dim)]" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Plate>
  );
}


function ActiveWorkOrderCard({ order, others, onShowAll }: { order: WorkOrderDetail; others: number; onShowAll: () => void }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"checklist" | "details">(order.checklist.length ? "checklist" : "details");
  const [error, setError] = useState<string | null>(null);
  const toggle = useMutation({
    mutationFn: (checklist: boolean[]) => updateWorkOrder(order.id, { checklist }),
    onSuccess: async (saved) => {
      setError(null);
      queryClient.setQueryData(workOrderKeys.detail(formatWorkOrderNumber(saved.number)), saved);
      await queryClient.invalidateQueries({ queryKey: workOrderKeys.all });
    },
    onError: (cause) => setError(cause.message),
  });
  const done = order.checklist.filter((item) => item.done).length;
  const path = `/ordenes/${formatWorkOrderNumber(order.number)}`;

  return (
    <Plate className="p-4 text-sm">
      <CardTitle title="Orden activa" action={<WorkOrderStatusBadge status={order.status} holdReason={order.holdReason} />} />
      <p className="flex flex-wrap items-baseline gap-x-2">
        <Link to={path} className="font-display text-lg font-semibold tabular text-[var(--content-ink)] hover:text-accent-ink hover:underline">
          {formatWorkOrderNumber(order.number)}
        </Link>
        <span className="text-xs text-[var(--content-ink-dim)]">Abierta {formatWhen(order.createdAt)}</span>
      </p>
      <p className="text-[var(--content-ink-dim)]">{order.title}</p>

      <div className="mt-3 flex gap-1 border-b border-[var(--content-border)]" role="tablist" aria-label="Orden activa">
        {(["checklist", "details"] as const).map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={tab === option}
            onClick={() => setTab(option)}
            className={`-mb-px border-b-2 px-2 py-1.5 text-xs font-medium ${
              tab === option
                ? "border-accent text-[var(--content-ink)]"
                : "border-transparent text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            }`}
          >
            {option === "checklist" ? `Verificación (${done}/${order.checklist.length})` : "Detalles"}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="pt-3">
        {tab === "checklist" ? (
          order.checklist.length === 0 ? (
            <p className="text-xs text-[var(--content-ink-dim)]">Esta orden no tiene lista de verificación.</p>
          ) : (
            <ul className="space-y-1.5">
              {order.checklist.map((item, index) => (
                <li key={`${item.label}-${index}`}>
                  <label className="flex items-start gap-2 text-[var(--content-ink)]">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={!order.permissions.work || toggle.isPending}
                      onChange={(event) =>
                        toggle.mutate(order.checklist.map((other, at) => (at === index ? event.target.checked : other.done)))
                      }
                      className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className={item.done ? "text-[var(--content-ink-dim)] line-through" : ""}>{item.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          )
        ) : (
          <dl className="divide-y divide-[var(--content-border)]">
            <Item label="Tipo">
              <WorkOrderTypeTag type={order.type} />
            </Item>
            <Item label="Responsables">
              {order.assignees.length ? (
                <span className="flex items-center gap-2">
                  <AvatarStack users={order.assignees} />
                  <span className="truncate">{order.assignees.map((person) => person.name).join(", ")}</span>
                </span>
              ) : (
                "Sin asignar"
              )}
            </Item>
            {order.scheduledFor && <Item label="Programada">{formatDay(order.scheduledFor)}</Item>}
            <Item label="Equipo parado">{order.outOfService ? "Sí" : "No"}</Item>
            {order.ticket && (
              <Item label="Ticket">
                <Link to={`/tickets/${formatTicketNumber(order.ticket.number)}`} className="font-display tabular text-accent-ink hover:underline">
                  {formatTicketNumber(order.ticket.number)}
                </Link>
              </Item>
            )}
            <Item label="Repuestos cargados">
              {order.partsUsed.length
                ? order.partsUsed.map((usage) => `${usage.part.name} ×${usage.qty}`).join(", ")
                : "Ninguno todavía"}
            </Item>
          </dl>
        )}
        {error && (
          <p role="alert" className="mt-2 text-xs text-red">
            {error}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--content-border)] pt-3">
        <Link to={path} className="text-xs font-medium text-accent-ink hover:underline">
          Abrir la orden
        </Link>
        {others > 0 && (
          <LinkButton onClick={onShowAll}>
            {others === 1 ? "1 orden abierta más" : `${others} órdenes abiertas más`}
          </LinkButton>
        )}
      </div>
    </Plate>
  );
}

// ── Órdenes del equipo ────────────────────────────────────────

function AssetWorkOrders({ assetId }: { assetId: string }) {
  const query = { assetId, sort: "number", dir: "desc", limit: 100 } as const;
  const { data, isLoading } = useQuery({
    queryKey: workOrderKeys.list(query),
    queryFn: () => listWorkOrders(query),
  });
  const orders = data?.items ?? [];

  return (
    <Plate className="overflow-x-auto">
      {isLoading ? (
        <p className="p-4 text-sm text-[var(--content-ink-dim)]">Cargando órdenes…</p>
      ) : orders.length === 0 ? (
        <p className="p-4 text-sm text-[var(--content-ink-dim)]">Este equipo no tiene órdenes de trabajo.</p>
      ) : (
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
              <th className="px-3 py-2.5 font-medium">Número</th>
              <th className="px-3 py-2.5 font-medium">Orden</th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 font-medium">Responsables</th>
              <th className="px-3 py-2.5 font-medium">Abierta</th>
              <th className="px-3 py-2.5 text-right font-medium">Costo</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const path = `/ordenes/${formatWorkOrderNumber(order.number)}`;
              return (
                <tr key={order.id} className="border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)]">
                  <td className="whitespace-nowrap px-3 py-2.5 font-display tabular text-[var(--content-ink)]">
                    <Link to={path} className="hover:text-accent-ink hover:underline">
                      {formatWorkOrderNumber(order.number)}
                    </Link>
                  </td>
                  <td className="max-w-[280px] px-3 py-2.5">
                    <Link to={path} className="block truncate font-medium text-[var(--content-ink)] hover:text-accent-ink">
                      {order.title}
                    </Link>
                    <WorkOrderTypeTag type={order.type} />
                  </td>
                  <td className="px-3 py-2.5">
                    <WorkOrderStatusBadge status={order.status} holdReason={order.holdReason} />
                  </td>
                  <td className="px-3 py-2.5">
                    {order.assignees.length ? (
                      <AvatarStack users={order.assignees} />
                    ) : (
                      <span className="text-xs text-[var(--content-ink-dim)]">Sin asignar</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[var(--content-ink-dim)]">
                    <time dateTime={order.createdAt} title={formatDateTime(order.createdAt)}>
                      {formatWhen(order.createdAt)}
                    </time>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-display tabular text-[var(--content-ink)]">
                    {data && formatMoney(order.costTotal, data.currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Plate>
  );
}

/**
 * Los planes preventivos que cubren el equipo: el suyo propio y los de su tipo
 * en su área (plan A5). El supervisor crea uno desde aquí con el equipo ya elegido.
 */
function AssetPlans({ asset }: { asset: AssetDetail }) {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const query = { assetId: asset.id };
  const { data } = useQuery({ queryKey: planKeys.list(query), queryFn: () => listPlans(query) });
  const plans = data?.items ?? [];
  const canCreate = asset.status !== "retired" && (data?.manageableAreas ?? []).some((area) => area.id === asset.areaId);
  if (!plans.length && !canCreate) return null;

  return (
    <Plate className="p-4 text-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">Planes preventivos</h2>
        {canCreate && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
          >
            <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" /> Nuevo plan
          </button>
        )}
      </div>
      {plans.length === 0 ? (
        <p className="text-xs text-[var(--content-ink-dim)]">Ningún plan cubre este equipo.</p>
      ) : (
        <ul className="space-y-1.5">
          {plans.map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-baseline justify-between gap-2">
              <Link to="/preventivos" className="font-medium text-[var(--content-ink)] hover:text-accent-ink hover:underline">
                {plan.title}
              </Link>
              <span className="text-xs text-[var(--content-ink-dim)]">
                {describeEvery(plan.every, plan.unit)}
                {plan.assetType ? " · por tipo" : ""} · próxima {formatDay(plan.nextDueAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <PlanFormModal
        open={creating}
        plan={null}
        areas={data?.manageableAreas ?? []}
        defaultLeadDays={data?.defaultLeadDays ?? 7}
        presetAsset={asset}
        onClose={() => setCreating(false)}
        onSaved={async () => {
          setCreating(false);
          await queryClient.invalidateQueries({ queryKey: planKeys.all });
        }}
      />
    </Plate>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs text-[var(--content-ink-dim)]">{label}</dt>
      <dd className="min-w-0 text-right text-[var(--content-ink)]">{children}</dd>
    </div>
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
                    <Link
                      to={`/ordenes/${formatWorkOrderNumber(event.workOrder.number)}`}
                      className="ml-1.5 font-display text-xs font-normal tabular text-accent-ink hover:underline"
                    >
                      {formatWorkOrderNumber(event.workOrder.number)}
                    </Link>
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
              {event.actor && (
                <p className="mt-0.5 text-xs text-[var(--content-ink-dim)]">
                  por {event.actor.name}
                  {/* La avería nació de un ticket: de aquí se vuelve a la conversación. */}
                  {event.ticket && (
                    <>
                      {" · desde "}
                      <Link
                        to={`/tickets/${formatTicketNumber(event.ticket.number)}`}
                        className="font-display tabular text-accent-ink hover:underline"
                      >
                        {formatTicketNumber(event.ticket.number)}
                      </Link>
                    </>
                  )}
                </p>
              )}
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
