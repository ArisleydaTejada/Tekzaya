import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { PriorityBadge, SlaTag } from "../components/badges";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { StatTile } from "../components/StatTile";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  DownloadIcon,
  ShieldIcon,
  StarIcon,
  TicketIcon,
} from "../components/icons";
import {
  AREAS,
  CURRENT_USER,
  TICKETS,
  USERS,
  formatWhen,
  isActive,
  ticketsForArea,
  CONTRACT_PRIORITY,
  CONTRACT_SLA,
} from "../data/mock";
import type { Ticket } from "../data/types";

type Period = "dia" | "semana" | "mes" | "año" | "rango";
type Scope = "todas" | "area" | "yo";

const PERIODS: { id: Period; label: string; days: number }[] = [
  { id: "dia", label: "Día", days: 1 },
  { id: "semana", label: "Semana", days: 7 },
  { id: "mes", label: "Mes", days: 30 },
  { id: "año", label: "Año", days: 365 },
  { id: "rango", label: "Rango", days: 365 },
];

const HOUR = 3600 * 1000;
const MY_AREA = CURRENT_USER.areaId;

function resolvedWithin(tickets: Ticket[], days: number) {
  const cutoff = Date.now() - days * 24 * HOUR;
  return tickets.filter(
    (t) => (t.status === "resuelto" || t.status === "cerrado") && t.resolvedAt && new Date(t.resolvedAt).getTime() >= cutoff
  );
}

function avgResponseHours(tickets: Ticket[]) {
  const withResponse = tickets.filter((t) => t.firstResponseAt);
  if (!withResponse.length) return null;
  const total = withResponse.reduce(
    (sum, t) => sum + (new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime()) / HOUR,
    0
  );
  return total / withResponse.length;
}

const SLA_RANK = { vencido: 0, en_riesgo: 1, en_tiempo: 2 };
const PRIORITY_RANK = { urgente: 0, alta: 1, media: 2, baja: 3 };
function worstSla(t: Ticket) {
  return SLA_RANK[t.slaResponse] <= SLA_RANK[t.slaResolution] ? t.slaResponse : t.slaResolution;
}
function sortByUrgency(tickets: Ticket[]) {
  return [...tickets].sort(
    (a, b) =>
      SLA_RANK[worstSla(a)] - SLA_RANK[worstSla(b)] ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("semana");
  const [scope, setScope] = useState<Scope>("area");
  const [exportOpen, setExportOpen] = useState(false);

  const periodDays = PERIODS.find((p) => p.id === period)!.days;
  const areaTickets = useMemo(() => ticketsForArea(MY_AREA), []);
  const scopeTickets = scope === "todas" ? TICKETS : areaTickets;

  const myAssigned = useMemo(
    () => sortByUrgency(TICKETS.filter((t) => t.assignees.includes(CURRENT_USER.id) && isActive(t))),
    []
  );
  const myRequests = useMemo(
    () =>
      [...TICKETS]
        .filter((t) => t.requester === CURRENT_USER.name || t.createdBy === CURRENT_USER.name)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5),
    []
  );

  const incidentTickets = scopeTickets.filter((t) => t.incident === "Caída del wifi en Ventas");

  return (
    <div>
      <PageHeader
        title={`Hola, ${CURRENT_USER.name.split(" ")[0]}`}
        subtitle={
          myAssigned.length > 0
            ? `Tienes ${myAssigned.length} ${myAssigned.length === 1 ? "ticket" : "tickets"} que requieren tu atención.`
            : "No tienes tickets pendientes por ahora."
        }
        actions={
          <>
            <div className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
              {(["todas", "area", "yo"] as Scope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    scope === s ? "bg-accent text-white" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                  }`}
                >
                  {s === "todas" ? "Todas las áreas" : s === "area" ? "Mi área" : "Personal"}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    period === p.id ? "bg-accent text-white" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
              >
                <DownloadIcon className="h-3.5 w-3.5" /> Exportar <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
              {exportOpen && (
                <div className="absolute right-0 z-20 mt-1 w-32 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-1 shadow-[var(--content-shadow)]">
                  <button onClick={() => setExportOpen(false)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--content-ink)] hover:bg-[var(--content-bg)]">
                    CSV
                  </button>
                  <button onClick={() => setExportOpen(false)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--content-ink)] hover:bg-[var(--content-bg)]">
                    PDF
                  </button>
                </div>
              )}
            </div>
          </>
        }
      />

      {scope === "yo" ? <PersonalKpis periodDays={periodDays} /> : <AreaKpis tickets={scopeTickets} periodDays={periodDays} global={scope === "todas"} />}

      {incidentTickets.length >= 2 && (
        <Plate className="mb-6 flex flex-wrap items-center gap-3 border-amber/40 bg-amber/10 px-4 py-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--content-ink)]">
            Posible incidente: {incidentTickets.length} tickets sobre la caída del wifi en Ventas
          </p>
          <Link to="/tickets" className="ml-auto flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            Ver tickets del incidente <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </Plate>
      )}

      {scope === "yo" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AssignedPanel tickets={myAssigned} />
          <RequestsPanel tickets={myRequests} />
        </div>
      ) : (
        <AvailabilityPanel global={scope === "todas"} />
      )}
    </div>
  );
}

function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}

function PersonalKpis({ periodDays }: { periodDays: number }) {
  const pendientesArea = ticketsForArea(MY_AREA).filter(isActive).length;
  const resueltosPorMi = resolvedWithin(
    TICKETS.filter((t) => t.assignees.includes(CURRENT_USER.id)),
    periodDays
  ).length;
  const pendientesParaMi = TICKETS.filter((t) => t.assignees.includes(CURRENT_USER.id) && isActive(t)).length;
  const urgentes = TICKETS.filter(
    (t) =>
      t.priority === "urgente" &&
      isActive(t) &&
      t.areaId === MY_AREA &&
      (t.assignees.includes(CURRENT_USER.id) || t.assignees.length === 0)
  ).length;

  return (
    <KpiRow>
      <Link to="/tickets">
        <StatTile label="Pendientes del área" value={String(pendientesArea)} icon={<TicketIcon className="h-4 w-4" />} />
      </Link>
      <Link to="/tickets">
        <StatTile label="Resueltos por mí" value={String(resueltosPorMi)} icon={<CheckIcon className="h-4 w-4" />} />
      </Link>
      <Link to="/tickets">
        <StatTile label="Pendientes para mí" value={String(pendientesParaMi)} icon={<TicketIcon className="h-4 w-4" />} />
      </Link>
      <Link to="/tickets">
        <StatTile
          label="Urgentes"
          value={String(urgentes)}
          icon={<ShieldIcon className="h-4 w-4" />}
          caption={urgentes > 0 ? "requieren atención" : "todo en orden"}
        />
      </Link>
    </KpiRow>
  );
}

function AreaKpis({ tickets, periodDays, global }: { tickets: Ticket[]; periodDays: number; global: boolean }) {
  const pendientes = tickets.filter(isActive);
  const sinAsignar = pendientes.filter((t) => t.assignees.length === 0).length;
  const resueltos = resolvedWithin(tickets, periodDays).length;
  const avgResponse = avgResponseHours(tickets);
  const withCsat = tickets.filter((t) => t.csat !== undefined);
  const avgCsat = withCsat.length ? withCsat.reduce((s, t) => s + (t.csat ?? 0), 0) / withCsat.length : null;
  const compliant = tickets.filter((t) => t.slaResolution !== "vencido").length;
  const compliance = tickets.length ? Math.round((compliant / tickets.length) * 100) : 100;

  return (
    <KpiRow>
      <Link to="/tickets">
        <StatTile
          label="Tickets pendientes"
          value={String(pendientes.length)}
          icon={<TicketIcon className="h-4 w-4" />}
          caption={`${sinAsignar} sin asignar`}
        />
      </Link>
      <Link to="/tickets">
        <StatTile label="Tickets resueltos" value={String(resueltos)} icon={<CheckIcon className="h-4 w-4" />} />
      </Link>
      <StatTile
        label="T. medio 1.ª respuesta"
        value={avgResponse === null ? "—" : `${avgResponse.toFixed(1)} h`}
        icon={<ClockIcon className="h-4 w-4" />}
      />
      <StatTile
        label="Cumplimiento SLA"
        value={`${compliance}%`}
        icon={<ShieldIcon className="h-4 w-4" />}
        caption={
          avgCsat !== null ? (
            <span className="inline-flex items-center gap-1">
              <StarIcon className="h-3 w-3 text-amber" /> {avgCsat.toFixed(1)} CSAT
            </span>
          ) : (
            "sin CSAT aún"
          )
        }
      />
      {global && <p className="col-span-2 -mt-2 text-xs text-[var(--content-ink-dim)] sm:col-span-4">Alcance: todas las áreas.</p>}
    </KpiRow>
  );
}

function AvailabilityPanel({ global }: { global: boolean }) {
  const people = global ? USERS : USERS.filter((u) => u.areaId === MY_AREA);
  return (
    <Plate className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">Disponibilidad del equipo</h2>
        <Link to="/reportes" className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          Ver gráficas en Reportes <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>
      <ul className="flex flex-col divide-y divide-[var(--content-border)]">
        {people.map((u) => (
          <li key={u.id} className="flex items-center gap-3 py-2.5">
            <Avatar name={u.name} initials={u.initials} available={u.available} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-[var(--content-ink)]">{u.name}</p>
              {global && <p className="text-xs text-[var(--content-ink-dim)]">{AREAS.find((a) => a.id === u.areaId)?.name}</p>}
            </div>
            <span className={`text-xs font-medium ${u.available ? "text-green" : "text-[var(--content-ink-dim)]"}`}>
              {u.available ? "Disponible" : `Ausente${u.awayUntil ? ` hasta ${u.awayUntil}` : ""}`}
            </span>
          </li>
        ))}
      </ul>
    </Plate>
  );
}

function AssignedPanel({ tickets }: { tickets: Ticket[] }) {
  return (
    <Plate className="p-4">
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">Asignados a mí</h2>
      {tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-[var(--content-ink-dim)]">No tienes tickets asignados</p>
          <Link to="/tickets" className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim">
            Ver tickets de mi área
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--content-border)]">
          {tickets.slice(0, 3).map((t) => (
            <li key={t.number}>
              <Link to={`/tickets/${t.number}`} className="flex flex-col gap-1 py-2.5 hover:opacity-80">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-display font-medium tabular text-[var(--content-ink)]">{t.number}</span>
                  <span className="truncate text-[var(--content-ink)]">{t.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <PriorityBadge priority={CONTRACT_PRIORITY[t.priority]} />
                  <SlaTag state={CONTRACT_SLA[t.slaResolution]} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/tickets" className="mt-3 flex items-center gap-1 text-xs font-medium text-accent hover:underline">
        Ver todos los asignados a mí <ArrowRightIcon className="h-3 w-3" />
      </Link>
    </Plate>
  );
}

function RequestsPanel({ tickets }: { tickets: Ticket[] }) {
  return (
    <Plate className="p-4">
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">Mis solicitudes</h2>
      {tickets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-[var(--content-ink-dim)]">Aún no has creado solicitudes</p>
          <Link to="/tickets/nuevo" className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim">
            Crear mi primer ticket
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--content-border)]">
          {tickets.map((t) => (
            <li key={t.number}>
              <Link to={`/tickets/${t.number}`} className="flex flex-col gap-1 py-2.5 hover:opacity-80">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-display font-medium tabular text-[var(--content-ink)]">{t.number}</span>
                  <span className="truncate text-[var(--content-ink)]">{t.title}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[var(--content-ink-dim)]">
                  {t.firstResponseAt ? (
                    <>Respondieron · {formatWhen(t.firstResponseAt)}</>
                  ) : (
                    <span className="rounded-full bg-[var(--content-bg)] px-2 py-0.5">Sin respuesta</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link to="/tickets" className="mt-3 flex items-center gap-1 text-xs font-medium text-accent hover:underline">
        Ver todas mis solicitudes <ArrowRightIcon className="h-3 w-3" />
      </Link>
    </Plate>
  );
}
