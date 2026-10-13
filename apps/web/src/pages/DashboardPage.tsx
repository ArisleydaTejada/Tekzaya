import {
  formatTicketNumber,
  maxReportScope,
  STATS_PERIOD_LABEL,
  type AreaKpis,
  type AvailabilityEntry,
  type MeResponse,
  type PersonalKpis,
  type StatsOverview,
  type StatsPeriod,
  type StatsScope,
  type TicketListItem,
} from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  getStatsOverview,
  getTeamAvailability,
  statsCsvUrl,
  statsKeys,
  type StatsRequest,
} from "../api/stats";
import { areaKeys, listAreas, listTickets, ticketKeys } from "../api/tickets";
import { useAuth } from "../auth/AuthContext";
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
import { formatWhen } from "../lib/format";

const PERIODS: StatsPeriod[] = ["day", "week", "month", "year"];

/**
 * El selector de alcance se arma a partir de lo que el servidor concedería
 * (`maxReportScope`), no de una lista fija: un empleado no ve el botón "Todas las
 * áreas" porque pulsarlo solo le daría un 403 (spec §7.2.3).
 */
function scopesFor(me: MeResponse): { id: StatsScope; label: string }[] {
  const allowed = maxReportScope(me);
  const personal = { id: "me" as const, label: "Personal" };
  if (allowed.type === "global") {
    return [{ id: "global", label: "Todas las áreas" }, { id: "area", label: "Mi área" }, personal];
  }
  if (allowed.type === "area") return [{ id: "area", label: "Mi área" }, personal];
  return [personal];
}

export default function DashboardPage() {
  const { me } = useAuth();
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const scopes = me ? scopesFor(me) : [];
  const [scope, setScope] = useState<StatsScope>("area");
  // Área concreta que se está mirando; vacío significa "la mía".
  const [areaId, setAreaId] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  // El alcance guardado puede no estar permitido (un supervisor degradado a
  // empleado, por ejemplo); en ese caso se cae al primero disponible.
  const activeScope = scopes.some((item) => item.id === scope) ? scope : (scopes[0]?.id ?? "me");

  // Elegir un área distinta de la propia es exactamente el alcance global: lo
  // tienen el administrador y el supervisor de RRHH, los mismos que en Reportes
  // (spec §7.2.3). Al resto el servidor les devolvería un 403.
  const canPickArea = Boolean(me && maxReportScope(me).type === "global");
  const pickedArea = canPickArea && activeScope === "area" ? areaId : "";
  const query: StatsRequest = {
    scope: activeScope,
    period,
    ...(pickedArea ? { areaId: pickedArea } : {}),
  };

  const areas = useQuery({ queryKey: areaKeys.all, queryFn: listAreas, enabled: canPickArea });

  const overview = useQuery({
    queryKey: statsKeys.overview(query),
    queryFn: () => getStatsOverview(query),
    enabled: Boolean(me),
  });

  if (!me) return null;

  const personal = activeScope === "me";

  return (
    <div>
      <PageHeader
        title={`Hola, ${me.name.split(" ")[0]}`}
        subtitle={subtitleOf(overview.data)}
        actions={
          <>
            {scopes.length > 1 && (
              <div className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
                {scopes.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setScope(item.id)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${activeScope === item.id
                        ? "bg-accent text-white"
                        : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                      }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {canPickArea && activeScope === "area" && (
              <select
                value={areaId}
                onChange={(event) => setAreaId(event.target.value)}
                aria-label="Área del tablero"
                className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-xs text-[var(--content-ink)]"
              >
                <option value="">Mi área</option>
                {(areas.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
              {PERIODS.map((item) => (
                <button
                  key={item}
                  onClick={() => setPeriod(item)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${period === item
                      ? "bg-accent text-white"
                      : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                    }`}
                >
                  {STATS_PERIOD_LABEL[item]}
                </button>
              ))}
            </div>
            <div className="relative">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
              >
                <DownloadIcon className="h-3.5 w-3.5" /> Exportar{" "}
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
              {exportOpen && (
                <>
                  <button
                    className="fixed inset-0 z-20 cursor-default"
                    onClick={() => setExportOpen(false)}
                    aria-label="Cerrar menú de exportación"
                  />
                  <div className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-1 shadow-[var(--content-shadow)]">
                    {/* El CSV lo arma el servidor con el mismo alcance y período que
                        se está viendo; el enlace lleva la sesión en la cookie. */}
                    <a
                      href={statsCsvUrl(query)}
                      onClick={() => setExportOpen(false)}
                      className="block rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                    >
                      CSV del período
                    </a>
                    <button
                      onClick={() => {
                        setExportOpen(false);
                        window.print();
                      }}
                      className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                    >
                      Imprimir o guardar PDF
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        }
      />

      <KpiRow>
        {overview.isPending || !overview.data ? (
          <>
            {[0, 1, 2, 3].map((index) => (
              <StatTile
                key={index}
                label="Cargando…"
                value="—"
                icon={<TicketIcon className="h-4 w-4 opacity-40" />}
              />
            ))}
          </>
        ) : overview.data.kpis.kind === "personal" ? (
          <PersonalTiles kpis={overview.data.kpis} />
        ) : (
          <AreaTiles kpis={overview.data.kpis} />
        )}
      </KpiRow>

      {personal ? (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AssignedPanel />
          <RequestsPanel />
        </div>
      ) : (
        <AvailabilityPanel query={query} global={activeScope === "global"} />
      )}

      {overview.data?.incident && (
        <Plate className="mb-6 flex flex-wrap items-center gap-3 border-amber/40 bg-amber/10 px-4 py-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber" aria-hidden="true" />
          <p className="text-sm font-medium text-[var(--content-ink)]">
            Posible incidente: {overview.data.incident.ticketCount} tickets sobre{" "}
            {overview.data.incident.label}
          </p>
          <Link
            to="/tickets"
            className="ml-auto flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            Ver tickets del incidente <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
        </Plate>
      )}

      {overview.isError && (
        <Plate className="mb-6 border-red/40 bg-red/10 px-4 py-3">
          <p className="text-sm text-[var(--content-ink)]">
            No se pudieron cargar los indicadores. Vuelve a intentarlo en un momento.
          </p>
        </Plate>
      )}

    </div>
  );
}

function subtitleOf(overview: StatsOverview | undefined): string {
  if (!overview) return "Cargando tus indicadores…";
  if (overview.kpis.kind === "area") {
    const { pending, unassigned } = overview.kpis;
    // Con el selector de área, "el área" ya no es evidente: se nombra.
    const subject =
      overview.scope === "global" ? "Todas las áreas" : (overview.areaName ?? "El área");
    if (pending === 0) return `${subject} no tiene tickets pendientes.`;
    return `${subject} tiene ${pending} ${pending === 1 ? "ticket" : "tickets"} sin resolver, ${unassigned} sin asignar.`;
  }
  const pending = overview.kpis.pendingForMe;
  return pending > 0
    ? `Tienes ${pending} ${pending === 1 ? "ticket" : "tickets"} que requieren tu atención.`
    : "No tienes tickets pendientes por ahora.";
}

function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}

function PersonalTiles({ kpis }: { kpis: PersonalKpis }) {
  return (
    <>
      <Link to="/tickets?scope=area">
        <StatTile
          label="Pendientes del área"
          value={String(kpis.areaPending)}
          icon={<TicketIcon className="h-4 w-4" />}
        />
      </Link>
      <Link to="/tickets?scope=assigned">
        <StatTile
          label="Resueltos por mí"
          value={String(kpis.resolvedByMe)}
          icon={<CheckIcon className="h-4 w-4" />}
        />
      </Link>
      <Link to="/tickets?scope=assigned">
        <StatTile
          label="Pendientes para mí"
          value={String(kpis.pendingForMe)}
          icon={<TicketIcon className="h-4 w-4" />}
        />
      </Link>
      <Link to="/tickets?scope=area&priority=urgent">
        <StatTile
          label="Urgentes"
          value={String(kpis.urgent)}
          icon={<ShieldIcon className="h-4 w-4" />}
          caption={kpis.urgent > 0 ? "requieren atención" : "todo en orden"}
        />
      </Link>
    </>
  );
}

function AreaTiles({ kpis }: { kpis: AreaKpis }) {
  return (
    <>
      <Link to="/tickets?scope=area">
        <StatTile
          label="Tickets pendientes"
          value={String(kpis.pending)}
          icon={<TicketIcon className="h-4 w-4" />}
          caption={`${kpis.unassigned} sin asignar`}
        />
      </Link>
      <Link to="/tickets?scope=area">
        <StatTile
          label="Tickets resueltos"
          value={String(kpis.resolved)}
          icon={<CheckIcon className="h-4 w-4" />}
        />
      </Link>
      <StatTile
        label="T. medio 1.ª respuesta"
        value={kpis.firstResponseHours === null ? "—" : `${kpis.firstResponseHours.toFixed(1)} h`}
        icon={<ClockIcon className="h-4 w-4" />}
        caption={
          kpis.firstResponseMedianHours === null
            ? "sin respuestas en el período"
            : `mediana ${kpis.firstResponseMedianHours.toFixed(1)} h`
        }
      />
      <StatTile
        label="Cumplimiento SLA"
        value={kpis.slaCompliance === null ? "—" : `${kpis.slaCompliance}%`}
        icon={<ShieldIcon className="h-4 w-4" />}
        caption={
          kpis.csatAverage !== null ? (
            <span className="inline-flex items-center gap-1">
              <StarIcon className="h-3 w-3 text-amber" /> {kpis.csatAverage.toFixed(1)} CSAT
            </span>
          ) : (
            "sin CSAT aún"
          )
        }
      />
    </>
  );
}

function AvailabilityPanel({ query, global }: { query: StatsRequest; global: boolean }) {
  const { data, isPending } = useQuery({
    queryKey: statsKeys.availability(query),
    queryFn: () => getTeamAvailability(query),
  });

  return (
    <Plate className="p-4 mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
          Disponibilidad del equipo
        </h2>
        <Link
          to="/reportes"
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Ver gráficas en Reportes <ArrowRightIcon className="h-3 w-3" />
        </Link>
      </div>
      {isPending ? (
        <p className="py-6 text-center text-sm text-[var(--content-ink-dim)]">Cargando equipo…</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--content-border)]">
          {(data ?? []).map((person) => (
            <AvailabilityRow key={person.id} person={person} showArea={global} />
          ))}
        </ul>
      )}
    </Plate>
  );
}

function AvailabilityRow({ person, showArea }: { person: AvailabilityEntry; showArea: boolean }) {
  const available = person.availability.state === "available";
  const until = person.availability.awayUntil;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Avatar name={person.name} src={person.avatarUrl} available={available} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[var(--content-ink)]">{person.name}</p>
        <p className="text-xs text-[var(--content-ink-dim)]">
          {showArea ? `${person.areaName} · ` : ""}
          {person.openTickets} sin resolver
        </p>
      </div>
      <span
        className={`text-xs font-medium ${available ? "text-green" : "text-[var(--content-ink-dim)]"}`}
      >
        {available
          ? "Disponible"
          : `Ausente${until ? ` hasta ${new Date(until).toLocaleDateString("es")}` : ""}`}
      </span>
    </li>
  );
}

/** Los tres primeros asignados a mí sin resolver, por urgencia (spec §7.2.1). */
function AssignedPanel() {
  const query = { scope: "assigned" as const, sort: "sla" as const, limit: 3 };
  const { data, isPending } = useQuery({
    queryKey: ticketKeys.list(query),
    queryFn: () => listTickets(query),
  });
  const items = data?.items ?? [];

  return (
    <Plate className="p-4">
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
        Asignados a mí
      </h2>
      {isPending ? (
        <p className="py-6 text-center text-sm text-[var(--content-ink-dim)]">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-[var(--content-ink-dim)]">No tienes tickets asignados</p>
          <Link
            to="/tickets?scope=area"
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
          >
            Ver tickets de mi área
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--content-border)]">
          {items.map((ticket) => (
            <li key={ticket.id}>
              <Link
                to={`/tickets/${formatTicketNumber(ticket.number)}`}
                className="flex flex-col gap-1 py-2.5 hover:opacity-80"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-display font-medium tabular text-[var(--content-ink)]">
                    {formatTicketNumber(ticket.number)}
                  </span>
                  <span className="truncate text-[var(--content-ink)]">{ticket.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <PriorityBadge priority={ticket.priority} />
                  <SlaTag state={ticket.resolutionState} status={ticket.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/tickets?scope=assigned"
        className="mt-3 flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        Ver todos los asignados a mí <ArrowRightIcon className="h-3 w-3" />
      </Link>
    </Plate>
  );
}

/** Las cinco solicitudes más recientes que creé, con o sin respuesta (spec §7.2.1). */
function RequestsPanel() {
  const query = { scope: "mine" as const, sort: "recent" as const, limit: 5 };
  const { data, isPending } = useQuery({
    queryKey: ticketKeys.list(query),
    queryFn: () => listTickets(query),
  });
  const items = data?.items ?? [];

  return (
    <Plate className="p-4">
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
        Mis solicitudes
      </h2>
      {isPending ? (
        <p className="py-6 text-center text-sm text-[var(--content-ink-dim)]">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-[var(--content-ink-dim)]">Aún no has creado solicitudes</p>
          <Link
            to="/tickets/nuevo"
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim"
          >
            Crear mi primer ticket
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--content-border)]">
          {items.map((ticket) => (
            <li key={ticket.id}>
              <Link
                to={`/tickets/${formatTicketNumber(ticket.number)}`}
                className="flex flex-col gap-1 py-2.5 hover:opacity-80"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-display font-medium tabular text-[var(--content-ink)]">
                    {formatTicketNumber(ticket.number)}
                  </span>
                  <span className="truncate text-[var(--content-ink)]">{ticket.title}</span>
                </div>
                <RequestStatus ticket={ticket} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/tickets?scope=mine"
        className="mt-3 flex items-center gap-1 text-xs font-medium text-accent hover:underline"
      >
        Ver todas mis solicitudes <ArrowRightIcon className="h-3 w-3" />
      </Link>
    </Plate>
  );
}

/**
 * Lo que el solicitante necesita saber de un vistazo, en este orden: si el ticket
 * espera *su* respuesta, si ya le contestaron, o si todavía nadie lo ha tocado.
 */
function RequestStatus({ ticket }: { ticket: TicketListItem }) {
  if (ticket.status === "on_hold") {
    return (
      <span className="w-fit rounded-full bg-amber/15 px-2 py-0.5 text-xs font-medium text-amber">
        Necesita tu respuesta
      </span>
    );
  }
  if (ticket.firstResponseAt) {
    return (
      <span className="text-xs text-[var(--content-ink-dim)]">
        Respondieron · {formatWhen(ticket.firstResponseAt)}
      </span>
    );
  }
  return (
    <span className="w-fit rounded-full bg-[var(--content-bg)] px-2 py-0.5 text-xs text-[var(--content-ink-dim)]">
      Sin respuesta
    </span>
  );
}
