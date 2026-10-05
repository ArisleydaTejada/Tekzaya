import {
  DEFAULT_REPORT_COLUMNS,
  PRIORITIES,
  PRIORITY_LABEL,
  REPORT_COLUMNS,
  REPORT_COLUMN_LABEL,
  SLA_STATES,
  SLA_STATE_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  formatTicketNumber,
  type ReportColumn,
  type ReportTicketFilters,
  type ReportTicketRow,
  type ReportTicketSort,
} from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listReportTickets, reportKeys, reportTicketsCsvUrl, type ReportScopeRequest } from "../../api/reports";
import { AvatarStack } from "../../components/Avatar";
import { PriorityBadge, SlaTag, StatusBadge, AreaTag } from "../../components/badges";
import { Plate } from "../../components/Plate";
import { DownloadIcon, FilterIcon, SearchIcon, StarIcon, XIcon } from "../../components/icons";
import { formatWhen } from "../../lib/format";

/** La selección de columnas se recuerda entre visitas (spec §7.8.9). */
const COLUMNS_KEY = "tekzaya.reportes.columnas";

type Filters = Partial<ReportTicketFilters>;

/**
 * La lista del §7.8.9: todos los tickets del período y el alcance, **en todos los
 * estados** —también Cerrado, Cancelado y Fusionado, que la lista de trabajo oculta—
 * con filtros avanzados, columnas a elegir y exportación. Comparte alcance y período
 * con las gráficas, así que ambos cuentan siempre lo mismo.
 */
export function TicketsOfPeriod({
  scope,
  filters,
  onFiltersChange,
}: {
  scope: ReportScopeRequest;
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sort, setSort] = useState<ReportTicketSort>("createdAt");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [panelOpen, setPanelOpen] = useState(false);
  const [columns, setColumns] = useState<ReportColumn[]>(() => readColumns());

  useEffect(() => {
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(columns));
    } catch {
      // Sin almacenamiento local la tabla sigue funcionando; solo no se recuerda.
    }
  }, [columns]);

  const query = useMemo(
    () => ({ ...scope, ...clean(filters), page, limit, sort, dir, columns: columns.join(",") }),
    [scope, filters, page, limit, sort, dir, columns],
  );

  // Cambiar un filtro vuelve a la primera página: la tercera página de otro filtro no
  // existe, y quedarse ahí es la forma más rápida de creer que no hay resultados. Se
  // ajusta durante el render y no en un efecto, para no pedir dos veces la misma lista.
  const signature = JSON.stringify([clean(filters), scope, limit]);
  const [lastSignature, setLastSignature] = useState(signature);
  if (signature !== lastSignature) {
    setLastSignature(signature);
    setPage(1);
  }

  const list = useQuery({
    queryKey: reportKeys.tickets(query),
    queryFn: () => listReportTickets(query),
  });

  const chips = activeChips(filters);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / limit)) : 1;

  const toggleSort = (column: ReportTicketSort) => {
    if (sort === column) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(column);
      setDir("desc");
    }
  };

  return (
    <section id="tickets-del-periodo" className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
          Tickets del período
        </h2>
        <div className="no-print flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5">
            <SearchIcon className="h-3.5 w-3.5 text-[var(--content-ink-dim)]" />
            <input
              value={filters.q ?? ""}
              onChange={(event) => onFiltersChange({ ...filters, q: event.target.value || undefined })}
              placeholder="Título o descripción"
              className="w-40 bg-transparent text-xs text-[var(--content-ink)] outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5">
            <span className="text-xs text-[var(--content-ink-dim)]">N.º</span>
            <input
              value={filters.numbers ?? ""}
              onChange={(event) =>
                onFiltersChange({ ...filters, numbers: event.target.value || undefined })
              }
              placeholder="TK-000123, 45"
              className="w-28 bg-transparent text-xs text-[var(--content-ink)] outline-none"
            />
          </div>
          <button
            onClick={() => setPanelOpen((value) => !value)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              panelOpen || chips.length
                ? "border-accent text-accent"
                : "border-[var(--content-border)] text-[var(--content-ink)]"
            }`}
          >
            <FilterIcon className="h-3.5 w-3.5" /> Filtros
            {chips.length > 0 && <span className="tabular">({chips.length})</span>}
          </button>
          <ColumnPicker columns={columns} onChange={setColumns} />
          <a
            href={reportTicketsCsvUrl(query)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
          >
            <DownloadIcon className="h-3.5 w-3.5" /> CSV
          </a>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="no-print mb-3 flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip.key}
              onClick={() => onFiltersChange({ ...filters, [chip.key]: undefined })}
              className="flex items-center gap-1 rounded-full border border-[var(--content-border)] bg-[var(--content-surface)] px-2 py-0.5 text-[11px] text-[var(--content-ink)]"
            >
              {chip.label}
              <XIcon className="h-3 w-3" />
            </button>
          ))}
          <button
            onClick={() => onFiltersChange({})}
            className="text-[11px] font-medium text-accent hover:underline"
          >
            Limpiar filtros
          </button>
        </div>
      )}

      {panelOpen && (
        <FilterPanel filters={filters} onChange={onFiltersChange} onClose={() => setPanelOpen(false)} />
      )}

      <Plate className="print-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {SORTABLE.has(column) ? (
                    <button
                      onClick={() => toggleSort(column as ReportTicketSort)}
                      className="flex items-center gap-1 hover:text-[var(--content-ink)]"
                    >
                      {REPORT_COLUMN_LABEL[column]}
                      {sort === column && <span aria-hidden="true">{dir === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  ) : (
                    REPORT_COLUMN_LABEL[column]
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.isPending &&
              [0, 1, 2, 3, 4].map((index) => (
                <tr key={index} className="border-b border-[var(--content-border)]">
                  <td colSpan={columns.length} className="px-3 py-3">
                    <div className="h-3 animate-pulse rounded bg-[var(--content-bg)]" />
                  </td>
                </tr>
              ))}
            {list.isError && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-[var(--content-ink-dim)]">
                  No se pudo cargar la lista. Prueba a quitar algún filtro o a reducir el período.
                </td>
              </tr>
            )}
            {list.data?.items.map((row) => (
              <tr key={row.id} className="border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)]">
                {columns.map((column) => (
                  <td key={column} className="px-3 py-2.5 align-middle">
                    <Cell row={row} column={column} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {list.data && list.data.items.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm text-[var(--content-ink-dim)]">
              Ningún ticket coincide con los filtros.
            </p>
            <button
              onClick={() => onFiltersChange({})}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </Plate>

      {list.data && list.data.items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--content-ink-dim)]">
          <p>
            <span className="tabular font-medium text-[var(--content-ink)]">{list.data.total}</span>{" "}
            tickets en este período y alcance
            {Object.entries(list.data.byStatus).length > 0 && (
              <>
                {" · "}
                {Object.entries(list.data.byStatus)
                  .map(([status, count]) => `${TICKET_STATUS_LABEL[status as keyof typeof TICKET_STATUS_LABEL]}: ${count}`)
                  .join(" · ")}
              </>
            )}
            {list.data.truncated && " · se alcanzó el techo de 10 000 filas"}
          </p>
          <div className="no-print flex items-center gap-2">
            <select
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

const SORTABLE = new Set<string>([
  "number",
  "title",
  "priority",
  "status",
  "createdAt",
  "resolvedAt",
  "resolutionTime",
  "csat",
]);

function Cell({ row, column }: { row: ReportTicketRow; column: ReportColumn }) {
  switch (column) {
    case "number":
      // Solo es un enlace si la conversación se puede abrir: RRHH ve la ficha de otras
      // áreas, no el hilo (spec §7.8.9). Se abre en otra pestaña para no perder la tabla.
      return row.readable ? (
        <Link
          to={`/tickets/${row.number}`}
          target="_blank"
          className="font-display tabular text-[var(--content-ink)] hover:underline"
        >
          {formatTicketNumber(row.number)}
        </Link>
      ) : (
        <span className="font-display tabular text-[var(--content-ink-dim)]" title="Sin acceso a la conversación">
          {formatTicketNumber(row.number)}
        </span>
      );
    case "title":
      return <span className="block max-w-[260px] truncate text-[var(--content-ink)]">{row.title}</span>;
    case "requester":
      return <span className="text-[var(--content-ink)]">{row.requester.name}</span>;
    case "createdBy":
      return (
        <span className={row.onBehalf ? "text-[var(--content-ink)]" : "text-[var(--content-ink-dim)]"}>
          {row.createdBy.name}
        </span>
      );
    case "area":
      return <AreaTag area={row.area} />;
    case "category":
      return <span className="text-[var(--content-ink-dim)]">{row.categoryName ?? "—"}</span>;
    case "priority":
      return <PriorityBadge priority={row.priority} />;
    case "status":
      return <StatusBadge status={row.status} />;
    case "assignees":
      return row.assignees.length ? <AvatarStack users={row.assignees} /> : <Dash />;
    case "createdAt":
      return <span className="whitespace-nowrap text-[var(--content-ink-dim)]">{formatWhen(row.createdAt)}</span>;
    case "firstResponse":
      return <Hours value={row.firstResponseHours} />;
    case "resolvedAt":
      return (
        <span className="whitespace-nowrap text-[var(--content-ink-dim)]">
          {row.resolvedAt ? formatWhen(row.resolvedAt) : "—"}
        </span>
      );
    case "resolutionTime":
      return <Hours value={row.resolutionHours} />;
    case "slaState":
      return <SlaTag state={row.resolutionState} />;
    case "csat":
      return row.csat ? (
        <span className="inline-flex items-center gap-1 text-[var(--content-ink-dim)]">
          <StarIcon className="h-3 w-3 text-amber" /> {row.csat}
        </span>
      ) : (
        <Dash />
      );
    case "reopened":
      return <span className="text-[var(--content-ink-dim)]">{row.reopened ? "Sí" : "No"}</span>;
    case "incident":
      return (
        <span className="block max-w-[180px] truncate text-[var(--content-ink-dim)]">
          {row.incidentLabel ?? "—"}
        </span>
      );
    case "mergedWith":
      return (
        <span className="tabular text-[var(--content-ink-dim)]">
          {row.mergedIntoNumber
            ? formatTicketNumber(row.mergedIntoNumber)
            : row.mergedCount
              ? `${row.mergedCount} duplicado${row.mergedCount === 1 ? "" : "s"}`
              : "—"}
        </span>
      );
  }
}

const Dash = () => <span className="text-[var(--content-ink-dim)]">—</span>;

function Hours({ value }: { value: number | null }) {
  if (value === null) return <Dash />;
  return <span className="tabular text-[var(--content-ink-dim)]">{value.toFixed(1)} h</span>;
}

// ── Panel de filtros avanzados ────────────────────────────────

function FilterPanel({
  filters,
  onChange,
  onClose,
}: {
  filters: Filters;
  onChange: (filters: Filters) => void;
  onClose: () => void;
}) {
  const set = (patch: Filters) => onChange({ ...filters, ...patch });

  return (
    <Plate className="no-print mb-3 space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Group label="Estado">
          <Multi
            options={TICKET_STATUSES.map((value) => ({ value, label: TICKET_STATUS_LABEL[value] }))}
            selected={filters.statuses ?? []}
            onChange={(values) =>
              set({ statuses: values.length ? (values as ReportTicketFilters["statuses"]) : undefined })
            }
          />
        </Group>
        <Group label="Prioridad">
          <Multi
            options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }))}
            selected={filters.priorities ?? []}
            onChange={(values) =>
              set({ priorities: values.length ? (values as ReportTicketFilters["priorities"]) : undefined })
            }
          />
        </Group>
        <Group label="Estado de SLA">
          <Multi
            options={SLA_STATES.map((value) => ({ value, label: SLA_STATE_LABEL[value] }))}
            selected={filters.slaStates ?? []}
            onChange={(values) =>
              set({ slaStates: values.length ? (values as ReportTicketFilters["slaStates"]) : undefined })
            }
          />
        </Group>
        <Group label="Calificación">
          <Multi
            options={[
              ...["5", "4", "3", "2", "1"].map((value) => ({ value, label: `${value} ★` })),
              { value: "none", label: "Sin calificar" },
            ]}
            selected={filters.csatRatings ?? []}
            onChange={(values) =>
              set({
                csatRatings: values.length ? (values as ReportTicketFilters["csatRatings"]) : undefined,
              })
            }
          />
        </Group>

        <Group label="Fecha de creación">
          <div className="flex items-center gap-1.5">
            <DateInput value={filters.createdFrom} onChange={(value) => set({ createdFrom: value })} />
            <span className="text-xs text-[var(--content-ink-dim)]">a</span>
            <DateInput value={filters.createdTo} onChange={(value) => set({ createdTo: value })} />
          </div>
        </Group>
        <Group label="Fecha de resolución">
          <div className="flex items-center gap-1.5">
            <DateInput value={filters.resolvedFrom} onChange={(value) => set({ resolvedFrom: value })} />
            <span className="text-xs text-[var(--content-ink-dim)]">a</span>
            <DateInput value={filters.resolvedTo} onChange={(value) => set({ resolvedTo: value })} />
          </div>
        </Group>

        <Group label="Tiempo de 1.ª respuesta" hint="horas laborales">
          <Comparison
            op={filters.responseHoursOp}
            value={filters.responseHours}
            onChange={(op, value) => set({ responseHoursOp: op, responseHours: value })}
          />
        </Group>
        <Group label="Tiempo de resolución" hint="horas laborales">
          <Comparison
            op={filters.resolutionHoursOp}
            value={filters.resolutionHours}
            onChange={(op, value) => set({ resolutionHoursOp: op, resolutionHours: value })}
          />
        </Group>
        <Group label="Antigüedad mínima" hint="días">
          <input
            type="number"
            min={0}
            value={filters.ageDaysMin ?? ""}
            onChange={(event) =>
              set({ ageDaysMin: event.target.value ? Number(event.target.value) : undefined })
            }
            className="w-24 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1 text-xs text-[var(--content-ink)]"
          />
        </Group>
      </div>

      <Group label="Características">
        <div className="flex flex-wrap gap-1.5">
          <Flag label="Solo los míos" on={filters.mine} onToggle={(value) => set({ mine: value })} />
          <Flag label="Sin asignar" on={filters.unassigned} onToggle={(value) => set({ unassigned: value })} />
          <Flag
            label="Con adjuntos"
            on={filters.hasAttachments}
            onToggle={(value) => set({ hasAttachments: value })}
          />
          <Flag
            label="En nombre de otra persona"
            on={filters.onBehalf}
            onToggle={(value) => set({ onBehalf: value })}
          />
          <Flag
            label="Varios responsables"
            on={filters.multiAssignee}
            onToggle={(value) => set({ multiAssignee: value })}
          />
          <Flag label="Transferido" on={filters.transferred} onToggle={(value) => set({ transferred: value })} />
          <Flag label="Reabierto" on={filters.reopened} onToggle={(value) => set({ reopened: value })} />
          <Flag
            label="Parte de un incidente"
            on={filters.incident}
            onToggle={(value) => set({ incident: value })}
          />
          <Flag
            label="SLA de respuesta incumplido"
            on={filters.responseBreached}
            onToggle={(value) => set({ responseBreached: value })}
          />
          <Flag
            label="Clasificación pendiente o fallida"
            on={filters.aiPending}
            onToggle={(value) => set({ aiPending: value })}
          />
          <Flag
            label="Prioridad corregida"
            on={filters.priorityCorrected}
            onToggle={(value) => set({ priorityCorrected: value })}
          />
          <select
            value={filters.merged ?? ""}
            onChange={(event) =>
              set({ merged: (event.target.value || undefined) as ReportTicketFilters["merged"] })
            }
            className="rounded-full border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-0.5 text-[11px] text-[var(--content-ink)]"
          >
            <option value="">Fusión: cualquiera</option>
            <option value="duplicate">Es un duplicado</option>
            <option value="principal">Absorbió duplicados</option>
          </select>
        </div>
      </Group>

      <div className="flex justify-end gap-2">
        <button
          onClick={() => onChange({})}
          className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)]"
        >
          Limpiar filtros
        </button>
        <button onClick={onClose} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
          Listo
        </button>
      </div>
    </Plate>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--content-ink-dim)]">
        {label}
        {hint && <span className="ml-1 font-normal normal-case tracking-normal">({hint})</span>}
      </p>
      {children}
    </div>
  );
}

function Multi({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: readonly string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <button
            key={option.value}
            onClick={() =>
              onChange(on ? selected.filter((item) => item !== option.value) : [...selected, option.value])
            }
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              on
                ? "border-accent bg-accent/10 text-accent"
                : "border-[var(--content-border)] text-[var(--content-ink-dim)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DateInput({ value, onChange }: { value?: string; onChange: (value?: string) => void }) {
  return (
    <input
      type="date"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value || undefined)}
      className="rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1 text-xs text-[var(--content-ink)]"
    />
  );
}

function Comparison({
  op,
  value,
  onChange,
}: {
  op?: "gt" | "lt";
  value?: number;
  onChange: (op?: "gt" | "lt", value?: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={op ?? ""}
        onChange={(event) =>
          onChange((event.target.value || undefined) as "gt" | "lt" | undefined, value)
        }
        className="rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1 text-xs text-[var(--content-ink)]"
      >
        <option value="">—</option>
        <option value="gt">más de</option>
        <option value="lt">menos de</option>
      </select>
      <input
        type="number"
        min={0}
        value={value ?? ""}
        onChange={(event) => onChange(op, event.target.value ? Number(event.target.value) : undefined)}
        className="w-20 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1 text-xs text-[var(--content-ink)]"
      />
    </div>
  );
}

function Flag({
  label,
  on,
  onToggle,
}: {
  label: string;
  on?: boolean;
  onToggle: (value: boolean | undefined) => void;
}) {
  return (
    <button
      onClick={() => onToggle(on ? undefined : true)}
      className={`rounded-full border px-2 py-0.5 text-[11px] ${
        on
          ? "border-accent bg-accent/10 text-accent"
          : "border-[var(--content-border)] text-[var(--content-ink-dim)]"
      }`}
    >
      {label}
    </button>
  );
}

function ColumnPicker({
  columns,
  onChange,
}: {
  columns: ReportColumn[];
  onChange: (columns: ReportColumn[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
      >
        Columnas
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} aria-label="Cerrar" />
          <div className="absolute right-0 z-30 mt-1 max-h-72 w-52 overflow-y-auto rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-2 shadow-[var(--content-shadow)]">
            {REPORT_COLUMNS.map((column) => (
              <label
                key={column}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
              >
                <input
                  type="checkbox"
                  checked={columns.includes(column)}
                  onChange={() =>
                    onChange(
                      columns.includes(column)
                        ? // Una tabla sin columnas no es una tabla: la última no se quita.
                          columns.length > 1
                          ? columns.filter((item) => item !== column)
                          : columns
                        : REPORT_COLUMNS.filter((item) => columns.includes(item) || item === column),
                    )
                  }
                />
                {REPORT_COLUMN_LABEL[column]}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Utilidades ────────────────────────────────────────────────

function readColumns(): ReportColumn[] {
  try {
    const stored = localStorage.getItem(COLUMNS_KEY);
    if (!stored) return DEFAULT_REPORT_COLUMNS;
    const parsed = JSON.parse(stored) as string[];
    const valid = parsed.filter((item): item is ReportColumn =>
      (REPORT_COLUMNS as readonly string[]).includes(item),
    );
    return valid.length ? valid : DEFAULT_REPORT_COLUMNS;
  } catch {
    return DEFAULT_REPORT_COLUMNS;
  }
}

/** Fuera lo vacío: un filtro sin valor no debe viajar en la URL ni en la clave de caché. */
function clean(filters: Filters): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) continue;
    result[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return result;
}

const CHIP_LABEL: Record<string, string> = {
  q: "Texto",
  numbers: "Número",
  statuses: "Estado",
  priorities: "Prioridad",
  slaStates: "SLA",
  csatRatings: "CSAT",
  createdFrom: "Creado desde",
  createdTo: "Creado hasta",
  resolvedFrom: "Resuelto desde",
  resolvedTo: "Resuelto hasta",
  responseHours: "1.ª respuesta",
  resolutionHours: "T. resolución",
  ageDaysMin: "Antigüedad",
  mine: "Solo los míos",
  unassigned: "Sin asignar",
  hasAttachments: "Con adjuntos",
  onBehalf: "En nombre de otro",
  multiAssignee: "Varios responsables",
  transferred: "Transferido",
  reopened: "Reabierto",
  incident: "Incidente",
  responseBreached: "SLA de respuesta incumplido",
  aiPending: "Clasificación pendiente",
  priorityCorrected: "Prioridad corregida",
  merged: "Fusión",
  // Filtros por identificador: los pone sobre todo el clic en una gráfica (spec §7.8.2).
  // Llevan etiqueta pero no valor, porque un `ObjectId` en una chip no dice nada; lo que
  // importa es que se vea que están puestos y que se puedan quitar de uno en uno.
  assigneeIds: "Encargado",
  requesterId: "Solicitante",
  createdById: "Creado por",
  areaIds: "Área",
  categoryIds: "Categoría",
};

/** Los que no se muestran con su valor, porque su valor es un identificador. */
const OPAQUE = new Set(["assigneeIds", "requesterId", "createdById", "areaIds", "categoryIds"]);

function activeChips(filters: Filters): { key: string; label: string }[] {
  return Object.entries(filters)
    .filter(([key, value]) => CHIP_LABEL[key] && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key,
      label:
        typeof value === "boolean" || OPAQUE.has(key)
          ? CHIP_LABEL[key]!
          : `${CHIP_LABEL[key]}: ${Array.isArray(value) ? value.join(", ") : value}`,
    }));
}
