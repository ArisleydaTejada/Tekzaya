import {
  formatAssetNumber,
  formatMoney,
  formatTicketNumber,
  formatWorkOrderNumber,
  WORK_ORDER_STATUS_LABEL,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPE_LABEL,
  WORK_ORDER_TYPES,
  type WorkOrderListItem,
  type WorkOrderSort,
  type WorkOrderStatus,
  type WorkOrderType,
} from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listReportWorkOrders, reportKeys, type ReportScopeRequest } from "../../api/reports";
import { AvatarStack } from "../../components/Avatar";
import { Plate } from "../../components/Plate";
import { SearchIcon, XIcon } from "../../components/icons";
import { OverdueTag, WorkOrderStatusBadge, WorkOrderTypeTag } from "../../components/workOrders";
import { formatDateTime, formatDay, formatWhen } from "../../lib/format";
import { oneOf } from "../../lib/oneOf";

/** Filtros de la lista que una gráfica puede fijar al pulsarla. */
export interface WorkOrderListFilters {
  q?: string;
  status?: WorkOrderStatus;
  type?: WorkOrderType;
}

const orderPath = (order: { number: number }) => `/ordenes/${formatWorkOrderNumber(order.number)}`;

/**
 * La lista de debajo de un reporte de mantenimiento: las órdenes que tocaron el
 * período —creadas, completadas o canceladas dentro, y las que siguen abiertas—
 * con el mismo alcance que las gráficas. Es la contraparte de "Tickets del
 * período": abajo se ve lo que arriba se cuenta.
 */
export function WorkOrdersOfPeriod({
  scope,
  filters,
  onFiltersChange,
}: {
  scope: ReportScopeRequest;
  filters: WorkOrderListFilters;
  onFiltersChange: (filters: WorkOrderListFilters) => void;
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<WorkOrderSort>("number");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const query = useMemo(
    () => ({
      ...scope,
      q: filters.q || undefined,
      status: filters.status || undefined,
      type: filters.type || undefined,
      page,
      limit,
      sort,
      dir,
    }),
    [scope, filters, page, limit, sort, dir],
  );

  // Otro filtro u otro alcance vuelven a la primera página, igual que en la de tickets.
  const signature = JSON.stringify([filters, scope, limit]);
  const [lastSignature, setLastSignature] = useState(signature);

  if (signature !== lastSignature) {
    setLastSignature(signature);
    setPage(1);
  }

  const list = useQuery({
    queryKey: reportKeys.workOrders(query),
    queryFn: () => listReportWorkOrders(query),
  });

  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / limit)) : 1;
  const hasFilters = Boolean(filters.q || filters.status || filters.type);

  const toggleSort = (column: WorkOrderSort) => {
    if (sort === column) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(column);
      setDir("desc");
    }
  };

  const selectClass =
    "rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2 py-1.5 text-xs text-[var(--content-ink)]";

  return (
    <section id="ordenes-del-periodo" className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
          Órdenes de trabajo del período
        </h2>
        <div className="no-print flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5">
            <SearchIcon className="h-3.5 w-3.5 text-[var(--content-ink-dim)]" />
            <input
              value={filters.q ?? ""}
              onChange={(event) => onFiltersChange({ ...filters, q: event.target.value || undefined })}
              placeholder="OT-0012 o título"
              aria-label="Buscar órdenes"
              className="w-40 bg-transparent text-xs text-[var(--content-ink)] outline-none"
            />
          </div>
          <select
            aria-label="Estado de la orden"
            value={filters.status ?? ""}
            onChange={(event) =>
              onFiltersChange({ ...filters, status: oneOf(WORK_ORDER_STATUSES, event.target.value) })
            }
            className={selectClass}
          >
            <option value="">Todos los estados</option>
            {WORK_ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {WORK_ORDER_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
          <select
            aria-label="Tipo de orden"
            value={filters.type ?? ""}
            onChange={(event) =>
              onFiltersChange({ ...filters, type: oneOf(WORK_ORDER_TYPES, event.target.value) })
            }
            className={selectClass}
          >
            <option value="">Correctivas y preventivas</option>
            {WORK_ORDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {WORK_ORDER_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={() => onFiltersChange({})}
              className="flex items-center gap-1 text-xs text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            >
              <XIcon className="h-3 w-3" /> Quitar filtros
            </button>
          )}
        </div>
      </div>

      <p className="mb-3 text-xs text-[var(--content-ink-dim)]">
        Creadas, completadas o canceladas en el período, y las que siguen abiertas.
      </p>

      {list.isPending ? (
        <Plate className="h-40 animate-pulse" />
      ) : list.isError ? (
        <Plate className="py-10 text-center text-sm text-[var(--content-ink-dim)]">
          {list.error instanceof Error ? list.error.message : "No se pudo cargar la lista."}
        </Plate>
      ) : list.data.items.length === 0 ? (
        <Plate className="py-10 text-center text-sm text-[var(--content-ink-dim)]">
          {hasFilters ? "Ninguna orden coincide con los filtros." : "No hubo órdenes de trabajo en este período."}
        </Plate>
      ) : (
        <Plate className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
                <Th label="Número" column="number" sort={sort} dir={dir} onSort={toggleSort} />
                <Th label="Orden" sort={sort} dir={dir} onSort={toggleSort} />
                <Th label="Equipo" sort={sort} dir={dir} onSort={toggleSort} />
                <Th label="Área" sort={sort} dir={dir} onSort={toggleSort} />
                <Th label="Estado" column="status" sort={sort} dir={dir} onSort={toggleSort} />
                <Th label="Responsables" sort={sort} dir={dir} onSort={toggleSort} />
                <Th label="Fecha" column="scheduledFor" sort={sort} dir={dir} onSort={toggleSort} />
                <Th label="Costo" column="cost" sort={sort} dir={dir} onSort={toggleSort} className="text-right" />
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((order) => (
                <Row key={order.id} order={order} currency={list.data.currency} />
              ))}
            </tbody>
          </table>
        </Plate>
      )}

      {list.data && list.data.total > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--content-ink-dim)]">
          <p>
            {list.data.total} orden{list.data.total === 1 ? "" : "es"} ·{" "}
            {Object.entries(list.data.statusCounts)
              .flatMap(([status, count]) => {
                const known = oneOf(WORK_ORDER_STATUSES, status);

                return count > 0 ? [`${known ? WORK_ORDER_STATUS_LABEL[known] : status}: ${count}`] : [];
              })
              .join(" · ")}
          </p>
          <div className="no-print flex items-center gap-2">
            <select
              aria-label="Filas por página"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2 py-1 text-xs text-[var(--content-ink)]"
            >
              {[25, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value} por página
                </option>
              ))}
            </select>
            <button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              className="rounded-lg border border-[var(--content-border)] px-2 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="tabular">
              {page} / {pages}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
              className="rounded-lg border border-[var(--content-border)] px-2 py-1 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({ order, currency }: { order: WorkOrderListItem; currency: string }) {
  return (
    <tr className="border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)]">
      <td className="whitespace-nowrap px-3 py-2.5 font-display tabular text-[var(--content-ink)]">
        {/* En otra pestaña, como los tickets: abrir una orden no debe perder el reporte. */}
        <Link to={orderPath(order)} target="_blank" className="hover:text-accent-ink hover:underline">
          {formatWorkOrderNumber(order.number)}
        </Link>
      </td>
      <td className="max-w-[260px] px-3 py-2.5">
        <Link
          to={orderPath(order)}
          target="_blank"
          className="block truncate font-medium text-[var(--content-ink)] hover:text-accent-ink"
        >
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
      <td className="px-3 py-2.5 text-xs text-[var(--content-ink)]">{order.area.name}</td>
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
        {order.scheduledFor ? (
          <span className="flex flex-col">
            <span>Para el {formatDay(order.scheduledFor)}</span>
            {order.overdue && <OverdueTag />}
          </span>
        ) : (
          <span title={formatDateTime(order.createdAt)}>Abierta {formatWhen(order.createdAt).toLowerCase()}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular text-[var(--content-ink)]">
        {formatMoney(order.costTotal, currency)}
      </td>
    </tr>
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
