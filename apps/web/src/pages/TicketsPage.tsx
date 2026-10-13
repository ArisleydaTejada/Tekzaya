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
  ACTIVE_TICKET_STATUSES,
  formatTicketNumber,
  isSettledStatus,
  isSupervisorOf,
  PRIORITIES,
  SETTLED_TICKET_STATUSES,
  PRIORITY_LABEL,
  TICKET_STATUS_LABEL,
  type MeResponse,
  type Priority,
  type TicketListItem,
  type TicketListQuery,
  type TicketScope,
  type TicketSort,
  type TicketStatus,
} from "@tekzaya/shared";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ticketsCsvUrl } from "../api/stats";
import {
  areaKeys,
  listAreaWorkload,
  listTickets,
  mergeTickets,
  setAssignees,
  takeTicket,
  ticketKeys,
  updateTicket,
} from "../api/tickets";
import { useAuth } from "../auth/AuthContext";
import { Avatar, AvatarStack } from "../components/Avatar";
import { AreaTag, PriorityBadge, StatusBadge } from "../components/badges";
import { SlaTimeline } from "../components/SlaTimeline";
import {
  AlertIcon,
  DownloadIcon,
  GroupIcon,
  KanbanIcon,
  ListIcon,
  MergeIcon,
  PaperclipIcon,
  SearchIcon,
  StarIcon,
  UserPlusIcon,
} from "../components/icons";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { formatWhen } from "../lib/format";

type ViewMode = "lista" | "grupos" | "kanban";

/**
 * Lo que está sin repartir abre la fila porque es lo único que nadie está
 * mirando todavía; después, lo propio de cada quien. "Mis solicitudes" baja a
 * donde estaba "Sin asignar": es la pestaña del otro sombrero —cuando uno pide
 * en vez de atender— y no compite con la bandeja de trabajo.
 *
 * "Resueltos" cierra la serie antes de "Todos": es el archivo, y se consulta
 * cuando ya se sabe lo que se busca.
 */
const TABS: { scope: TicketScope; label: string }[] = [
  { scope: "unassigned", label: "Sin asignar" },
  { scope: "assigned", label: "Asignados a mí" },
  { scope: "area", label: "Mi área" },
  { scope: "mine", label: "Mis solicitudes" },
  { scope: "settled", label: "Resueltos" },
  { scope: "all", label: "Todos" },
];

/**
 * El desplegable de estado solo ofrece lo que la pestaña puede contener. En una
 * bandeja de trabajo, elegir "Cerrado" devolvía una lista vacía sin explicar por
 * qué: el alcance ya había descartado los cerrados antes de llegar al filtro.
 */
function statusOptionsFor(scope: TicketScope): readonly TicketStatus[] {
  if (scope === "settled") return SETTLED_TICKET_STATUSES;
  if (scope === "mine" || scope === "all") return ALL_FILTER_STATUSES;
  return ACTIVE_TICKET_STATUSES;
}

const ALL_FILTER_STATUSES: TicketStatus[] = [
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

/**
 * Qué hacer con quien ya atendía el ticket. `setAssignees` sustituye la lista
 * entera, así que "sumar" es cosa del cliente: se envía la unión de los de antes
 * y los nuevos. No hay un endpoint que añada, y tampoco hace falta.
 */
type AssignMode = "add" | "replace";

export default function TicketsPage() {
  const queryClient = useQueryClient();
  const { me } = useAuth();
  const [scope, setScope] = useState<TicketScope>("area");
  const [view, setView] = useState<ViewMode>("lista");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<Priority | "">("");
  const [page, setPage] = useState(1);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [sort, setSort] = useState<TicketSort>("sla");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  // Los tickets marcados, por id. Se guardan sueltos y no como indices de la
  // pagina: cambiar de pagina o de orden no debe deshacer lo ya marcado.
  const [selected, setSelected] = useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const query: Partial<TicketListQuery> = {
    scope,
    page,
    limit: view === "kanban" ? 100 : PAGE_SIZE,
    sort,
    dir,
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
    setSelected([]);
    // El estado elegido puede no existir en la pestaña de destino —"Cerrado" al
    // saltar de Resueltos a Mi área—, y arrastrarlo dejaría la tabla vacía.
    if (statusFilter && !statusOptionsFor(next).includes(statusFilter)) setStatusFilter("");
  }

  /**
   * Pulsar una cabecera ordena por ella; pulsarla otra vez da la vuelta. El
   * servidor es quien ordena, porque la tabla esta paginada y reordenar las 25
   * filas visibles no es reordenar los tickets que hay detras.
   */
  function sortBy(column: TicketSort) {
    if (sort === column) {
      setDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSort(column);
      setDir("asc");
    }
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

  /**
   * Mover una tarjeta a «Asignado» es asignarla, no solo cambiarle la etiqueta:
   * quien la arrastra se la queda. El estado lo pone el servidor al guardar los
   * responsables, así que no hace falta un segundo PATCH detrás.
   */
  async function takeOnDrop(ticket: TicketListItem) {
    setMoveError(null);
    try {
      await takeTicket(ticket.id);
      await queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    } catch (cause) {
      setMoveError(cause instanceof Error ? cause.message : "No se pudo asignar el ticket");
    }
  }

  /** Lo mismo, pero el supervisor elige a quién en vez de quedárselo. */
  async function assignOnDrop(ticket: TicketListItem, assigneeIds: string[]) {
    setMoveError(null);
    try {
      await setAssignees(ticket.id, { assigneeIds });
      await queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    } catch (cause) {
      setMoveError(cause instanceof Error ? cause.message : "No se pudo asignar el ticket");
    }
  }

  const picked = items.filter((ticket) => selected.includes(ticket.id));

  /**
   * Quedarse los tickets marcados. Van de uno en uno porque el servidor asigna
   * ticket a ticket; si alguno se cae, lo que ya se asignó sigue asignado y el
   * aviso dice cuál falló en vez de fingir que no pasó nada.
   */
  async function takeSelected() {
    setMoveError(null);
    for (const ticket of picked) {
      try {
        await takeTicket(ticket.id);
      } catch (cause) {
        setMoveError(
          `${formatTicketNumber(ticket.number)}: ${
            cause instanceof Error ? cause.message : "no se pudo asignar"
          }`,
        );
        break;
      }
    }
    setSelected([]);
    await queryClient.invalidateQueries({ queryKey: ticketKeys.all });
  }

  /** Lo mismo para el supervisor, con la gente que eligió en el modal. */
  async function assignSelected(assigneeIds: string[], mode: AssignMode) {
    setMoveError(null);
    for (const ticket of picked) {
      try {
        // "Sumar" se resuelve ticket a ticket, porque cada uno parte de los suyos.
        const next =
          mode === "add"
            ? [...new Set([...ticket.assignees.map((person) => person.id), ...assigneeIds])]
            : assigneeIds;
        await setAssignees(ticket.id, { assigneeIds: next });
      } catch (cause) {
        setMoveError(
          `${formatTicketNumber(ticket.number)}: ${
            cause instanceof Error ? cause.message : "no se pudo asignar"
          }`,
        );
        break;
      }
    }
    setAssignOpen(false);
    setSelected([]);
    await queryClient.invalidateQueries({ queryKey: ticketKeys.all });
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
          {statusOptionsFor(scope).map((status) => (
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

      {view === "lista" && selected.length > 0 && (
        <SelectionBar
          tickets={items}
          selected={selected}
          me={me}
          onClear={() => setSelected([])}
          onMerge={() => setMergeOpen(true)}
          onAssign={() => setAssignOpen(true)}
          onTake={() => void takeSelected()}
        />
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
        <ListView
          tickets={items}
          sort={sort}
          dir={dir}
          onSort={sortBy}
          selected={selected}
          onSelectedChange={setSelected}
        />
      ) : view === "grupos" ? (
        <GroupedView tickets={items} />
      ) : (
        <KanbanView
          tickets={items}
          me={me}
          onMove={moveTo}
          onTake={takeOnDrop}
          onAssign={assignOnDrop}
        />
      )}

      <AssignTicketsModal
        tickets={assignOpen ? picked : []}
        me={me}
        onClose={() => setAssignOpen(false)}
        onConfirm={assignSelected}
      />

      <MergeSelectionModal
        open={mergeOpen}
        tickets={picked}
        onClose={() => setMergeOpen(false)}
        onDone={async () => {
          setMergeOpen(false);
          setSelected([]);
          await queryClient.invalidateQueries({ queryKey: ticketKeys.all });
        }}
      />

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

/**
 * Barra de lo marcado. Aparece con el primer ticket seleccionado y se queda
 * hasta que se limpia: mientras haya algo marcado hay una acción pendiente.
 *
 * Fusionar necesita dos — uno absorbe y el otro se cierra dentro. Con uno solo,
 * el botón sigue a la vista pero apagado y diciendo por qué, en vez de aparecer
 * de la nada al marcar el segundo.
 *
 * Repartir trabajo es la otra cosa que se hace sobre varios tickets a la vez, y
 * depende de quién mira: el supervisor del área y el administrador eligen a
 * quién —ese botón abre el mismo reparto de siempre—, y el resto del área solo
 * puede quedárselos, que es lo que dice su botón (spec §7.4).
 */
function SelectionBar({
  tickets,
  selected,
  me,
  onClear,
  onMerge,
  onAssign,
  onTake,
}: {
  tickets: TicketListItem[];
  selected: string[];
  me: MeResponse | null;
  onClear: () => void;
  onMerge: () => void;
  onAssign: () => void;
  onTake: () => void;
}) {
  const picked = tickets.filter((ticket) => selected.includes(ticket.id));
  // Lo que no está en esta página no se puede comprobar aquí; el servidor lo
  // vuelve a validar entero antes de fusionar ni asignar nada.
  const areas = new Set(picked.map((ticket) => ticket.area.id));
  const settled = picked.filter((ticket) => isSettledStatus(ticket.status));

  const problem =
    selected.length < 2
      ? "Marca al menos dos tickets para fusionarlos"
      : areas.size > 1
        ? "Solo se fusionan tickets de la misma área; transfiere primero uno de ellos"
        : settled.length > 0
          ? `${formatTicketNumber(settled[0]!.number)} ya está cerrado y no se puede fusionar`
          : null;

  // Quien supervisa todas las áreas marcadas reparte; quien solo pertenece a
  // ellas se los queda. El administrador entra por las dos puertas.
  const supervises = picked.length > 0 && Boolean(me) && picked.every((ticket) => isSupervisorOf(me!, ticket.area.id));
  const belongs =
    picked.length > 0 &&
    Boolean(me) &&
    picked.every((ticket) => me!.role === "admin" || ticket.area.id === me!.areaId);

  const assignProblem =
    settled.length > 0
      ? `${formatTicketNumber(settled[0]!.number)} ya está cerrado y no se puede asignar`
      : supervises && areas.size > 1
        ? "Solo se asignan juntos tickets de la misma área"
        : null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2">
      <span className="text-sm font-medium text-[var(--content-ink)]">
        {selected.length} {selected.length === 1 ? "ticket seleccionado" : "tickets seleccionados"}
      </span>
      <button
        onClick={onMerge}
        disabled={problem !== null}
        title={problem ?? "Fusionar los tickets marcados"}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MergeIcon className="h-3.5 w-3.5" /> Fusionar tickets
      </button>
      {(supervises || belongs) && (
        <button
          onClick={supervises ? onAssign : onTake}
          disabled={assignProblem !== null}
          title={
            assignProblem ??
            (supervises ? "Elegir quién atiende los tickets marcados" : "Quedarte los tickets marcados")
          }
          className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <UserPlusIcon className="h-3.5 w-3.5" /> {supervises ? "Asignar" : "Asignármelo"}
        </button>
      )}
      {problem && selected.length >= 2 && <span className="text-xs text-amber">{problem}</span>}
      {assignProblem && <span className="text-xs text-amber">{assignProblem}</span>}
      <button
        onClick={onClear}
        className="ml-auto text-xs font-medium text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
      >
        Limpiar selección
      </button>
    </div>
  );
}

/**
 * Fusionar lo que se marcó en la tabla. Lo único que esta pantalla tiene que
 * preguntar, y la lista no sabe, es cuál de los marcados es el principal: el que
 * se queda abierto y absorbe a los demás. Por defecto, el más antiguo, que suele
 * ser el que ya lleva conversación encima.
 */
function MergeSelectionModal({
  open,
  tickets,
  onClose,
  onDone,
}: {
  open: boolean;
  tickets: TicketListItem[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const oldest = [...tickets].sort((a, b) => a.number - b.number)[0];
  const [principalId, setPrincipalId] = useState("");
  const [reason, setReason] = useState("");
  const [addAssignees, setAddAssignees] = useState(true);
  const [notifyRequesters, setNotifyRequesters] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPrincipalId(oldest?.id ?? "");
      setReason("");
      setError(null);
    }
  }

  const principal = tickets.find((ticket) => ticket.id === principalId) ?? oldest;
  const duplicates = tickets.filter((ticket) => ticket.id !== principal?.id);

  const merge = useMutation({
    mutationFn: () =>
      mergeTickets(principal!.id, {
        duplicateIds: duplicates.map((ticket) => ticket.id),
        reason: reason.trim(),
        addAssignees,
        notifyRequesters,
      }),
    onSuccess: onDone,
    onError: (cause: Error) => setError(cause.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Fusionar ${tickets.length} tickets`}
      wide
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => merge.mutate()}
            disabled={!principal || reason.trim().length < 3 || merge.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {merge.isPending ? "Fusionando…" : "Confirmar fusión"}
          </button>
        </>
      }
    >
      {error && <p className="mb-2 text-sm text-red">{error}</p>}

      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">
        Elige cuál se queda abierto. Los demás se cerrarán con un mensaje que apunta a él, y su
        conversación se leerá desde ahí.
      </p>

      <ul className="mb-4 space-y-1">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]">
              <input
                type="radio"
                name="principal"
                checked={principal?.id === ticket.id}
                onChange={() => setPrincipalId(ticket.id)}
                className="h-4 w-4 accent-accent"
              />
              <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">
                {formatTicketNumber(ticket.number)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--content-ink)]">
                {ticket.title}
              </span>
              {principal?.id === ticket.id ? (
                <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                  Principal
                </span>
              ) : (
                <span className="shrink-0 text-[10px] text-[var(--content-ink-dim)]">se cierra</span>
              )}
              <span className="shrink-0 text-xs text-[var(--content-ink-dim)]">
                {ticket.requester.name} · {formatWhen(ticket.createdAt)}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <label className="mb-1.5 flex items-center gap-2 text-sm text-[var(--content-ink)]">
        <input
          type="checkbox"
          checked={addAssignees}
          onChange={(event) => setAddAssignees(event.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Añadir a los responsables de los duplicados
      </label>
      <label className="mb-3 flex items-center gap-2 text-sm text-[var(--content-ink)]">
        <input
          type="checkbox"
          checked={notifyRequesters}
          onChange={(event) => setNotifyRequesters(event.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Avisar a los solicitantes
      </label>

      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
        Motivo (obligatorio)
      </label>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Ej. Mismo fallo de wifi en Ventas"
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />
    </Modal>
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

/** Cabecera que ordena al pulsarla; sin `column` es una cabecera normal. */
function Th({
  label,
  column,
  sort,
  dir,
  onSort,
}: {
  label: string;
  column?: TicketSort;
  sort?: TicketSort;
  dir?: "asc" | "desc";
  onSort?: (column: TicketSort) => void;
}) {
  if (!column || !onSort) {
    return <th className="px-3 py-2.5 font-medium">{label}</th>;
  }
  const active = sort === column;
  return (
    <th
      className="px-3 py-2.5 font-medium"
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 whitespace-nowrap hover:text-[var(--content-ink)] ${
          active ? "text-[var(--content-ink)]" : ""
        }`}
      >
        {label}
        <span aria-hidden="true" className={active ? "" : "opacity-0"}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

function ListView({
  tickets,
  sort,
  dir,
  onSort,
  selected,
  onSelectedChange,
}: {
  tickets: TicketListItem[];
  sort: TicketSort;
  dir: "asc" | "desc";
  onSort: (column: TicketSort) => void;
  selected: string[];
  onSelectedChange: (next: string[]) => void;
}) {
  const pageIds = tickets.map((ticket) => ticket.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  function toggle(id: string, checked: boolean) {
    onSelectedChange(
      checked ? [...selected, id] : selected.filter((current) => current !== id),
    );
  }

  // La casilla de la cabecera solo manda sobre lo que se está viendo: marcar la
  // página no debe tocar lo que se marcó en otra.
  function togglePage(checked: boolean) {
    onSelectedChange(
      checked
        ? [...selected, ...pageIds.filter((id) => !selected.includes(id))]
        : selected.filter((id) => !pageIds.includes(id)),
    );
  }

  return (
    <Plate className="overflow-x-auto">
      <table className="w-full min-w-[1040px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
            <th className="w-10 px-3 py-2.5">
              <input
                type="checkbox"
                checked={allOnPage}
                onChange={(event) => togglePage(event.target.checked)}
                aria-label="Seleccionar los tickets de esta página"
                className="h-4 w-4 accent-accent"
              />
            </th>
            <Th label="ID" column="number" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Estado" column="status" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Título" column="title" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Solicitante" column="requester" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Área / categoría" column="area" sort={sort} dir={dir} onSort={onSort} />
            {/* Un ticket puede tener varios responsables: no hay un valor por el
                que ordenar sin inventarse cuál de ellos manda. */}
            <Th label="Responsables" />
            <Th label="Creado" column="created" sort={sort} dir={dir} onSort={onSort} />
            <Th label="SLA" column="sla" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Prioridad" column="priority" sort={sort} dir={dir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr
              key={ticket.id}
              className={`border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)] ${
                selected.includes(ticket.id) ? "bg-accent/5" : ""
              }`}
            >
              <td className="px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={selected.includes(ticket.id)}
                  onChange={(event) => toggle(ticket.id, event.target.checked)}
                  aria-label={`Seleccionar ${formatTicketNumber(ticket.number)}`}
                  className="h-4 w-4 accent-accent"
                />
              </td>
              <td className="px-3 py-2.5 font-display tabular text-[var(--content-ink)]">
                {formatTicketNumber(ticket.number)}
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge status={ticket.status} />
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
                {ticket.assignees.length ? (
                  <AvatarStack users={ticket.assignees} />
                ) : (
                  <span className="text-xs text-[var(--content-ink-dim)]">Sin asignar</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[var(--content-ink-dim)]">
                {formatWhen(ticket.createdAt)}
              </td>
              <td className="px-3 py-2.5">
                {/* El margen, no el adjetivo: entre veinte filas lo que se
                    compara es cuánto falta, y el detalle se abre encima. */}
                <SlaTimeline sla={ticket} status={ticket.status} />
              </td>
              <td className="px-3 py-2.5">
                <PriorityBadge priority={ticket.priority} />
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
        <SlaTimeline sla={ticket} status={ticket.status} />
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
  me,
  onMove,
  onTake,
  onAssign,
}: {
  tickets: TicketListItem[];
  me: MeResponse | null;
  onMove: (ticket: TicketListItem, status: TicketStatus, note?: string) => Promise<void>;
  onTake: (ticket: TicketListItem) => Promise<void>;
  onAssign: (ticket: TicketListItem, assigneeIds: string[]) => Promise<void>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [pendingResolve, setPendingResolve] = useState<TicketListItem | null>(null);
  const [pendingAssign, setPendingAssign] = useState<TicketListItem | null>(null);
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

    /*
     * Soltar en «Asignado» un ticket que no tiene responsables es el gesto de
     * repartir trabajo, no el de renombrar una columna: lo normal es que quien
     * arrastra se lo quede. El supervisor y el administrador reparten el de
     * otros, así que a ellos se les pregunta a quién (spec §7.4).
     *
     * Con responsables ya puestos, mover a «Asignado» es solo un cambio de
     * estado y se envía tal cual.
     */
    if (target === "assigned" && ticket.assignees.length === 0) {
      if (me && isSupervisorOf(me, ticket.area.id)) {
        setPendingAssign(ticket);
        return;
      }
      void onTake(ticket);
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

      <AssignTicketsModal
        tickets={pendingAssign ? [pendingAssign] : []}
        me={me}
        onClose={() => setPendingAssign(null)}
        onConfirm={async (assigneeIds) => {
          const ticket = pendingAssign;
          setPendingAssign(null);
          if (ticket) await onAssign(ticket, assigneeIds);
        }}
      />
    </>
  );
}

/**
 * A quién le tocan los tickets que el supervisor acaba de arrastrar o marcar. Es
 * el mismo reparto del detalle, en pequeño: lo que hace falta ver aquí es quién
 * está disponible y cuánto lleva encima, no el expediente entero de cada persona.
 *
 * Trabaja sobre una lista porque desde la tabla se reparten varios de golpe;
 * arrastrar una tarjeta es el caso de uno solo. Todos han de ser de la misma
 * área —es de donde sale la gente que puede atenderlos—, y quien llama se
 * encarga de que así sea.
 */
function AssignTicketsModal({
  tickets,
  me,
  onClose,
  onConfirm,
}: {
  tickets: TicketListItem[];
  me: MeResponse | null;
  onClose: () => void;
  onConfirm: (assigneeIds: string[], mode: AssignMode) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<AssignMode>("add");
  const areaId = tickets[0]?.area.id ?? "";
  const taken = tickets.filter((ticket) => ticket.assignees.length > 0);

  // Cada tanda empieza con la selección en blanco; es el patrón de React para
  // ajustar estado cuando cambia una prop, sin efecto de por medio.
  const key = tickets.map((ticket) => ticket.id).join(",");
  const [shownKey, setShownKey] = useState(key);
  if (key !== shownKey) {
    setShownKey(key);
    setSelected([]);
    setMode("add");
  }

  const { data: members = [] } = useQuery({
    queryKey: areaKeys.workload(areaId),
    queryFn: () => listAreaWorkload(areaId),
    enabled: areaId !== "",
  });

  const peak = Math.max(1, ...members.map((member) => member.load));
  const what =
    tickets.length === 1
      ? formatTicketNumber(tickets[0]!.number)
      : `${tickets.length} tickets`;

  return (
    <Modal
      open={tickets.length > 0}
      onClose={onClose}
      title={`Asignar ${what}`}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
          >
            Cancelar
          </button>
          {/* El atajo de siempre: el supervisor también se asigna tickets. */}
          {me && members.some((member) => member.id === me.id) && (
            <button
              onClick={() => void onConfirm([me.id], mode)}
              className="rounded-lg border border-[var(--content-border)] px-3 py-2 text-sm font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
            >
              {tickets.length === 1 ? "Asignármelo a mí" : "Asignármelos a mí"}
            </button>
          )}
          <button
            onClick={() => void onConfirm(selected, mode)}
            disabled={selected.length === 0}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Asignar
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">
        {tickets.length === 1
          ? `¿Quién atiende este ticket en ${tickets[0]!.area.name}?`
          : `¿Quién atiende estos ${tickets.length} tickets en ${tickets[0]?.area.name ?? ""}?`}
      </p>
      {/*
        Guardar responsables sustituye la lista entera, así que sobre tickets que
        ya tienen a alguien hay que decidir antes qué pasa con ellos. Se pregunta
        solo cuando el caso existe, y arranca en "sumar": repartir una tanda no
        suele querer decir «echad a quien ya estaba».
      */}
      {taken.length > 0 && (
        <div className="mb-3 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] p-2.5">
          <p className="mb-2 text-xs text-[var(--content-ink-dim)]">
            {taken.length === tickets.length
              ? tickets.length === 1
                ? "Este ticket ya tiene responsables."
                : "Ya tienen responsables."
              : `${taken.length} de ${tickets.length} ya tienen responsables.`}
          </p>
          <div className="flex gap-2">
            {(
              [
                { id: "add", label: "Sumar a los actuales" },
                { id: "replace", label: "Reemplazarlos" },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                onClick={() => setMode(option.id)}
                className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  mode === option.id
                    ? "bg-accent text-white"
                    : "border border-[var(--content-border)] text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <ul className="space-y-1">
        {members.map((member) => {
          const away = member.availability.state === "away";
          return (
            <li key={member.id}>
              <label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]">
                <input
                  type="checkbox"
                  checked={selected.includes(member.id)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, member.id]
                        : current.filter((id) => id !== member.id),
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                <Avatar name={member.name} src={member.avatarUrl} available={!away} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm text-[var(--content-ink)]">
                    {member.name}
                    {member.suggested && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-medium text-amber"
                        title="Disponible y con menos carga"
                      >
                        <StarIcon /> Sugerido
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-[var(--content-border)]">
                    <span
                      className={`block h-full rounded-full ${
                        member.load / peak > 0.75
                          ? "bg-red"
                          : member.load / peak > 0.4
                            ? "bg-amber"
                            : "bg-green"
                      }`}
                      style={{ width: `${Math.round((member.load / peak) * 100)}%` }}
                    />
                  </span>
                </span>
                <span className="shrink-0 text-right text-xs text-[var(--content-ink-dim)]">
                  {away ? "Ausente" : `${member.openTickets} abiertos`}
                </span>
              </label>
            </li>
          );
        })}
        {members.length === 0 && (
          <p className="text-sm text-[var(--content-ink-dim)]">
            No hay nadie activo en esta área.
          </p>
        )}
      </ul>
    </Modal>
  );
}
