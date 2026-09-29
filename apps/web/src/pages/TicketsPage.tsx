import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AvatarStack } from "../components/Avatar";
import { AreaTag, PriorityBadge, SlaTag, StatusBadge } from "../components/badges";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { Modal } from "../components/Modal";
import { DownloadIcon, GroupIcon, KanbanIcon, ListIcon, PaperclipIcon, SearchIcon } from "../components/icons";
import { AREAS, CURRENT_USER, STATUS_META, TICKETS, formatWhen, isActive } from "../data/mock";
import type { Ticket, TicketStatus } from "../data/types";

type ViewMode = "lista" | "grupos" | "kanban";
type TabId = "mis-solicitudes" | "asignados" | "mi-area" | "sin-asignar" | "todos";

const TABS: { id: TabId; label: string }[] = [
  { id: "mis-solicitudes", label: "Mis solicitudes" },
  { id: "asignados", label: "Asignados a mí" },
  { id: "mi-area", label: "Mi área" },
  { id: "sin-asignar", label: "Sin asignar" },
  { id: "todos", label: "Todos" },
];

const KANBAN_STATUSES: TicketStatus[] = ["abierto", "asignado", "en_progreso", "en_espera", "resuelto"];
const KANBAN_LABELS: Record<string, string> = {
  abierto: "Abierto",
  asignado: "Asignado",
  en_progreso: "En progreso",
  en_espera: "En espera",
  resuelto: "Resuelto",
};

const SLA_RANK = { vencido: 0, en_riesgo: 1, en_tiempo: 2 };
const PRIORITY_RANK = { urgente: 0, alta: 1, media: 2, baja: 3 };
function worstSla(t: Ticket) {
  return SLA_RANK[t.slaResponse] <= SLA_RANK[t.slaResolution] ? t.slaResponse : t.slaResolution;
}
function defaultSort(a: Ticket, b: Ticket) {
  return (
    SLA_RANK[worstSla(a)] - SLA_RANK[worstSla(b)] ||
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function tabTickets(tab: TabId): Ticket[] {
  switch (tab) {
    case "mis-solicitudes":
      return TICKETS.filter((t) => t.requester === CURRENT_USER.name || t.createdBy === CURRENT_USER.name);
    case "asignados":
      return TICKETS.filter((t) => t.assignees.includes(CURRENT_USER.id));
    case "mi-area":
      return TICKETS.filter((t) => t.areaId === CURRENT_USER.areaId);
    case "sin-asignar":
      return TICKETS.filter((t) => t.areaId === CURRENT_USER.areaId && t.assignees.length === 0 && isActive(t));
    case "todos":
      return TICKETS;
  }
}

export default function TicketsPage() {
  const [tab, setTab] = useState<TabId>("mi-area");
  const [view, setView] = useState<ViewMode>("lista");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [, forceTick] = useState(0);

  const base = useMemo(() => tabTickets(tab), [tab]);
  const filtered = useMemo(() => {
    return base
      .filter((t) => (statusFilter ? t.status === statusFilter : true))
      .filter((t) => (priorityFilter ? t.priority === priorityFilter : true))
      .filter((t) =>
        search.trim()
          ? t.title.toLowerCase().includes(search.toLowerCase()) || t.number.toLowerCase().includes(search.toLowerCase())
          : true
      )
      .sort(defaultSort);
  }, [base, statusFilter, priorityFilter, search]);

  function exportCsv() {
    const header = ["Número", "Título", "Área", "Categoría", "Prioridad", "Estado", "Solicitante", "Creado"];
    const rows = filtered.map((t) => [
      t.number,
      t.title,
      AREAS.find((a) => a.id === t.areaId)?.name ?? "",
      t.category,
      t.priority,
      t.status,
      t.requester,
      t.createdAt,
    ]);
    const csv = "﻿" + [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tickets.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title="Tickets"
        actions={
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
          >
            <DownloadIcon className="h-3.5 w-3.5" /> Exportar CSV
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-[var(--content-border)]">
        {TABS.map((t) => {
          const count = tabTickets(t.id).length;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                tab === t.id ? "text-accent" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
              }`}
            >
              {t.label}
              <span className="rounded-full bg-[var(--content-surface)] px-1.5 py-0.5 font-display text-[10px] tabular">{count}</span>
              {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-ink-dim)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número o título…"
            className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] py-2 pl-9 pr-3 text-sm text-[var(--content-ink)] outline-none placeholder:text-[var(--content-ink-dim)] focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
        >
          <option value="">Todos los estados</option>
          {(["abierto", "asignado", "en_progreso", "en_espera", "resuelto", "cerrado", "cancelado"] as TicketStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
        >
          <option value="">Toda prioridad</option>
          <option value="urgente">Urgente</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>
        <div className="ml-auto flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
          {([
            { id: "lista", icon: ListIcon },
            { id: "grupos", icon: GroupIcon },
            { id: "kanban", icon: KanbanIcon },
          ] as { id: ViewMode; icon: typeof ListIcon }[]).map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                view === id ? "bg-accent text-white" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {id}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Plate className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-[var(--content-ink-dim)]">Ningún ticket coincide con los filtros.</p>
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setPriorityFilter("");
            }}
            className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
          >
            Limpiar filtros
          </button>
        </Plate>
      ) : view === "lista" ? (
        <ListView tickets={filtered} />
      ) : view === "grupos" ? (
        <GroupedView tickets={filtered} />
      ) : (
        <KanbanView tickets={filtered} onChanged={() => forceTick((v) => v + 1)} />
      )}

      <p className="mt-3 text-xs text-[var(--content-ink-dim)]">Mostrando {filtered.length} tickets.</p>
    </div>
  );
}

function TicketTitleCell({ t }: { t: Ticket }) {
  return (
    <Link to={`/tickets/${t.number}`} className="flex min-w-0 items-center gap-1.5 hover:underline">
      <span className="truncate">{t.title}</span>
      {t.hasAttachments && <PaperclipIcon className="h-3.5 w-3.5 shrink-0 text-[var(--content-ink-dim)]" />}
    </Link>
  );
}

function ListView({ tickets }: { tickets: Ticket[] }) {
  return (
    <Plate className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
            <th className="w-8 px-3 py-2.5"><input type="checkbox" aria-label="Seleccionar todos" className="h-4 w-4 accent-accent" /></th>
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
          {tickets.map((t) => (
            <tr key={t.number} className="border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)]">
              <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Seleccionar ${t.number}`} className="h-4 w-4 accent-accent" /></td>
              <td className="px-3 py-2.5 font-display tabular text-[var(--content-ink)]">{t.number}</td>
              <td className="max-w-[220px] px-3 py-2.5 text-[var(--content-ink)]"><TicketTitleCell t={t} /></td>
              <td className="px-3 py-2.5 text-[var(--content-ink-dim)]">{t.requester}</td>
              <td className="px-3 py-2.5"><AreaTag areaId={t.areaId} /></td>
              <td className="px-3 py-2.5"><PriorityBadge priority={t.priority} /></td>
              <td className="px-3 py-2.5">
                {t.assignees.length ? <AvatarStack userIds={t.assignees} /> : <span className="text-xs text-[var(--content-ink-dim)]">Sin asignar</span>}
              </td>
              <td className="px-3 py-2.5"><StatusBadge status={t.status} /></td>
              <td className="px-3 py-2.5"><SlaTag state={t.slaResolution} /></td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[var(--content-ink-dim)]">{formatWhen(t.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Plate>
  );
}

function GroupedView({ tickets }: { tickets: Ticket[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Ticket[]>();
    for (const t of tickets) {
      const key = t.status;
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return Array.from(map.entries());
  }, [tickets]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="flex flex-col gap-3">
      {groups.map(([status, items]) => (
        <Plate key={status} className="overflow-hidden">
          <button
            onClick={() => setCollapsed((c) => ({ ...c, [status]: !c[status] }))}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
              <StatusBadge status={status as TicketStatus} /> {items.length}
            </span>
            <span className="text-xs text-[var(--content-ink-dim)]">{collapsed[status] ? "Mostrar" : "Ocultar"}</span>
          </button>
          {!collapsed[status] && (
            <ul className="divide-y divide-[var(--content-border)] border-t border-[var(--content-border)]">
              {items.map((t) => (
                <li key={t.number}>
                  <Link to={`/tickets/${t.number}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-[var(--content-bg)]">
                    <span className="font-display tabular text-[var(--content-ink)]">{t.number}</span>
                    <span className="min-w-0 flex-1 truncate text-[var(--content-ink)]">{t.title}</span>
                    <PriorityBadge priority={t.priority} />
                    {t.assignees.length > 0 && <AvatarStack userIds={t.assignees} />}
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

function KanbanCard({ t }: { t: Ticket }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: t.number });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
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
        <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">{t.number}</span>
        <PriorityBadge priority={t.priority} />
      </div>
      <Link to={`/tickets/${t.number}`} onClick={(e) => e.stopPropagation()} className="text-sm font-medium text-[var(--content-ink)] hover:underline">
        {t.title}
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <AreaTag areaId={t.areaId} />
        <SlaTag state={t.slaResolution} />
      </div>
      {t.assignees.length > 0 && (
        <div className="mt-2">
          <AvatarStack userIds={t.assignees} />
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ status, tickets }: { status: TicketStatus; tickets: Ticket[] }) {
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
          {KANBAN_LABELS[status]}
        </span>
        <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">{tickets.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tickets.map((t) => (
          <KanbanCard key={t.number} t={t} />
        ))}
      </div>
    </div>
  );
}

function KanbanView({ tickets, onChanged }: { tickets: Ticket[]; onChanged: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [pendingResolve, setPendingResolve] = useState<Ticket | null>(null);
  const [note, setNote] = useState("");

  const columns = KANBAN_STATUSES.map((s) => ({ status: s, tickets: tickets.filter((t) => t.status === s) }));

  function applyStatus(ticket: Ticket, status: TicketStatus) {
    ticket.status = status;
    onChanged();
  }

  function handleDragEnd(e: DragEndEvent) {
    const ticketNumber = e.active.id as string;
    const target = e.over?.id as TicketStatus | undefined;
    if (!target) return;
    const ticket = tickets.find((t) => t.number === ticketNumber);
    if (!ticket || ticket.status === target) return;
    if (target === "resuelto") {
      setPendingResolve(ticket);
      return;
    }
    applyStatus(ticket, target);
  }

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((c) => (
            <KanbanColumn key={c.status} status={c.status} tickets={c.tickets} />
          ))}
        </div>
      </DndContext>

      <Modal
        open={pendingResolve !== null}
        onClose={() => setPendingResolve(null)}
        title={`Resolver ${pendingResolve?.number ?? ""}`}
        footer={
          <>
            <button onClick={() => setPendingResolve(null)} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
              Cancelar
            </button>
            <button
              onClick={() => {
                if (pendingResolve) applyStatus(pendingResolve, "resuelto");
                setPendingResolve(null);
                setNote("");
              }}
              disabled={!note.trim()}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Marcar como resuelto
            </button>
          </>
        }
      >
        <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Nota de solución (obligatoria)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="¿Cómo se resolvió el problema?"
          className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] p-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
        />
      </Modal>
    </>
  );
}
