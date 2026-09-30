import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AvatarStack } from "../components/Avatar";
import { AreaTag, PriorityBadge, SlaTag, StatusBadge } from "../components/badges";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { StatTile } from "../components/StatTile";
import { CheckIcon, ClockIcon, DownloadIcon, ShieldIcon, StarIcon, TicketIcon } from "../components/icons";
import {
  CONTRACT_PRIORITY,
  CONTRACT_SLA,
  CONTRACT_STATUS,
  CURRENT_USER,
  PRIORITY_META,
  TICKETS,
  areaById,
  areaRefOf,
  formatWhen,
  userById,
  usersOf,
} from "../data/mock";
import { useTheme } from "../theme/ThemeContext";
import type { Priority, Ticket } from "../data/types";

type Scope = "todas" | "area";
type TabId = "plantillas" | "mis-reportes" | "nuevo";

// Priority is a chart CATEGORY here (identity), not an SLA/urgency READING, so it
// deliberately does not borrow the reserved red/amber/green trio (see DESIGN.md's
// "The Semantic Three Rule") or the accent indigo (reserved to AI/primary — "The
// Reserved Glow Rule"). A fresh magenta/blue/teal set carries priority identity
// instead; "Baja" rides the same neutral steel as an unweighted dial. Order matches
// the validated adjacency run (scripts/validate_palette.js, dataviz skill).
const PRIORITY_ORDER: Priority[] = ["alta", "urgente", "media", "baja"];

function useChartColors() {
  const { theme } = useTheme();
  const dark = theme === "dark";
  return {
    recibidos: dark ? "#8b7cf6" : "#6c5ce7",
    resueltos: dark ? "#2fa374" : "#1f9a63",
    bar: dark ? "#5b8fe0" : "#2f6fcb",
    alta: dark ? "#c24e8e" : "#d6449c",
    urgente: dark ? "#5b8fe0" : "#2f6fcb",
    media: dark ? "#1d9a78" : "#0e9c8e",
    baja: dark ? "#9aa8c4" : "#7c8cae",
    grid: dark ? "#272b34" : "#dbe0e9",
    axis: dark ? "#8b93a3" : "#5b6472",
    tooltipBg: dark ? "#1b1f27" : "#ffffff",
    tooltipBorder: dark ? "#272b34" : "#dbe0e9",
    tooltipInk: dark ? "#f5f7fa" : "#12141a",
  };
}

function lastNDays(n: number) {
  return Array.from({ length: n }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (n - 1 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

export default function ReportesPage() {
  const [scope, setScope] = useState<Scope>("area");
  const [tab, setTab] = useState<TabId>("plantillas");
  const colors = useChartColors();

  const scopeTickets = scope === "todas" ? TICKETS : TICKETS.filter((t) => t.areaId === CURRENT_USER.areaId);
  const area = areaById(CURRENT_USER.areaId);

  const byCategory = useMemo(() => {
    const cats = scope === "todas" ? Array.from(new Set(TICKETS.map((t) => t.category))) : area.categories;
    return cats
      .map((c) => ({ name: c, value: scopeTickets.filter((t) => t.category === c).length }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [scope, scopeTickets, area]);

  const byDay = useMemo(() => {
    const days = lastNDays(7);
    return days.map((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const recibidos = scopeTickets.filter((t) => {
        const c = new Date(t.createdAt);
        return c >= d && c < next;
      }).length;
      const resueltos = scopeTickets.filter((t) => {
        if (!t.resolvedAt) return false;
        const r = new Date(t.resolvedAt);
        return r >= d && r < next;
      }).length;
      return { day: d.toLocaleDateString("es-MX", { weekday: "short" }).replace(".", ""), recibidos, resueltos };
    });
  }, [scopeTickets]);

  const byPriority = useMemo(
    () =>
      PRIORITY_ORDER.map((p) => ({
        name: PRIORITY_META[p].label,
        key: p,
        value: scopeTickets.filter((t) => t.priority === p).length,
      })).filter((d) => d.value > 0),
    [scopeTickets]
  );

  const byPerson = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of scopeTickets) {
      if (t.status !== "resuelto" && t.status !== "cerrado") continue;
      for (const id of t.assignees) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([id, value]) => ({ name: userById(id)?.name.split(" ")[0] ?? id, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [scopeTickets]);

  const pendientes = scopeTickets.filter(
    (t) => t.status !== "resuelto" && t.status !== "cerrado" && t.status !== "cancelado" && t.status !== "fusionado"
  ).length;
  const compliant = scopeTickets.filter((t) => t.slaResolution !== "vencido").length;
  const compliance = scopeTickets.length ? Math.round((compliant / scopeTickets.length) * 100) : 100;
  const resolved = scopeTickets.filter((t) => t.status === "resuelto" || t.status === "cerrado").length;
  const withCsat = scopeTickets.filter((t) => t.csat !== undefined);
  const avgCsat = withCsat.length ? withCsat.reduce((s, t) => s + (t.csat ?? 0), 0) / withCsat.length : null;
  const withResponse = scopeTickets.filter((t) => t.firstResponseAt);
  const avgResponse = withResponse.length
    ? withResponse.reduce((s, t) => s + (new Date(t.firstResponseAt!).getTime() - new Date(t.createdAt).getTime()) / 3600000, 0) /
      withResponse.length
    : null;

  return (
    <div>
      <PageHeader
        title="Reportes y analítica"
        subtitle="Análisis del servicio, el desempeño y la carga de trabajo."
        actions={
          <>
            <div className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
              {(["todas", "area"] as Scope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    scope === s ? "bg-accent text-white" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                  }`}
                >
                  {s === "todas" ? "Todas las áreas" : `Mi área (${area.name})`}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]">
              <DownloadIcon className="h-3.5 w-3.5" /> Exportar
            </button>
          </>
        }
      />

      <div className="mb-5 flex gap-1 border-b border-[var(--content-border)]">
        {([
          { id: "mis-reportes", label: "Mis reportes" },
          { id: "plantillas", label: "Plantillas" },
          { id: "nuevo", label: "Nuevo reporte" },
        ] as { id: TabId; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id ? "text-accent" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "mis-reportes" && (
        <Plate className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-sm text-[var(--content-ink-dim)]">Aún no has guardado ningún reporte.</p>
          <button onClick={() => setTab("plantillas")} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
            Empezar desde una plantilla
          </button>
        </Plate>
      )}

      {tab === "nuevo" && (
        <Plate className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-sm text-[var(--content-ink-dim)]">Este reporte aún no tiene gráficas.</p>
          <button onClick={() => setTab("plantillas")} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
            Añade la primera o empieza desde una plantilla
          </button>
        </Plate>
      )}

      {tab === "plantillas" && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Tickets pendientes" value={String(pendientes)} icon={<TicketIcon className="h-4 w-4" />} />
            <StatTile label="Tickets resueltos" value={String(resolved)} icon={<CheckIcon className="h-4 w-4" />} />
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
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Plate className="p-4">
              <h3 className="mb-1 font-display text-sm font-semibold text-[var(--content-ink)]">Recibidos vs. resueltos</h3>
              <p className="mb-3 text-xs text-[var(--content-ink-dim)]">Últimos 7 días</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={byDay} margin={{ left: -20, right: 10 }}>
                  <defs>
                    <linearGradient id="gradRecibidos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.recibidos} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={colors.recibidos} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradResueltos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors.resueltos} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={colors.resueltos} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={colors.grid} vertical={false} />
                  <XAxis dataKey="day" stroke={colors.axis} fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke={colors.axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} width={24} />
                  <Tooltip contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: colors.tooltipInk }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: colors.axis }} />
                  <Area type="monotone" dataKey="recibidos" name="Recibidos" stroke={colors.recibidos} fill="url(#gradRecibidos)" strokeWidth={2} />
                  <Area type="monotone" dataKey="resueltos" name="Resueltos" stroke={colors.resueltos} fill="url(#gradResueltos)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Plate>

            <Plate className="p-4">
              <h3 className="mb-1 font-display text-sm font-semibold text-[var(--content-ink)]">Distribución por prioridad</h3>
              <p className="mb-3 text-xs text-[var(--content-ink-dim)]">Alcance actual</p>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byPriority} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2} label={({ value }) => value}>
                    {byPriority.map((d) => (
                      <Cell key={d.key} fill={colors[d.key as keyof typeof colors] as string} stroke={colors.tooltipBg} strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: colors.tooltipInk }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: colors.axis }} />
                </PieChart>
              </ResponsiveContainer>
            </Plate>

            <Plate className="p-4">
              <h3 className="mb-1 font-display text-sm font-semibold text-[var(--content-ink)]">Tickets por categoría</h3>
              <p className="mb-3 text-xs text-[var(--content-ink-dim)]">{scope === "todas" ? "Todas las áreas" : area.name}</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byCategory} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid stroke={colors.grid} horizontal={false} />
                  <XAxis type="number" stroke={colors.axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" stroke={colors.axis} fontSize={12} tickLine={false} axisLine={false} width={140} />
                  <Tooltip contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: colors.tooltipInk }} />
                  <Bar dataKey="value" name="Tickets" fill={colors.bar} radius={[0, 4, 4, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </Plate>

            <Plate className="p-4">
              <h3 className="mb-1 font-display text-sm font-semibold text-[var(--content-ink)]">Resueltos por persona</h3>
              <p className="mb-3 text-xs text-[var(--content-ink-dim)]">Ranking del período</p>
              {byPerson.length === 0 ? (
                <p className="py-10 text-center text-sm text-[var(--content-ink-dim)]">Sin resueltos en este alcance todavía.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={byPerson} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid stroke={colors.grid} horizontal={false} />
                    <XAxis type="number" stroke={colors.axis} fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke={colors.axis} fontSize={12} tickLine={false} axisLine={false} width={80} />
                    <Tooltip contentStyle={{ background: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: colors.tooltipInk }} />
                    <Bar dataKey="value" name="Resueltos" fill={colors.resueltos} radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Plate>
          </div>

          <TicketsOfPeriod tickets={scopeTickets} />
        </>
      )}
    </div>
  );
}

function TicketsOfPeriod({ tickets }: { tickets: Ticket[] }) {
  const sorted = [...tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return (
    <div className="mt-6">
      <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">Tickets del período</h2>
      <Plate className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
              <th className="px-3 py-2.5 font-medium">Número</th>
              <th className="px-3 py-2.5 font-medium">Título</th>
              <th className="px-3 py-2.5 font-medium">Área</th>
              <th className="px-3 py-2.5 font-medium">Prioridad</th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 font-medium">Encargados</th>
              <th className="px-3 py-2.5 font-medium">SLA</th>
              <th className="px-3 py-2.5 font-medium">CSAT</th>
              <th className="px-3 py-2.5 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.number} className="border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)]">
                <td className="px-3 py-2.5">
                  <Link to={`/tickets/${t.number}`} className="font-display tabular text-[var(--content-ink)] hover:underline">
                    {t.number}
                  </Link>
                </td>
                <td className="max-w-[200px] truncate px-3 py-2.5 text-[var(--content-ink)]">{t.title}</td>
                <td className="px-3 py-2.5"><AreaTag area={areaRefOf(t.areaId)} /></td>
                <td className="px-3 py-2.5"><PriorityBadge priority={CONTRACT_PRIORITY[t.priority]} /></td>
                <td className="px-3 py-2.5"><StatusBadge status={CONTRACT_STATUS[t.status]} /></td>
                <td className="px-3 py-2.5">{t.assignees.length ? <AvatarStack users={usersOf(t.assignees)} /> : "—"}</td>
                <td className="px-3 py-2.5"><SlaTag state={CONTRACT_SLA[t.slaResolution]} /></td>
                <td className="px-3 py-2.5 text-[var(--content-ink-dim)]">
                  {t.csat ? (
                    <span className="inline-flex items-center gap-1">
                      <StarIcon className="h-3 w-3 text-amber" /> {t.csat}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[var(--content-ink-dim)]">{formatWhen(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Plate>
      <p className="mt-3 text-xs text-[var(--content-ink-dim)]">{sorted.length} tickets en este período y alcance.</p>
    </div>
  );
}
