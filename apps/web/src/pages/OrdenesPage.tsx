import {
  formatAssetNumber,
  formatMoney,
  formatTicketNumber,
  formatWorkOrderNumber,
  WORK_ORDER_SCOPE_LABEL,
  WORK_ORDER_SCOPES,
  WORK_ORDER_STATUS_LABEL,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPE_LABEL,
  WORK_ORDER_TYPES,
  type WorkOrderListItem,
  type WorkOrderListQuery,
  type WorkOrderScope,
  type WorkOrderSort,
  type WorkOrderStatus,
  type WorkOrderType,
} from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listWorkOrders, workOrderKeys } from "../api/workOrders";
import { AvatarStack } from "../components/Avatar";
import { GroupIcon, KanbanIcon, ListIcon, SearchIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { OverdueTag, WorkOrderStatusBadge, WorkOrderTypeTag } from "../components/workOrders";
import { formatDateTime, formatDay, formatWhen } from "../lib/format";

const PAGE_SIZE = 25;
/** El kanban muestra de una vez lo más reciente; para buscar más atrás está la lista. */
const KANBAN_LIMIT = 100;

type ViewMode = "lista" | "grupos" | "kanban";

const orderPath = (order: { number: number }) => `/ordenes/${formatWorkOrderNumber(order.number)}`;

/**
 * Órdenes de trabajo (plan A3), con las tres vistas de los tickets. El kanban
 * no arrastra: cada cambio de estado de una OT pide algo —qué falta para
 * seguir, las notas del trabajo—, así que se mueve desde su ficha.
 */
export default function OrdenesPage() {
  const [params] = useSearchParams();
  const [scope, setScope] = useState<WorkOrderScope>("all");
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState<WorkOrderStatus | "">("");
  const [type, setType] = useState<WorkOrderType | "">("");
  const [view, setView] = useState<ViewMode>("lista");
  const [sort, setSort] = useState<WorkOrderSort>("number");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const query: Partial<WorkOrderListQuery> = {
    scope,
    page: view === "kanban" ? 1 : page,
    limit: view === "kanban" ? KANBAN_LIMIT : PAGE_SIZE,
    sort,
    dir,
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(status ? { status: [status] } : {}),
    ...(type ? { type } : {}),
  };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: workOrderKeys.list(query),
    queryFn: () => listWorkOrders(query),
    placeholderData: (previous) => previous,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currency = data?.currency ?? "USD";

  function sortBy(column: WorkOrderSort) {
    if (sort === column) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setDir(column === "scheduledFor" ? "asc" : "desc");
    }
    setPage(1);
  }

  return (
    <div>
      <PageHeader title="Órdenes de trabajo" subtitle="Reparaciones y mantenimientos del área, con su costo real." />

      <div className="mb-3 flex flex-wrap gap-1 border-b border-[var(--content-border)]" role="tablist" aria-label="Bandejas">
        {WORK_ORDER_SCOPES.map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={scope === option}
            onClick={() => {
              setScope(option);
              setPage(1);
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              scope === option
                ? "border-accent text-[var(--content-ink)]"
                : "border-transparent text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            }`}
          >
            {WORK_ORDER_SCOPE_LABEL[option]}
          </button>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-ink-dim)]" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Buscar órdenes"
            placeholder="OT, título o equipo (ACT-0012)…"
            className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] py-2 pl-9 pr-3 text-sm text-[var(--content-ink)] outline-none placeholder:text-[var(--content-ink-dim)] focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </div>
        <select
          aria-label="Filtrar por estado"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as WorkOrderStatus | "");
            setPage(1);
          }}
          className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
        >
          <option value="">Todo estado</option>
          {WORK_ORDER_STATUSES.map((option) => (
            <option key={option} value={option}>
              {WORK_ORDER_STATUS_LABEL[option]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filtrar por tipo"
          value={type}
          onChange={(event) => {
            setType(event.target.value as WorkOrderType | "");
            setPage(1);
          }}
          className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
        >
          <option value="">Todo tipo</option>
          {WORK_ORDER_TYPES.map((option) => (
            <option key={option} value={option}>
              {WORK_ORDER_TYPE_LABEL[option]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
          {(
            [
              { id: "lista", icon: ListIcon },
              { id: "grupos", icon: GroupIcon },
              { id: "kanban", icon: KanbanIcon },
            ] as { id: ViewMode; icon: typeof ListIcon }[]
          ).map(({ id, icon: Icon }) => (
            <button
              key={id}
              aria-pressed={view === id}
              onClick={() => {
                setView(id);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === id ? "bg-accent text-white" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {id}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <Plate className="py-16 text-center text-sm text-red">
          {error instanceof Error ? error.message : "No se pudieron cargar las órdenes."}
        </Plate>
      ) : isLoading ? (
        <Plate className="flex items-center justify-center py-16">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
            aria-label="Cargando órdenes"
          />
        </Plate>
      ) : items.length === 0 ? (
        <Plate className="py-16 text-center text-sm text-[var(--content-ink-dim)]">
          {scope === "mine"
            ? "No tienes órdenes abiertas asignadas."
            : "No hay órdenes que coincidan. Las órdenes las ve el área que mantiene los equipos."}
        </Plate>
      ) : view === "kanban" ? (
        <KanbanView orders={items} />
      ) : view === "grupos" ? (
        <GroupedView orders={items} counts={data?.statusCounts} />
      ) : (
        <ListView orders={items} currency={currency} sort={sort} dir={dir} onSort={sortBy} />
      )}

      {view !== "kanban" && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[var(--content-ink-dim)]">
            Mostrando {items.length} de {total} órdenes.
          </p>
          {lastPage > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 font-medium text-[var(--content-ink)] disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="tabular text-[var(--content-ink-dim)]">
                {page} / {lastPage}
              </span>
              <button
                onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
                disabled={page >= lastPage}
                className="rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 font-medium text-[var(--content-ink)] disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
      {view === "kanban" && total > items.length && (
        <p className="mt-3 text-xs text-[var(--content-ink-dim)]">
          El tablero muestra las {items.length} órdenes más recientes de {total}; para ver las anteriores, usa la lista.
        </p>
      )}
    </div>
  );
}

function Th({
  label,
  column,
  sort,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  column?: WorkOrderSort;
  sort: WorkOrderSort;
  dir: "asc" | "desc";
  onSort: (column: WorkOrderSort) => void;
  className?: string;
}) {
  if (!column) return <th className={`px-3 py-2.5 font-medium ${className}`}>{label}</th>;
  const active = sort === column;
  return (
    <th
      className={`px-3 py-2.5 font-medium ${className}`}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 whitespace-nowrap hover:text-[var(--content-ink)] ${active ? "text-[var(--content-ink)]" : ""}`}
      >
        {label}
        <span aria-hidden="true" className={active ? "" : "opacity-0"}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

/** Fecha programada del preventivo, o cuándo se abrió la correctiva. */
function When({ order }: { order: WorkOrderListItem }) {
  if (order.scheduledFor) {
    return (
      <span className="flex flex-col">
        <span>Para el {formatDay(order.scheduledFor)}</span>
        {order.overdue && <OverdueTag />}
      </span>
    );
  }
  return <span title={formatDateTime(order.createdAt)}>Abierta {formatWhen(order.createdAt).toLowerCase()}</span>;
}

function ListView({
  orders,
  currency,
  sort,
  dir,
  onSort,
}: {
  orders: WorkOrderListItem[];
  currency: string;
  sort: WorkOrderSort;
  dir: "asc" | "desc";
  onSort: (column: WorkOrderSort) => void;
}) {
  return (
    <>
      {/* En el móvil, tarjetas: la tabla de siete columnas no cabe en 360 px. */}
      <ul className="space-y-2 sm:hidden">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              to={orderPath(order)}
              className="block rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-3 hover:bg-[var(--content-bg)]"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-display text-xs tabular text-[var(--content-ink-dim)]">
                    {formatWorkOrderNumber(order.number)}
                  </span>
                  <span className="block truncate font-medium text-[var(--content-ink)]">{order.title}</span>
                </span>
                <WorkOrderStatusBadge status={order.status} holdReason={order.holdReason} />
              </span>
              <span className="mt-1 block truncate text-xs text-[var(--content-ink-dim)]">
                {formatAssetNumber(order.asset.number)} · {order.asset.name}
              </span>
              <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-[var(--content-ink-dim)]">
                <WorkOrderTypeTag type={order.type} />
                {order.overdue && <OverdueTag />}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Plate className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
              <Th label="Número" column="number" sort={sort} dir={dir} onSort={onSort} />
              <Th label="Orden" sort={sort} dir={dir} onSort={onSort} />
              <Th label="Equipo" sort={sort} dir={dir} onSort={onSort} />
              <Th label="Estado" column="status" sort={sort} dir={dir} onSort={onSort} />
              <Th label="Responsables" sort={sort} dir={dir} onSort={onSort} />
              <Th label="Fecha" column="scheduledFor" sort={sort} dir={dir} onSort={onSort} />
              <Th label="Costo" column="cost" sort={sort} dir={dir} onSort={onSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)]">
                <td className="whitespace-nowrap px-3 py-2.5 font-display tabular text-[var(--content-ink)]">
                  <Link to={orderPath(order)} className="hover:text-accent-ink hover:underline">
                    {formatWorkOrderNumber(order.number)}
                  </Link>
                </td>
                <td className="max-w-[260px] px-3 py-2.5">
                  <Link to={orderPath(order)} className="block truncate font-medium text-[var(--content-ink)] hover:text-accent-ink">
                    {order.title}
                  </Link>
                  <span className="flex items-center gap-2">
                    <WorkOrderTypeTag type={order.type} />
                    {order.ticket && (
                      <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">
                        {formatTicketNumber(order.ticket.number)}
                      </span>
                    )}
                  </span>
                </td>
                <td className="max-w-[200px] px-3 py-2.5">
                  <span className="block font-display text-xs tabular text-[var(--content-ink-dim)]">
                    {formatAssetNumber(order.asset.number)}
                  </span>
                  <span className="block truncate text-[var(--content-ink)]">{order.asset.name}</span>
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
                <td className="px-3 py-2.5 text-xs text-[var(--content-ink-dim)]">
                  <When order={order} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular text-[var(--content-ink)]">
                  {formatMoney(order.costTotal, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Plate>
    </>
  );
}

function GroupedView({
  orders,
  counts,
}: {
  orders: WorkOrderListItem[];
  counts: Record<WorkOrderStatus, number> | undefined;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const groups = WORK_ORDER_STATUSES.map((status) => [status, orders.filter((order) => order.status === status)] as const).filter(
    ([, group]) => group.length > 0,
  );

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([status, group]) => (
        <Plate key={status} className="overflow-hidden">
          <button
            onClick={() => setCollapsed((current) => ({ ...current, [status]: !current[status] }))}
            aria-expanded={!collapsed[status]}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 font-display text-sm font-semibold text-[var(--content-ink)]">
              <WorkOrderStatusBadge status={status} />
              <span className="tabular">{counts?.[status] ?? group.length}</span>
            </span>
            <span className="text-xs text-[var(--content-ink-dim)]">{collapsed[status] ? "Mostrar" : "Ocultar"}</span>
          </button>
          {!collapsed[status] && (
            <ul className="divide-y divide-[var(--content-border)] border-t border-[var(--content-border)]">
              {group.map((order) => (
                <li key={order.id}>
                  <Link to={orderPath(order)} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--content-bg)]">
                    <span className="font-display tabular text-[var(--content-ink)]">{formatWorkOrderNumber(order.number)}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--content-ink)]">{order.title}</span>
                    <span className="hidden truncate text-xs text-[var(--content-ink-dim)] sm:inline">{order.asset.name}</span>
                    {order.overdue && <OverdueTag />}
                    <AvatarStack users={order.assignees} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Plate>
      ))}
    </div>
  );
}

function KanbanView({ orders }: { orders: WorkOrderListItem[] }) {
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {WORK_ORDER_STATUSES.map((status) => {
        const column = orders.filter((order) => order.status === status);
        return (
          <section
            key={status}
            aria-label={WORK_ORDER_STATUS_LABEL[status]}
            className="flex w-72 shrink-0 flex-col gap-2 rounded-2xl border border-[var(--content-border)] bg-[var(--content-bg)] p-2.5"
          >
            <div className="flex items-center justify-between px-1 py-1">
              <span className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--content-ink-dim)]">
                {WORK_ORDER_STATUS_LABEL[status]}
              </span>
              <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">{column.length}</span>
            </div>
            {column.map((order) => (
              <article
                key={order.id}
                className="rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-3 shadow-[var(--content-shadow)]"
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">
                    {formatWorkOrderNumber(order.number)}
                  </span>
                  <WorkOrderTypeTag type={order.type} />
                </div>
                <Link to={orderPath(order)} className="text-sm font-medium text-[var(--content-ink)] hover:underline">
                  {order.title}
                </Link>
                <p className="mt-1 truncate text-xs text-[var(--content-ink-dim)]">
                  {formatAssetNumber(order.asset.number)} · {order.asset.name}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  {order.overdue ? <OverdueTag /> : <span />}
                  <AvatarStack users={order.assignees} />
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
