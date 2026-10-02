import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  formatTicketNumber,
  PRIORITIES,
  PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  type Priority,
  type TicketListItem,
  type TicketListQuery,
  type TicketScope,
  type TicketStatus,
} from "@tekzaya/shared";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ticketsCsvUrl } from "../api/stats";
import { listTickets, ticketKeys, updateTicket } from "../api/tickets";
import { AvatarStack } from "../components/Avatar";
import { AreaTag, PriorityBadge, SlaTag, StatusBadge } from "../components/badges";
import {
  AlertIcon,
  DownloadIcon,
  GroupIcon,
  KanbanIcon,
  ListIcon,
  PaperclipIcon,
  SearchIcon,
} from "../components/icons";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { formatWhen } from "../lib/format";

type ViewMode = "lista" | "grupos" | "kanban";

const TABS: { scope: TicketScope; label: string }[] = [
  { scope: "mine", label: "Mis solicitudes" },
  { scope: "assigned", label: "Asignados a mí" },
  { scope: "area", label: "Mi área" },
  { scope: "unassigned", label: "Sin asignar" },
  { scope: "all", label: "Todos" },
];

const FILTER_STATUSES: TicketStatus[] = [
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "resolved",
  "closed",
  "cancelled",
];

const KANBAN_STATUSES: TicketStatus[] = [
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "resolved",
];

const PAGE_SIZE = 25;

export default function TicketsPage() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<TicketScope>("area");
  const [view, setView] = useState<ViewMode>("lista");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [page, setPage] = useState(1);
  const [moveError, setMoveError] = useState<string | null>(null);

  const query: Partial<TicketListQuery> = {
    scope,
    page,
    limit: view === "kanban" ? 100 : PAGE_SIZE,
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(statusFilter ? { status: [statusFilter] } : {}),
    ...(priorityFilter ? { priority: [priorityFilter] } : {}),
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ticketKeys.list(query),
    queryFn: () => listTickets(query),
    placeholderData: (previous) => previous,
  });

  // Los contadores de las pestañas son la misma consulta pidiendo una sola fila:
  // lo que interesa de la respuesta es el total, no los tickets.
  const counts = useQueries({
    queries: TABS.map((tab) => ({
      queryKey: [...ticketKeys.list({ scope: tab.scope, limit: 1 }), "count"],
      queryFn: () => listTickets({ scope: tab.scope, limit: 1 }),
      staleTime: 30_000,
    })),
  });

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setPriorityFilter("");
    setPage(1);
  }

  function changeScope(next: TicketScope) {
    setScope(next);
    setPage(1);
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / (query.limit ?? PAGE_SIZE)));

  async function moveTo(ticket: TicketListItem, status: TicketStatus, note?: string) {
    setMoveError(null);
    try {
      await updateTicket(ticket.id, { status, ...(note ? { note } : {}) });
      await queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    } catch (cause) {
      // El tablero vuelve solo a su sitio: la tarjeta nunca se movió en la base.
      setMoveError(cause instanceof Error ? cause.message : "No se pudo mover el ticket");
    }
  }

  return (
    <div>
      <PageHeader
        title="Tickets"
        actions={
          /*
           * El CSV lo arma el servidor con los filtros actuales, no el navegador:
           * aquí solo está la página que se está viendo, y el archivo tiene que
           * traer todo lo que coincide. Es también lo que garantiza que la
           * exportación nunca lleve notas internas (spec §7.2.4).
           */
          <a
            href={ticketsCsvUrl(query)}
            className={`flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] ${
              total === 0 ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <DownloadIcon className="h-3.5 w-3.5" /> Exportar CSV
          </a>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--content-border)]">
        {TABS.map((tab, index) => (
          <button
            key={tab.scope}
            onClick={() => changeScope(tab.scope)}
            className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
              scope === tab.scope
                ? "text-accent"
                : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            }`}
          >
            {tab.label}
            <span className="rounded-full bg-[var(--content-surface)] px-1.5 py-0.5 font-display text-[10px] tabular">
              {counts[index]?.data?.total ?? "—"}
            </span>
            {scope === tab.scope && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] max-w-xs flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-ink-dim)]" />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por número o título…"
            className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] py-2 pl-9 pr-3 text-sm text-[var(--content-ink)] outline-none placeholder:text-[var(--content-ink-dim)] focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as TicketStatus | "");
            setPage(1);
          }}
          className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
        >
          <option value="">Todos los estados</option>
          {FILTER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {TICKET_STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(event) => {
            setPriorityFilter(event.target.value as Priority | "");
            setPage(1);
          }}
          className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
        >
          <option value="">Toda prioridad</option>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {PRIORITY_LABEL[priority]}
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
              onClick={() => {
                setView(id);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === id
                  ? "bg-accent text-white"
                  : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {id}
            </button>
          ))}
        </div>
      </div>

      {moveError && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red"
        >
          {moveError}
        </div>
      )}

      {isError ? (
        <Plate className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-red">
            {error instanceof Error ? error.message : "No se pudieron cargar los tickets."}
          </p>
        </Plate>
      ) : isLoading ? (
        <Plate className="flex items-center justify-center py-16">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
            aria-label="Cargando tickets"
          />
        </Plate>
      ) : items.length === 0 ? (
        <Plate className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-[var(--content-ink-dim)]">
            Ningún ticket coincide con los filtros.
          </p>
          <button
            onClick={resetFilters}
            className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
          >
            Limpiar filtros
          </button>
        </Plate>
      ) : view === "lista" ? (
        <ListView tickets={items} />
      ) : view === "grupos" ? (
        <GroupedView tickets={items} />
      ) : (
        <KanbanView tickets={items} onMove={moveTo} />
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--content-ink-dim)]">
          Mostrando {items.length} de {total} tickets.
        </p>
        {view !== "kanban" && lastPage > 1 && (
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
    </div>
  );
}

function TicketLink({ ticket }: { ticket: TicketListItem }) {
  return (
    <Link
      to={`/tickets/${formatTicketNumber(ticket.number)}`}
      className="flex min-w-0 items-center gap-1.5 hover:underline"
    >
      <span className="truncate">{ticket.title}</span>
      {ticket.attachmentsCount > 0 && (
        <PaperclipIcon className="h-3.5 w-3.5 shrink-0 text-[var(--content-ink-dim)]" />
      )}
    </Link>
  );
}

function ListView({ tickets }: { tickets: TicketListItem[] }) {
  return (
    <Plate className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
            <th className="px-3 py-2.5 font-medium">ID</th>
            <th className="px-3 py-2.5 font-medium">Título</th>
            <th className="px-3 py-2.5 font-medium">Solicitante</th>
            <th className="px-3 py-2.5 font-medium">Área / categoría</th>
            <th className="px-3 py-2.5 font-medium">Prioridad</th>
            <th className="px-3 py-2.5 font-medium">Responsables</th>
            <th className="px-3 py-2.5 font-medium">Estado</th>
            <th className="px-3 py-2.5 font-medium">SLA</th>
            <th className="px-3 py-2.5 font-medium">Creado</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              className="border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)]"
            >
              <td className="px-3 py-2.5 font-display tabular text-[var(--content-ink)]">
                {formatTicketNumber(ticket.number)}
              </td>
              <td className="max-w-[220px] px-3 py-2.5 text-[var(--content-ink)]">
                <TicketLink ticket={ticket} />
                {ticket.incidentLabel && (
                  <span
                    title={`Incidente: ${ticket.incidentLabel}`}
                    className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-amber"
                  >
                    <AlertIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate">{ticket.incidentLabel}</span>
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-[var(--content-ink-dim)]">
                {ticket.requester.name}
              </td>
              <td className="px-3 py-2.5">
                <AreaTag area={ticket.area} />
                {ticket.categoryName && (
                  <span className="ml-1.5 text-xs text-[var(--content-ink-dim)]">
                    {ticket.categoryName}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td className="px-3 py-2.5">
                {ticket.assignees.length ? (
                  <AvatarStack users={ticket.assignees} />
                ) : (
                  <span className="text-xs text-[var(--content-ink-dim)]">Sin asignar</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={ticket.status} />
              </td>
              <td className="px-3 py-2.5">
                <SlaTag state={ticket.resolutionState} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[var(--content-ink-dim)]">
                {formatWhen(ticket.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Plate>
  );
}

function GroupedView({ tickets }: { tickets: TicketListItem[] }) {
  const groups = useMemo(() => {
    const map = new Map<TicketStatus, TicketListItem[]>();
    for (const ticket of tickets) {
      map.set(ticket.status, [...(map.get(ticket.status) ?? []), ticket]);
    }
    return [...map.entries()];
  }, [tickets]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([status, group]) => (
        <Plate key={status} className="overflow-hidden">
          <button
            onClick={() => setCollapsed((current) => ({ ...current, [status]: !current[status] }))}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
              <StatusBadge status={status} /> {group.length}
            </span>
            <span className="text-xs text-[var(--content-ink-dim)]">
              {collapsed[status] ? "Mostrar" : "Ocultar"}
            </span>
          </button>
          {!collapsed[status] && (
            <ul className="divide-y divide-[var(--content-border)] border-t border-[var(--content-border)]">
              {group.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    to={`/tickets/${formatTicketNumber(ticket.number)}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--content-bg)]"
                  >
                    <span className="font-display tabular text-[var(--content-ink)]">
                      {formatTicketNumber(ticket.number)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[var(--content-ink)]">
                      {ticket.title}
                    </span>
                    <PriorityBadge priority={ticket.priority} />
                    <AvatarStack users={ticket.assignees} />
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

function KanbanCard({ ticket }: { ticket: TicketListItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
  });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab touch-none rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-3 shadow-[var(--content-shadow)] active:cursor-grabbing ${
        isDragging ? "z-20 opacity-90" : ""
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">
          {formatTicketNumber(ticket.number)}
        </span>
        <PriorityBadge priority={ticket.priority} />
      </div>
      <Link
        to={`/tickets/${formatTicketNumber(ticket.number)}`}
        onClick={(event) => event.stopPropagation()}
        className="text-sm font-medium text-[var(--content-ink)] hover:underline"
      >
        {ticket.title}
      </Link>
      {ticket.incidentLabel && (
        <p className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber">
          <AlertIcon className="h-3 w-3 shrink-0" />
          <span className="truncate">{ticket.incidentLabel}</span>
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <AreaTag area={ticket.area} />
        <SlaTag state={ticket.resolutionState} />
      </div>
      {ticket.assignees.length > 0 && (
        <div className="mt-2">
          <AvatarStack users={ticket.assignees} />
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ status, tickets }: { status: TicketStatus; tickets: TicketListItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col gap-2 rounded-2xl border p-2.5 transition-colors ${
        isOver ? "border-accent bg-accent/5" : "border-[var(--content-border)] bg-[var(--content-bg)]"
      }`}
    >
      <div className="flex items-center justify-between px-1 py-1">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--content-ink-dim)]">
          {TICKET_STATUS_LABEL[status]}
        </span>
        <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">
          {tickets.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {tickets.map((ticket) => (
          <KanbanCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
    </div>
  );
}

function KanbanView({
  tickets,
  onMove,
}: {
  tickets: TicketListItem[];
  onMove: (ticket: TicketListItem, status: TicketStatus, note?: string) => Promise<void>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [pendingResolve, setPendingResolve] = useState<TicketListItem | null>(null);
  const [note, setNote] = useState("");

  function handleDragEnd(event: DragEndEvent) {
    const target = event.over?.id as TicketStatus | undefined;
    if (!target) return;
    const ticket = tickets.find((item) => item.id === event.active.id);
    if (!ticket || ticket.status === target) return;

    // Resolver exige contar cómo se resolvió; el servidor rechaza el cambio sin
    // nota, así que se pide antes de enviarlo.
    if (target === "resolved") {
      setPendingResolve(ticket);
      return;
    }
    void onMove(ticket, target);
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {KANBAN_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tickets={tickets.filter((ticket) => ticket.status === status)}
            />
          ))}
        </div>
      </DndContext>

      <Modal
        open={pendingResolve !== null}
        onClose={() => setPendingResolve(null)}
        title={`Resolver ${pendingResolve ? formatTicketNumber(pendingResolve.number) : ""}`}
        footer={
          <>
            <button
              onClick={() => setPendingResolve(null)}
              className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (pendingResolve) void onMove(pendingResolve, "resolved", note.trim());
                setPendingResolve(null);
                setNote("");
              }}
              disabled={note.trim().length < 3}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Marcar como resuelto
            </button>
          </>
        }
      >
        <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
          Nota de solución (obligatoria)
        </label>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="¿Cómo se resolvió el problema?"
          className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] p-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
        />
      </Modal>
    </>
  );
}
