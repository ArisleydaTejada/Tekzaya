import {
  ASSET_TYPE_LABEL,
  centsFromAmountInput,
  EXTERNAL_PRICING_LABEL,
  EXTERNAL_PRICINGS,
  formatAssetNumber,
  formatMoney,
  formatSparePartNumber,
  formatTicketNumber,
  formatWorkOrderNumber,
  hourlyServiceAmount,
  isSettledStatus,
  TICKET_STATUS_LABEL,
  WORK_ORDER_HOLD_REASON_LABEL,
  WORK_ORDER_HOLD_REASONS,
  WORK_ORDER_STATUS_LABEL,
  type ExternalPricing,
  type WorkOrderDetail,
  type WorkOrderPartOption,
  type WorkOrderHoldReason,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { assetKeys } from "../api/assets";
import { attachmentUrl, takeTicket, ticketKeys, updateTicket, uploadAttachment } from "../api/tickets";
import {
  addExternalCost,
  addWorkOrderPart,
  completeWorkOrder,
  getWorkOrder,
  listWorkOrderAssigneeOptions,
  listWorkOrderPartOptions,
  removeExternalCost,
  removeRequiredPart,
  removeWorkOrderPart,
  setRequiredPart,
  setWorkOrderAssignees,
  takeWorkOrder,
  updateWorkOrder,
  workOrderKeys,
} from "../api/workOrders";
import { AssetStatusBadge } from "../components/assets";
import { Avatar } from "../components/Avatar";
import { AreaTag } from "../components/badges";
import { CheckIcon, PaperclipIcon, PlusIcon, XIcon } from "../components/icons";
import { RepairEstimateCard } from "../components/maintenanceAi";
import { Modal } from "../components/Modal";
import { MoneyInput } from "../components/MoneyInput";
import { Plate } from "../components/Plate";
import { OverdueTag, RequiredPartStatus, WorkOrderStatusBadge, WorkOrderTypeTag } from "../components/workOrders";
import { formatDateTime, formatDay, formatMinutes, formatQuantity, formatWhen } from "../lib/format";
import { useOnOpen } from "../lib/useOnOpen";

const inputClass =
  "w-full rounded-lg border border-[var(--field-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent";

const labelClass = "mb-1 block text-xs font-medium text-[var(--content-ink-dim)]";

const secondaryButton =
  "flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:opacity-50";

const primaryButton =
  "flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-50";

type Dialog = "assign" | "hold" | "complete" | "cancel" | "resolveTicket" | null;

type OriginTicket = NonNullable<WorkOrderDetail["ticket"]>;

/**
 * Si quien trabajó no es responsable del ticket, primero lo toma para que el ticket diga
 * quién lo resolvió. Devuelve la OT con el ticket al día.
 */
async function resolveOriginTicket(order: WorkOrderDetail, ticket: OriginTicket, note: string): Promise<WorkOrderDetail> {
  if (ticket.takeFirst) await takeTicket(ticket.id);
  await updateTicket(ticket.id, { status: "resolved", note });

  return { ...order, ticket: { ...ticket, status: "resolved", canResolve: false, takeFirst: false } };
}

/** Ficha de la OT (plan A3). El costo lo recalcula el servidor; aquí solo se muestra. */
export default function OrdenDetailPage() {
  const { number = "" } = useParams();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: order, isLoading, isError, error } = useQuery({
    queryKey: workOrderKeys.detail(number),
    queryFn: () => getWorkOrder(number),
    retry: false,
  });

  /** Tras cada cambio: la ficha con lo que devolvió el servidor, y el resto a refrescar. */
  async function saved(next: WorkOrderDetail) {
    queryClient.setQueryData(workOrderKeys.detail(number), next);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workOrderKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: assetKeys.all }),
      ...(next.ticket ? [queryClient.invalidateQueries({ queryKey: ticketKeys.all })] : []),
    ]);
  }

  const action = useMutation({
    mutationFn: (run: () => Promise<WorkOrderDetail>) => run(),
    onMutate: () => setActionError(null),
    onSuccess: saved,
    onError: (cause) => setActionError(cause.message),
  });

  if (isLoading) {
    return (
      <Plate className="flex items-center justify-center py-16">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent" aria-label="Cargando orden" />
      </Plate>
    );
  }

  if (isError || !order) {
    return (
      <Plate className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-[var(--content-ink-dim)]">{error instanceof Error ? error.message : "Esa orden no existe."}</p>
        <Link to="/ordenes" className="text-sm font-medium text-accent-ink hover:underline">
          Volver a las órdenes
        </Link>
      </Plate>
    );
  }

  const { permissions } = order;
  const open = order.status !== "completed" && order.status !== "cancelled";
  const busy = action.isPending;

  return (
    <div>
      <Link to="/ordenes" className="mb-3 inline-block text-xs font-medium text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]">
        ← Órdenes de trabajo
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xs tabular text-[var(--content-ink-dim)]">{formatWorkOrderNumber(order.number)}</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--content-ink)]">{order.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <WorkOrderStatusBadge status={order.status} holdReason={order.holdReason} />
            <WorkOrderTypeTag type={order.type} />
            {order.status === "on_hold" && order.holdReason && (
              <span className="text-xs font-medium text-amber">{WORK_ORDER_HOLD_REASON_LABEL[order.holdReason]}</span>
            )}
            {order.scheduledFor && (
              <span className="text-xs text-[var(--content-ink-dim)]">Programada para el {formatDay(order.scheduledFor)}</span>
            )}
            {order.overdue && <OverdueTag />}
          </div>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            {permissions.take && (
              <button disabled={busy} onClick={() => action.mutate(() => takeWorkOrder(order.id))} className={secondaryButton}>
                Tomar
              </button>
            )}
            {permissions.assign && (
              <button disabled={busy} onClick={() => setDialog("assign")} className={secondaryButton}>
                Asignar
              </button>
            )}
            {permissions.work && (order.status === "assigned" || order.status === "on_hold") && (
              <button
                disabled={busy}
                onClick={() => action.mutate(() => updateWorkOrder(order.id, { status: "in_progress" }))}
                className={primaryButton}
              >
                {order.status === "on_hold" ? "Reanudar" : "Iniciar trabajo"}
              </button>
            )}
            {permissions.work && (order.status === "assigned" || order.status === "in_progress") && (
              <button disabled={busy} onClick={() => setDialog("hold")} className={secondaryButton}>
                Poner en espera
              </button>
            )}
            {permissions.work && order.status === "in_progress" && (
              <button disabled={busy} onClick={() => setDialog("complete")} className={primaryButton}>
                <CheckIcon className="h-3.5 w-3.5" /> Completar
              </button>
            )}
            {permissions.work && (
              <button
                disabled={busy}
                onClick={() => setDialog("cancel")}
                className="flex items-center gap-1.5 rounded-lg border border-red/40 px-3 py-2 text-xs font-medium text-red hover:bg-red/10 disabled:opacity-50"
              >
                Cancelar orden
              </button>
            )}
          </div>
        )}
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {actionError}
        </p>
      )}
      {open && permissions.work && order.status === "pending" && (
        <p className="mb-4 rounded-xl border border-[var(--content-border)] bg-[var(--content-bg)] px-4 py-3 text-sm text-[var(--content-ink-dim)]">
          La orden está pendiente: asígnala a alguien del área para empezar a trabajar en ella.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Plate className="p-4">
            <h2 className="mb-2 font-display text-sm font-semibold text-[var(--content-ink)]">Descripción</h2>
            <p className="whitespace-pre-wrap text-sm text-[var(--content-ink)]">{order.description || "Sin descripción."}</p>
            {order.checklist.length > 0 && (
              <Checklist order={order} disabled={!permissions.work || !open || busy} onToggle={(checklist) => action.mutate(() => updateWorkOrder(order.id, { checklist }))} />
            )}
          </Plate>

          {order.completionNotes && (
            <Plate className="border-green/40 p-4">
              <h2 className="mb-1 font-display text-sm font-semibold text-[var(--content-ink)]">Trabajo realizado</h2>
              <p className="whitespace-pre-wrap text-sm text-[var(--content-ink)]">{order.completionNotes}</p>
              {order.completedAt && (
                <p className="mt-1 text-xs text-[var(--content-ink-dim)]">Completada el {formatDateTime(order.completedAt)}</p>
              )}
            </Plate>
          )}

          <PartsSection order={order} editable={permissions.work && open} onSaved={saved} />
          <ExternalSection order={order} editable={permissions.work && open} onSaved={saved} />
        </div>

        <aside className="space-y-4" aria-label="Resumen de la orden">
          <CostCard order={order} />
          <RepairEstimateCard order={order} />

          <Plate className="space-y-2 p-4 text-sm">
            <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">Equipo</h2>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display text-xs tabular text-[var(--content-ink-dim)]">{formatAssetNumber(order.asset.number)}</p>
                <Link to={`/activos/${formatAssetNumber(order.asset.number)}`} className="font-medium text-[var(--content-ink)] hover:underline">
                  {order.asset.name}
                </Link>
              </div>
              <AssetStatusBadge status={order.asset.status} />
            </div>
            <p className="text-xs text-[var(--content-ink-dim)]">
              {ASSET_TYPE_LABEL[order.asset.type]} · {order.asset.location}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-[var(--content-ink-dim)]">
              Lo mantiene <AreaTag area={order.area} />
            </p>
            <p className="text-xs text-[var(--content-ink-dim)]">
              {order.outOfService ? "Quedó fuera de servicio al abrir la orden." : "Siguió funcionando al abrir la orden."}
            </p>
          </Plate>

          {order.ticket && (
            <Plate className="p-4 text-sm">
              <h2 className="mb-1 font-display text-sm font-semibold text-[var(--content-ink)]">Ticket de origen</h2>
              <Link to={`/tickets/${formatTicketNumber(order.ticket.number)}`} className="text-accent-ink hover:underline">
                <span className="font-display tabular">{formatTicketNumber(order.ticket.number)}</span> · {order.ticket.title}
              </Link>
              <p className="mt-1 text-xs text-[var(--content-ink-dim)]">
                {TICKET_STATUS_LABEL[order.ticket.status]}
                {" · "}El solicitante sigue la conversación en el ticket; al completar la orden se le avisa ahí.
              </p>
              {/* La orden terminó y el ticket sigue abierto: el solicitante lo ve
                  pendiente hasta que alguien lo resuelva con una nota. */}
              {order.status === "completed" && !isSettledStatus(order.ticket.status) && (
                <div role="status" className="mt-2 rounded-lg border border-amber/50 bg-amber/10 px-2.5 py-2 text-xs text-[var(--content-ink)]">
                  <p>
                    La orden se completó, pero el ticket sigue abierto.{" "}
                    {!order.ticket.canResolve && (
                      <Link to={`/tickets/${formatTicketNumber(order.ticket.number)}`} className="font-semibold text-accent-ink hover:underline">
                        Recuerda resolverlo.
                      </Link>
                    )}
                  </p>
                  {order.ticket.canResolve && (
                    <button onClick={() => setDialog("resolveTicket")} className="mt-1.5 font-semibold text-accent-ink hover:underline">
                      Resolver el ticket
                    </button>
                  )}
                </div>
              )}
            </Plate>
          )}

          {order.plan && (
            <Plate className="p-4 text-sm">
              <h2 className="mb-1 font-display text-sm font-semibold text-[var(--content-ink)]">Plan preventivo</h2>
              <Link to="/preventivos" className="text-accent-ink hover:underline">
                {order.plan.title}
              </Link>
              <p className="mt-1 text-xs text-[var(--content-ink-dim)]">
                Generada por el plan{order.scheduledFor ? ` para el ${formatDay(order.scheduledFor)}` : ""}.
              </p>
            </Plate>
          )}

          <Plate className="p-4 text-sm">
            <h2 className="mb-2 font-display text-sm font-semibold text-[var(--content-ink)]">Responsables</h2>
            {order.assignees.length === 0 ? (
              <p className="text-xs text-[var(--content-ink-dim)]">Nadie todavía.</p>
            ) : (
              <ul className="space-y-1.5">
                {order.assignees.map((person) => (
                  <li key={person.id} className="flex items-center gap-2 text-[var(--content-ink)]">
                    <Avatar name={person.name} src={person.avatarUrl} size="sm" /> {person.name}
                  </li>
                ))}
              </ul>
            )}
          </Plate>

          <Plate className="p-4 text-sm">
            <h2 className="mb-2 font-display text-sm font-semibold text-[var(--content-ink)]">Historial</h2>
            <ol className="space-y-2">
              {order.history.map((step, index) => (
                <li key={`${step.status}-${step.at}-${index}`} className="text-xs">
                  <span className="font-medium text-[var(--content-ink)]">{WORK_ORDER_STATUS_LABEL[step.status]}</span>
                  <span className="text-[var(--content-ink-dim)]">
                    {" · "}
                    <time dateTime={step.at} title={formatDateTime(step.at)}>
                      {formatWhen(step.at)}
                    </time>
                    {step.by && ` · ${step.by.name}`}
                  </span>
                  {step.reason && <p className="text-[var(--content-ink-dim)]">{step.reason}</p>}
                </li>
              ))}
            </ol>
          </Plate>
        </aside>
      </div>

      <AssignModal open={dialog === "assign"} order={order} onClose={() => setDialog(null)} onSaved={saved} />
      <HoldModal open={dialog === "hold"} order={order} onClose={() => setDialog(null)} onSaved={saved} />
      <CompleteModal
        open={dialog === "complete"}
        order={order}
        onClose={() => setDialog(null)}
        onSaved={saved}
        onTicketError={setActionError}
      />
      {order.ticket?.canResolve && (
        <ResolveTicketModal
          open={dialog === "resolveTicket"}
          order={order}
          ticket={order.ticket}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
      <CancelModal open={dialog === "cancel"} order={order} onClose={() => setDialog(null)} onSaved={saved} />
    </div>
  );
}

// Lista de verificación

function Checklist({
  order,
  disabled,
  onToggle,
}: {
  order: WorkOrderDetail;
  disabled: boolean;
  onToggle: (checklist: boolean[]) => void;
}) {
  const done = order.checklist.filter((item) => item.done).length;

  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-xs font-medium text-[var(--content-ink-dim)]">
        Lista de verificación · {done} de {order.checklist.length}
      </legend>
      <ul className="space-y-1.5">
        {order.checklist.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            <label className="flex items-start gap-2 text-sm text-[var(--content-ink)]">
              <input
                type="checkbox"
                checked={item.done}
                disabled={disabled}
                onChange={(event) =>
                  onToggle(order.checklist.map((other, at) => (at === index ? event.target.checked : other.done)))
                }
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
              />
              <span className={item.done ? "line-through decoration-[var(--content-ink-dim)]" : ""}>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

// Costo

function CostCard({ order }: { order: WorkOrderDetail }) {
  const money = (cents: number) => formatMoney(cents, order.currency);

  const rows: [string, number][] = [
    ["Repuestos", order.cost.parts],
    ["Servicios externos", order.cost.external],
  ];

  return (
    <Plate className="p-4">
      <h2 className="mb-3 font-display text-sm font-semibold text-[var(--content-ink)]">Costo de la orden</h2>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-[var(--content-ink-dim)]">{label}</dt>
            <dd className="tabular text-[var(--content-ink)]">{money(amount)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-2 border-t border-[var(--content-border)] pt-1.5 font-semibold">
          <dt className="text-[var(--content-ink)]">Total</dt>
          <dd className="tabular text-[var(--content-ink)]">{money(order.cost.total)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-[var(--content-ink-dim)]">
        El trabajo del equipo de la empresa no suma: solo cuesta lo que se compra o se paga fuera.
      </p>
    </Plate>
  );
}

// Secciones de carga

function Section({ title, total, children }: { title: string; total?: string; children: ReactNode }) {
  return (
    <Plate className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">{title}</h2>
        {total && <span className="text-sm tabular text-[var(--content-ink-dim)]">{total}</span>}
      </div>
      {children}
    </Plate>
  );
}

function RemoveButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--content-ink-dim)] hover:bg-red/10 hover:text-red disabled:opacity-50"
    >
      <XIcon className="h-3.5 w-3.5" />
    </button>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p role="alert" className="mt-2 text-xs text-red">
      {message}
    </p>
  );
}

interface SectionProps {
  order: WorkOrderDetail;
  editable: boolean;
  onSaved: (order: WorkOrderDetail) => Promise<void>;
}

/** Las piezas vinculadas al equipo de la orden van en su propio grupo, arriba. */
function PartOptionGroups({
  options,
  render,
}: {
  options: readonly WorkOrderPartOption[];
  render: (option: WorkOrderPartOption) => ReactNode;
}) {
  const mine = options.filter((option) => option.forAsset);

  if (mine.length === 0) return <>{options.map(render)}</>;

  return (
    <>
      <optgroup label="De este equipo">{mine.map(render)}</optgroup>
      <optgroup label="Resto del almacén">{options.filter((option) => !option.forAsset).map(render)}</optgroup>
    </>
  );
}

/** Una fila por pieza: lo previsto y lo usado de ella, juntos. */
interface PartRow {
  part: WorkOrderDetail["partsUsed"][number]["part"];
  required?: WorkOrderDetail["requiredParts"][number];
  uses: WorkOrderDetail["partsUsed"];
}

function partRows(order: WorkOrderDetail): PartRow[] {
  const rows = new Map<string, PartRow>();

  for (const item of order.requiredParts) rows.set(item.part.id, { part: item.part, required: item, uses: [] });

  for (const use of order.partsUsed) {
    const row = rows.get(use.part.id);

    if (row) row.uses.push(use);
    else rows.set(use.part.id, { part: use.part, uses: [use] });
  }

  return [...rows.values()];
}

/**
 * "Prever" anota lo que hará falta sin tocar el almacén; "Usar" lo consume y suma al costo del día.
 * Son dos cosas en la base pero se miran juntas; devolver y dejar de prever siguen separados.
 */
function PartsSection({ order, editable, onSaved }: SectionProps) {
  const [partId, setPartId] = useState("");
  const [qty, setQty] = useState("1");

  const { data: options = [] } = useQuery({
    queryKey: workOrderKeys.partOptions(order.id),
    queryFn: () => listWorkOrderPartOptions(order.id),
    enabled: editable,
  });

  const queryClient = useQueryClient();
  const chosen = options.find((option) => option.id === partId);
  const rows = partRows(order);

  const mutation = useMutation({
    mutationFn: (run: () => Promise<WorkOrderDetail>) => run(),
    onSuccess: async (next) => {
      setPartId("");
      setQty("1");
      await queryClient.invalidateQueries({ queryKey: workOrderKeys.partOptions(order.id) });
      await onSaved(next);
    },
    // El stock pudo cambiar por otro técnico: se vuelve a pedir para mostrar lo que queda.
    onError: () => void queryClient.invalidateQueries({ queryKey: workOrderKeys.partOptions(order.id) }),
  });

  const amount = Number(qty);
  const validAmount = Number.isInteger(amount) && amount >= 1;
  const short = Boolean(chosen && validAmount && chosen.stock < amount);

  function submit(action: "plan" | "use") {
    if (!partId || !validAmount) return;
    mutation.mutate(() =>
      action === "plan"
        ? setRequiredPart(order.id, { partId, qty: amount })
        : addWorkOrderPart(order.id, { partId, qty: amount }),
    );
  }

  return (
    <Section title="Repuestos" total={formatMoney(order.cost.parts, order.currency)}>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--content-ink-dim)]">
          {editable
            ? "Sin repuestos. Prevé lo que hará falta para saber antes de ir si hay en el almacén, o usa uno ahora."
            : "Sin repuestos."}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--content-border)] text-sm" aria-label="Repuestos de la orden">
          {rows.map(({ part, required, uses }) => {
            const used = uses.reduce((sum, use) => sum + use.qty, 0);
            const cost = uses.reduce((sum, use) => sum + use.qty * use.unitCost, 0);
            const missing = required ? required.qty - required.used : 0;
            const loadable = required ? Math.min(missing, required.stock) : 0;

            return (
              <li key={part.id} className="py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <div className="min-w-48 flex-1">
                    <p className="truncate text-[var(--content-ink)]">
                      <Link
                        to={`/repuestos/${formatSparePartNumber(part.number)}`}
                        className="font-display text-xs tabular text-accent-ink hover:underline"
                      >
                        {formatSparePartNumber(part.number)}
                      </Link>{" "}
                      {part.name}
                    </p>
                    <p className="text-xs text-[var(--content-ink-dim)]">
                      {required
                        ? `Previstos ${required.qty} · usados ${used}`
                        : `Usados ${formatQuantity(used, part.unit)} · no previsto`}
                    </p>
                  </div>
                  {required && <RequiredPartStatus item={required} />}
                  {editable && required && missing > 0 && loadable > 0 && (
                    <button
                      type="button"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(() => addWorkOrderPart(order.id, { partId: part.id, qty: loadable }))}
                      className={secondaryButton}
                    >
                      Usar {loadable}
                    </button>
                  )}
                  <span className="min-w-20 text-right tabular text-[var(--content-ink)]">
                    {used > 0 ? formatMoney(cost, order.currency) : "—"}
                  </span>
                  {editable && required && (
                    <RemoveButton
                      label={`${part.name}: ya no hace falta`}
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(() => removeRequiredPart(order.id, required.id))}
                    />
                  )}
                </div>
                {uses.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-3 text-xs text-[var(--content-ink-dim)]" aria-label={`Lo usado de ${part.name}`}>
                    {uses.map((use) => (
                      <li key={use.id} className="flex items-center gap-2">
                        <span className="flex-1">
                          {formatQuantity(use.qty, part.unit)} × {formatMoney(use.unitCost, order.currency)} ·{" "}
                          <time dateTime={use.at} title={formatDateTime(use.at)}>
                            {formatWhen(use.at)}
                          </time>
                        </span>
                        {editable && (
                          <button
                            type="button"
                            disabled={mutation.isPending}
                            onClick={() => mutation.mutate(() => removeWorkOrderPart(order.id, use.id))}
                            aria-label={`Devolver ${part.name} al almacén`}
                            className="font-medium text-accent-ink hover:underline disabled:opacity-50"
                          >
                            Devolver
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit("use");
          }}
          className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--content-border)] pt-3 sm:grid-cols-[minmax(0,1fr)_80px_auto_auto] sm:items-end"
        >
          <label className="col-span-2 sm:col-span-1">
            <span className={labelClass}>Repuesto del almacén de {order.area.name}</span>
            <select value={partId} onChange={(event) => setPartId(event.target.value)} className={inputClass}>
              <option value="">Elige un repuesto…</option>
              <PartOptionGroups
                options={options}
                render={(option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} · {option.stock === 0 ? "sin existencias" : `quedan ${option.stock}`} ·{" "}
                    {formatMoney(option.avgUnitCost, order.currency)}
                  </option>
                )}
              />
            </select>
          </label>
          <label className="col-span-2 sm:col-span-1">
            <span className={labelClass}>Cantidad</span>
            <input type="number" min={1} max={1000} inputMode="numeric" value={qty} onChange={(event) => setQty(event.target.value)} className={inputClass} />
          </label>
          <button
            type="button"
            onClick={() => submit("plan")}
            disabled={!partId || !validAmount || mutation.isPending}
            title="Anotar que hará falta, sin descontarlo del almacén"
            className={`${secondaryButton} justify-center`}
          >
            <PlusIcon className="h-3.5 w-3.5" /> Prever
          </button>
          <button
            type="submit"
            disabled={!chosen || !validAmount || short || mutation.isPending}
            title="Descontarlo del almacén y sumarlo al costo"
            className={`${primaryButton} justify-center`}
          >
            <PlusIcon className="h-3.5 w-3.5" /> Usar ahora
          </button>
          {short && chosen && (
            <p className="col-span-2 text-xs text-[var(--content-ink-dim)] sm:col-span-4">
              {chosen.stock === 0 ? "No hay existencias" : `Solo quedan ${chosen.stock}`}: puedes preverlo para pedirlo.
            </p>
          )}
        </form>
      )}
      <FormError message={mutation.error?.message ?? null} />
    </Section>
  );
}

/** "12.50" → centavos; lo que no se puede leer cuenta como cero. */
function centsOf(text: string): number {
  try {
    return text ? centsFromAmountInput(text) : 0;
  } catch {
    return 0;
  }
}

/** Horas y minutos escritos en dos campos → minutos. */
const minutesOf = (hours: string, minutes: string) => (Number(hours) || 0) * 60 + (Number(minutes) || 0);

/**
 * Servicios externos, la única mano de obra que cuesta: precio cerrado o por hora,
 * y en ese caso el total lo calcula el servidor.
 */
function ExternalSection({ order, editable, onSaved }: SectionProps) {
  const [vendor, setVendor] = useState("");
  const [description, setDescription] = useState("");
  const [pricing, setPricing] = useState<ExternalPricing>("total");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [hours, setHours] = useState("");
  const [minutes, setMinutes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);

  const worked = minutesOf(hours, minutes);
  const hourlyTotal = hourlyServiceAmount(centsOf(rate), worked);

  const valid =
    vendor.trim() !== "" && (pricing === "hourly" ? centsOf(rate) > 0 && worked > 0 : centsOf(amount) > 0);

  const mutation = useMutation({
    mutationFn: async () => {
      const invoice = file ? await uploadAttachment(file) : null;

      const base = {
        vendor: vendor.trim(),
        description: description.trim() || undefined,
        attachmentId: invoice ? invoice.id : undefined,
      };

      return addExternalCost(
        order.id,
        pricing === "hourly"
          ? { ...base, pricing, hourlyRate: centsOf(rate), minutes: worked }
          : { ...base, pricing, amount: centsOf(amount), minutes: worked > 0 ? worked : undefined },
      );
    },
    onSuccess: async (next) => {
      setVendor("");
      setDescription("");
      setAmount("");
      setRate("");
      setHours("");
      setMinutes("");
      setFile(null);
      setFileKey((key) => key + 1);
      await onSaved(next);
    },
  });

  const remove = useMutation({
    mutationFn: (costId: string) => removeExternalCost(order.id, costId),
    onSuccess: onSaved,
  });

  return (
    <Section title="Servicios externos" total={formatMoney(order.cost.external, order.currency)}>
      {order.externalCosts.length === 0 ? (
        <p className="text-sm text-[var(--content-ink-dim)]">Sin servicios de proveedores.</p>
      ) : (
        <ul className="divide-y divide-[var(--content-border)] text-sm">
          {order.externalCosts.map((cost) => (
            <li key={cost.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[var(--content-ink)]">{cost.vendor}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--content-ink-dim)]">
                  <span>
                    {cost.pricing === "hourly" && cost.hourlyRate && cost.minutes
                      ? `${formatMinutes(cost.minutes)} × ${formatMoney(cost.hourlyRate, order.currency)}/h`
                      : `Precio total${cost.minutes ? ` · ${formatMinutes(cost.minutes)}` : ""}`}
                  </span>
                  {cost.description && <span>{cost.description}</span>}
                  {cost.attachmentId && (
                    <a href={attachmentUrl(cost.attachmentId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-ink hover:underline">
                      <PaperclipIcon className="h-3 w-3" /> Factura
                    </a>
                  )}
                </p>
              </div>
              <span className="tabular text-[var(--content-ink)]">{formatMoney(cost.amount, order.currency)}</span>
              {editable && (
                <RemoveButton label={`Quitar el servicio de ${cost.vendor}`} disabled={remove.isPending} onClick={() => remove.mutate(cost.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form
          onSubmit={(event) => {
            event.preventDefault();

            if (valid) mutation.mutate();
          }}
          className="mt-3 grid gap-3 border-t border-[var(--content-border)] pt-3 sm:grid-cols-2"
        >
          <label>
            <span className={labelClass}>Proveedor</span>
            <input value={vendor} maxLength={120} onChange={(event) => setVendor(event.target.value)} className={inputClass} />
          </label>
          <label>
            <span className={labelClass}>Concepto (opcional)</span>
            <input value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
          </label>

          <fieldset className="sm:col-span-2">
            <legend className={labelClass}>¿Cómo cobra?</legend>
            <div className="flex flex-wrap gap-4">
              {EXTERNAL_PRICINGS.map((option) => (
                <label key={option} className="flex items-center gap-2 text-sm text-[var(--content-ink)]">
                  <input
                    type="radio"
                    name="external-pricing"
                    checked={pricing === option}
                    onChange={() => setPricing(option)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {EXTERNAL_PRICING_LABEL[option]}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="external-amount" className={labelClass}>
              {pricing === "hourly" ? "Tarifa por hora" : "Precio total"}
            </label>
            {pricing === "hourly" ? (
              <MoneyInput id="external-amount" value={rate} onChange={setRate} currency={order.currency} />
            ) : (
              <MoneyInput id="external-amount" value={amount} onChange={setAmount} currency={order.currency} />
            )}
          </div>
          <fieldset>
            <legend className={labelClass}>Horas trabajadas{pricing === "total" ? " (opcional)" : ""}</legend>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label="Horas del proveedor"
                placeholder="h"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
                className={inputClass}
              />
              <input
                type="number"
                min={0}
                max={59}
                step={5}
                inputMode="numeric"
                aria-label="Minutos del proveedor"
                placeholder="min"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
                className={inputClass}
              />
            </div>
          </fieldset>

          <label>
            <span className={labelClass}>Factura (imagen o PDF, opcional)</span>
            <input
              key={fileKey}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full text-xs text-[var(--content-ink-dim)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--content-bg)] file:px-2 file:py-1.5 file:text-xs file:text-[var(--content-ink)]"
            />
          </label>
          <div className="flex flex-col justify-end gap-1.5">
            {/* Por hora, el total se ve antes de guardar: es lo que calculará el servidor. */}
            {pricing === "hourly" && (
              <p className="text-xs text-[var(--content-ink-dim)]" aria-live="polite">
                Total: <span className="tabular text-[var(--content-ink)]">{formatMoney(hourlyTotal, order.currency)}</span>
              </p>
            )}
            <button type="submit" disabled={!valid || mutation.isPending} className={`${primaryButton} w-full justify-center`}>
              <PlusIcon className="h-3.5 w-3.5" /> Agregar servicio
            </button>
          </div>
        </form>
      )}
      <FormError message={mutation.error?.message ?? remove.error?.message ?? null} />
    </Section>
  );
}

// Diálogos

interface DialogProps {
  open: boolean;
  order: WorkOrderDetail;
  onClose: () => void;
  onSaved: (order: WorkOrderDetail) => Promise<void>;
}

/** Botones del pie de un diálogo: cancelar y confirmar. */
function DialogFooter({ onClose, onConfirm, label, disabled, danger }: {
  onClose: () => void;
  onConfirm: () => void;
  label: string;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <>
      <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
        Volver
      </button>
      <button
        onClick={onConfirm}
        disabled={disabled}
        className={`rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${danger ? "bg-red" : "bg-accent"}`}
      >
        {label}
      </button>
    </>
  );
}

/** Mutación de un diálogo: al terminar, guarda y se cierra. */
function useDialogMutation(onSaved: DialogProps["onSaved"], onClose: () => void) {
  return useMutation({
    mutationFn: (run: () => Promise<WorkOrderDetail>) => run(),
    onSuccess: async (next) => {
      await onSaved(next);
      onClose();
    },
  });
}

function AssignModal({ open, order, onClose, onSaved }: DialogProps) {
  const [selected, setSelected] = useState<string[]>([]);
  useOnOpen(open, () => setSelected(order.assignees.map((person) => person.id)));

  const { data: people = [] } = useQuery({
    queryKey: workOrderKeys.assigneeOptions(order.id),
    queryFn: () => listWorkOrderAssigneeOptions(order.id),
    enabled: open,
  });

  const save = useDialogMutation(onSaved, onClose);
  const current = new Set(order.assignees.map((person) => person.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Asignar ${formatWorkOrderNumber(order.number)}`}
      footer={
        <DialogFooter
          onClose={onClose}
          label="Guardar"
          disabled={save.isPending}
          onConfirm={() => save.mutate(() => setWorkOrderAssignees(order.id, selected))}
        />
      }
    >
      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">Técnicos de {order.area.name}, con sus órdenes abiertas.</p>
      {save.error && (
        <p role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {save.error.message}
        </p>
      )}
      <ul className="space-y-1">
        {people.map((person) => {
          // A un ausente no se le asigna trabajo nuevo; si ya lo tenía, se puede quitar.
          const blocked = person.away && !current.has(person.id);

          return (
            <li key={person.id}>
              <label className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${blocked ? "text-[var(--content-ink-dim)]" : "text-[var(--content-ink)] hover:bg-[var(--content-bg)]"}`}>
                <input
                  type="checkbox"
                  disabled={blocked}
                  checked={selected.includes(person.id)}
                  onChange={(event) =>
                    setSelected((list) => (event.target.checked ? [...list, person.id] : list.filter((id) => id !== person.id)))
                  }
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <Avatar name={person.name} src={person.avatarUrl} size="sm" />
                <span className="flex-1">{person.name}</span>
                <span className="text-xs text-[var(--content-ink-dim)]">
                  {person.away ? "Ausente" : `${person.openWorkOrders} abierta${person.openWorkOrders === 1 ? "" : "s"}`}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function HoldModal({ open, order, onClose, onSaved }: DialogProps) {
  const [reason, setReason] = useState<WorkOrderHoldReason | null>(null);
  useOnOpen(open, () => setReason(null));
  const save = useDialogMutation(onSaved, onClose);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Poner en espera"
      footer={
        <DialogFooter
          onClose={onClose}
          label="Poner en espera"
          disabled={!reason || save.isPending}
          onConfirm={() => save.mutate(() => updateWorkOrder(order.id, { status: "on_hold", holdReason: reason! }))}
        />
      }
    >
      <fieldset>
        <legend className="mb-2 text-sm text-[var(--content-ink-dim)]">¿Qué falta para seguir?</legend>
        <div className="space-y-1.5">
          {WORK_ORDER_HOLD_REASONS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-[var(--content-ink)]">
              <input type="radio" name="hold-reason" checked={reason === option} onChange={() => setReason(option)} className="h-4 w-4 accent-[var(--accent)]" />
              {WORK_ORDER_HOLD_REASON_LABEL[option]}
            </label>
          ))}
        </div>
      </fieldset>
      {save.error && <FormError message={save.error.message} />}
    </Modal>
  );
}

/**
 * Completar puede resolver también el ticket de origen. Son dos peticiones: si falla la segunda,
 * la orden queda completada y se dice qué pasó con el ticket.
 */
function CompleteModal({
  open,
  order,
  onClose,
  onSaved,
  onTicketError,
}: DialogProps & { onTicketError: (message: string) => void }) {
  const [notes, setNotes] = useState("");
  const [retire, setRetire] = useState(false);
  const [resolve, setResolve] = useState(false);
  // La nota para el solicitante copia el trabajo realizado hasta que se edita.
  const [ticketNote, setTicketNote] = useState<string | null>(null);
  const ticket = order.ticket?.canResolve ? order.ticket : undefined;
  useOnOpen(open, () => {
    setNotes("");
    setRetire(false);
    setResolve(Boolean(ticket));
    setTicketNote(null);
  });
  const note = (ticketNote ?? notes).trim();
  const save = useDialogMutation(onSaved, onClose);

  async function complete(): Promise<WorkOrderDetail> {
    const next = await completeWorkOrder(order.id, { completionNotes: notes.trim(), retireAsset: retire });

    if (!ticket || !resolve || !next.ticket) return next;

    try {
      return await resolveOriginTicket(next, ticket, note);
    } catch (cause) {
      onTicketError(
        `La orden se completó, pero el ticket ${formatTicketNumber(ticket.number)} no se pudo resolver: ` +
          (cause instanceof Error ? cause.message : "inténtalo desde el ticket."),
      );

      return next;
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Completar ${formatWorkOrderNumber(order.number)}`}
      wide
      footer={
        <DialogFooter
          onClose={onClose}
          label={retire ? "Completar y dar de baja" : "Completar"}
          danger={retire}
          disabled={notes.trim().length < 5 || (resolve && Boolean(ticket) && note.length < 3) || save.isPending}
          onConfirm={() => save.mutate(complete)}
        />
      }
    >
      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">
        {order.outOfService
          ? "El equipo vuelve a estar operativo, salvo que otra orden abierta lo tenga parado."
          : "El equipo siguió funcionando durante la orden."}
        {order.ticket && !ticket && " El ticket de origen recibe el aviso; resolverlo sigue siendo cosa del ticket."}
      </p>
      {save.error && (
        <p role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {save.error.message}
        </p>
      )}
      <label className="block">
        <span className={labelClass}>Trabajo realizado</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          placeholder="Qué se encontró y qué se hizo…"
          className={inputClass}
        />
      </label>
      {order.permissions.retireAsset && (
        <label className="mt-3 flex items-start gap-2 text-sm text-[var(--content-ink)]">
          <input type="checkbox" checked={retire} onChange={(event) => setRetire(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
          <span>
            No tiene arreglo: dar de baja {formatAssetNumber(order.asset.number)}
            <span className="block text-xs text-[var(--content-ink-dim)]">Las notas quedan como motivo de la baja.</span>
          </span>
        </label>
      )}
      {ticket && (
        <div className="mt-3 rounded-lg border border-[var(--content-border)] p-3">
          <label className="flex items-start gap-2 text-sm text-[var(--content-ink)]">
            <input type="checkbox" checked={resolve} onChange={(event) => setResolve(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
            <span>
              Resolver también el ticket {formatTicketNumber(ticket.number)}
              <span className="block text-xs text-[var(--content-ink-dim)]">
                {resolve
                  ? `${ticket.takeFirst ? "Quedas como responsable del ticket. " : ""}El solicitante recibe la nota y confirma si el problema desapareció.`
                  : "El ticket queda como está; el solicitante lo seguirá viendo abierto."}
              </span>
            </span>
          </label>
          {resolve && (
            <label className="mt-2 block">
              <span className={labelClass}>Nota para el solicitante</span>
              <textarea
                value={ticketNote ?? notes}
                onChange={(event) => setTicketNote(event.target.value)}
                rows={3}
                placeholder="Qué se arregló, en palabras del solicitante…"
                className={inputClass}
              />
            </label>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Para una orden ya completada cuyo ticket quedó abierto. */
function ResolveTicketModal({ open, order, ticket, onClose, onSaved }: DialogProps & { ticket: OriginTicket }) {
  const [note, setNote] = useState("");
  useOnOpen(open, () => setNote(order.completionNotes ?? ""));
  const save = useDialogMutation(onSaved, onClose);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Resolver ${formatTicketNumber(ticket.number)}`}
      footer={
        <DialogFooter
          onClose={onClose}
          label="Marcar como resuelto"
          disabled={note.trim().length < 3 || save.isPending}
          onConfirm={() => save.mutate(() => resolveOriginTicket(order, ticket, note.trim()))}
        />
      }
    >
      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">
        {ticket.takeFirst && "Quedas como responsable del ticket. "}
        El solicitante recibe la nota y confirma si el problema desapareció.
      </p>
      {save.error && <FormError message={save.error.message} />}
      <label className="block">
        <span className={labelClass}>Nota para el solicitante</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          placeholder="Qué se arregló, en palabras del solicitante…"
          className={inputClass}
        />
      </label>
    </Modal>
  );
}

function CancelModal({ open, order, onClose, onSaved }: DialogProps) {
  const [reason, setReason] = useState("");
  useOnOpen(open, () => setReason(""));
  const save = useDialogMutation(onSaved, onClose);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cancelar ${formatWorkOrderNumber(order.number)}`}
      footer={
        <DialogFooter
          onClose={onClose}
          label="Cancelar orden"
          danger
          disabled={reason.trim().length < 3 || save.isPending}
          onConfirm={() => save.mutate(() => updateWorkOrder(order.id, { status: "cancelled", reason: reason.trim() }))}
        />
      }
    >
      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">
        Los repuestos cargados vuelven al almacén y, si la orden tenía el equipo parado, se libera. Nada se borra: la orden
        queda en el historial como cancelada.
      </p>
      {save.error && <FormError message={save.error.message} />}
      <label className="block">
        <span className={labelClass}>Motivo</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Era un atasco, no una avería…" className={inputClass} />
      </label>
    </Modal>
  );
}
