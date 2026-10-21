import {
  addDaysToKey,
  formatAssetNumber,
  formatWorkOrderNumber,
  PLAN_MODE_LABEL,
  WORK_ORDER_STATUS_LABEL,
  type AreaRef,
  type CalendarItem,
  type PlanView,
} from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type ComponentType, type SVGProps } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPlanCalendar, planKeys } from "../api/plans";
import { DropdownMenu, type DropdownItem } from "./DropdownMenu";
import { AlertIcon, CalendarIcon, CheckIcon, ChevronDownIcon, ClockIcon, FilterIcon, ShieldIcon } from "./icons";
import { Plate } from "./Plate";
import { Popover } from "./Popover";

// ── Fechas ────────────────────────────────────────────────────
// Todo son fechas de calendario "YYYY-MM-DD": un preventivo cae un día, no a una hora.

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
/** En la vista de mes, las tarjetas que caben en una casilla antes de "+N más". */
const CELL_LIMIT = 3;

const parse = (key: string) => key.split("-").map(Number) as [number, number, number];
const utc = (key: string) => {
  const [year, month, day] = parse(key);
  return new Date(Date.UTC(year, month - 1, day));
};
/** 0 = lunes … 6 = domingo. */
const weekdayOf = (key: string) => (utc(key).getUTCDay() + 6) % 7;
const lastOfMonth = (key: string) => {
  const [year, month] = parse(key);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
};
const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
const shiftMonth = (key: string, delta: number) => {
  const [year, month] = parse(key);
  return new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 10);
};
const format = (key: string, options: Intl.DateTimeFormatOptions) =>
  utc(key).toLocaleDateString("es-MX", { timeZone: "UTC", ...options });
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

type View = "month" | "week";

/** Semanas completas, de lunes a domingo: la rejilla del mes trae los días de los meses vecinos. */
function rangeOf(view: View, anchor: string): { from: string; to: string } {
  if (view === "week") {
    const from = addDaysToKey(anchor, -weekdayOf(anchor));
    return { from, to: addDaysToKey(from, 6) };
  }
  const first = monthStart(anchor);
  const last = lastOfMonth(anchor);
  return {
    from: addDaysToKey(first, -weekdayOf(first)),
    to: addDaysToKey(last, 6 - weekdayOf(last)),
  };
}

function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to; day = addDaysToKey(day, 1)) days.push(day);
  return days;
}

function rangeLabel(view: View, anchor: string, from: string, to: string): string {
  if (view === "month") return capitalize(format(anchor, { month: "long", year: "numeric" }));
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return sameMonth
    ? `${Number(from.slice(8))} – ${format(to, { day: "numeric", month: "short", year: "numeric" })}`
    : `${format(from, { day: "numeric", month: "short" })} – ${format(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

// ── Estados y filtros ─────────────────────────────────────────

type Kind = "projected" | "open" | "completed" | "overdue";

function kindOf(item: CalendarItem): Kind {
  if (item.kind === "projected" || !item.order) return "projected";
  if (item.order.overdue) return "overdue";
  return item.order.status === "completed" ? "completed" : "open";
}

/** El borde lleva el estado; el icono y el texto lo repiten, nunca solo el color. */
const KIND: Record<
  Kind,
  {
    label: string;
    card: string;
    icon: string;
    swatch: string;
    Icon: ComponentType<SVGProps<SVGSVGElement>>;
  }
> = {
  projected: {
    label: "Programadas",
    card: "border-dashed border-[var(--content-ink-dim)]/40",
    icon: "text-[var(--content-ink-dim)]",
    swatch: "border border-dashed border-[var(--content-ink-dim)]",
    Icon: ClockIcon,
  },
  open: {
    label: "Abiertas",
    card: "border-accent/50",
    icon: "text-accent-ink",
    swatch: "bg-accent",
    Icon: ShieldIcon,
  },
  completed: {
    label: "Completadas",
    card: "border-green/50",
    icon: "text-green",
    swatch: "bg-green",
    Icon: CheckIcon,
  },
  overdue: {
    label: "Vencidas",
    card: "border-red/55",
    icon: "text-red",
    swatch: "bg-red",
    Icon: AlertIcon,
  },
};
const KINDS = Object.keys(KIND) as Kind[];

// ── Calendario ────────────────────────────────────────────────

/**
 * Calendario de preventivos (plan A5): las OT generadas y las rondas que vienen,
 * por mes o por semana. Cada tarjeta lleva el estado en su borde, su icono y su
 * texto, y un menú con lo que se puede hacer desde ella.
 */
export function PlanCalendar({
  plans,
  onEditPlan,
}: {
  plans: readonly PlanView[];
  onEditPlan: (plan: PlanView) => void;
}) {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(localToday);
  const [hidden, setHidden] = useState<ReadonlySet<Kind>>(new Set());
  const [hiddenAreas, setHiddenAreas] = useState<ReadonlySet<string>>(new Set());

  const { from, to } = rangeOf(view, anchor);
  const { data, isLoading, error } = useQuery({
    queryKey: planKeys.calendar({ from, to }),
    queryFn: () => getPlanCalendar({ from, to }),
    placeholderData: (previous) => previous,
  });
  const today = data?.today ?? localToday();

  const allItems = data?.items ?? [];
  const areas = [...new Map(allItems.map((item) => [item.area.id, item.area])).values()].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
  const items = allItems.filter((item) => !hidden.has(kindOf(item)) && !hiddenAreas.has(item.area.id));
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) byDay.set(item.date, [...(byDay.get(item.date) ?? []), item]);
  const activeFilters = hidden.size + hiddenAreas.size;

  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  function actionsOf(item: CalendarItem): DropdownItem[] {
    const plan = item.planId ? planById.get(item.planId) : undefined;
    return [
      ...(item.order
        ? [
            {
              label: "Abrir orden",
              onSelect: () => navigate(`/ordenes/${formatWorkOrderNumber(item.order!.number)}`),
            },
          ]
        : []),
      ...(item.asset
        ? [
            {
              label: "Ver equipo",
              onSelect: () => navigate(`/activos/${formatAssetNumber(item.asset!.number)}`),
            },
          ]
        : []),
      ...(plan?.permissions.manage ? [{ label: "Editar plan", onSelect: () => onEditPlan(plan) }] : []),
    ];
  }

  function step(delta: number) {
    setAnchor((current) => (view === "month" ? shiftMonth(current, delta) : addDaysToKey(current, delta * 7)));
  }

  const toggle = <T,>(set: ReadonlySet<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  const buttonClass =
    "flex h-9 items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 text-sm font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]";
  const days = daysBetween(from, to);
  const visibleMonth = anchor.slice(0, 7);

  return (
    <div>
      {/* ── Barra: mes, filtros y vista ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {/* La clave reinicia el año del panel cuando cambia el del calendario. */}
        <MonthPicker
          key={anchor.slice(0, 4)}
          anchor={anchor}
          label={rangeLabel(view, anchor, from, to)}
          onPick={setAnchor}
          buttonClass={buttonClass}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={() => step(-1)}
            aria-label={view === "month" ? "Mes anterior" : "Semana anterior"}
            className={buttonClass}
          >
            ←
          </button>
          <button
            onClick={() => step(1)}
            aria-label={view === "month" ? "Mes siguiente" : "Semana siguiente"}
            className={buttonClass}
          >
            →
          </button>
        </div>
        <button onClick={() => setAnchor(localToday())} className={buttonClass}>
          Hoy
        </button>

        <Popover
          label="Filtros del calendario"
          title="Filtros"
          triggerClassName={(open) =>
            `${buttonClass} ${open || activeFilters ? "border-accent ring-2 ring-accent/20" : ""}`
          }
          trigger={
            <>
              <FilterIcon className="h-4 w-4" aria-hidden="true" /> Filtro
              {activeFilters > 0 && (
                <span className="rounded-full bg-accent px-1.5 font-display text-[10px] font-semibold text-white">
                  {activeFilters}
                </span>
              )}
            </>
          }
        >
          <div className="space-y-3 p-4">
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-[var(--content-ink-dim)]">Estado</legend>
              {KINDS.map((kind) => (
                <FilterCheck
                  key={kind}
                  label={KIND[kind].label}
                  swatch={KIND[kind].swatch}
                  checked={!hidden.has(kind)}
                  onChange={() => setHidden((current) => toggle(current, kind))}
                />
              ))}
            </fieldset>
            {areas.length > 1 && (
              <fieldset>
                <legend className="mb-1.5 text-xs font-medium text-[var(--content-ink-dim)]">Área</legend>
                {areas.map((area: AreaRef) => (
                  <FilterCheck
                    key={area.id}
                    label={area.name}
                    swatchColor={area.color}
                    checked={!hiddenAreas.has(area.id)}
                    onChange={() => setHiddenAreas((current) => toggle(current, area.id))}
                  />
                ))}
              </fieldset>
            )}
            {activeFilters > 0 && (
              <button
                onClick={() => {
                  setHidden(new Set());
                  setHiddenAreas(new Set());
                }}
                className="text-xs font-medium text-accent-ink hover:underline"
              >
                Mostrar todo
              </button>
            )}
          </div>
        </Popover>

        <span className="mx-1 hidden h-6 w-px bg-[var(--content-border)] sm:block" aria-hidden="true" />
        <div
          role="group"
          aria-label="Vista del calendario"
          className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5"
        >
          {(["month", "week"] as const).map((option) => (
            <button
              key={option}
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={`h-8 rounded-md px-3 text-sm font-medium ${
                view === option
                  ? "bg-[var(--content-bg)] text-[var(--content-ink)] shadow-sm"
                  : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
              }`}
            >
              {option === "month" ? "Mes" : "Semana"}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <Plate className="py-16 text-center text-sm text-red">{error.message}</Plate>
      ) : isLoading ? (
        <Plate className="flex items-center justify-center py-16">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
            aria-label="Cargando calendario"
          />
        </Plate>
      ) : (
        <>
          {/* En el móvil, la agenda: siete columnas no caben en 360 px. */}
          <Agenda
            days={days.filter((day) => view === "week" || day.startsWith(visibleMonth))}
            byDay={byDay}
            today={today}
            actionsOf={actionsOf}
          />

          <Plate className="hidden overflow-hidden sm:block">
            <div className="grid grid-cols-7 border-b border-[var(--content-border)]">
              {WEEKDAYS.map((name, index) => (
                <div
                  key={name}
                  className="py-2.5 text-center font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--content-ink-dim)]"
                >
                  {name}
                  {view === "week" && <span className="ml-1 tabular">{Number(days[index]!.slice(8))}</span>}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const outside = view === "month" && !day.startsWith(visibleMonth);
                const dayItems = byDay.get(day) ?? [];
                const shown = view === "month" ? dayItems.slice(0, CELL_LIMIT) : dayItems;
                return (
                  <div
                    key={day}
                    className={`flex flex-col gap-1.5 border-b border-r border-[var(--content-border)] p-2 [&:nth-child(7n)]:border-r-0 ${
                      view === "month" ? "min-h-[132px]" : "min-h-[320px]"
                    } ${outside ? "bg-[var(--content-bg)]/50" : ""}`}
                  >
                    {view === "month" && (
                      <span
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full font-display text-sm tabular ${
                          day === today
                            ? "bg-accent font-semibold text-white"
                            : outside
                              ? "text-[var(--content-ink-dim)]"
                              : "text-[var(--content-ink)]"
                        }`}
                      >
                        {Number(day.slice(8))}
                      </span>
                    )}
                    {view === "week" && day === today && (
                      <span className="self-start rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white">
                        Hoy
                      </span>
                    )}
                    {shown.map((item) => (
                      <CalendarCard key={keyOf(item)} item={item} actions={actionsOf(item)} />
                    ))}
                    {dayItems.length > shown.length && (
                      <button
                        onClick={() => {
                          setAnchor(day);
                          setView("week");
                        }}
                        className="self-start rounded-md px-1.5 py-0.5 text-xs font-medium text-accent-ink hover:bg-[var(--content-bg)]"
                      >
                        +{dayItems.length - shown.length} más
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Plate>

          {view === "week" && items.length === 0 && (
            <p className="mt-3 hidden text-center text-sm text-[var(--content-ink-dim)] sm:block">
              Nada programado esta semana
              {activeFilters > 0 ? " con estos filtros" : ""}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[var(--content-ink-dim)]">
            {KINDS.map((kind) => (
              <span key={kind} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${KIND[kind].swatch}`} aria-hidden="true" />
                {KIND[kind].label}
              </span>
            ))}
            <span>
              · De un plan «{PLAN_MODE_LABEL.from_last}» solo se conoce la próxima ronda: las siguientes dependen de
              cuándo se complete.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

const keyOf = (item: CalendarItem) => item.order?.id ?? `${item.planId ?? ""}-${item.date}-${item.asset?.id ?? "tipo"}`;

function subtitleOf(item: CalendarItem): string {
  const what = item.asset ? item.asset.name : `${item.assetCount ?? 0} equipos`;
  if (!item.order) return `${what} · sin orden todavía`;
  return `${what} · ${item.order.overdue ? "Vencida" : WORK_ORDER_STATUS_LABEL[item.order.status]}`;
}

/**
 * Una tarjeta del calendario. El título es el enlace a la orden y su área de
 * pulsación cubre la tarjeta entera; el menú queda por encima para no anidar un
 * botón dentro de un enlace.
 */
function CalendarCard({ item, actions }: { item: CalendarItem; actions: DropdownItem[] }) {
  const kind = kindOf(item);
  const { Icon } = KIND[kind];
  return (
    <div
      className={`relative rounded-lg border bg-[var(--content-surface)] px-2 py-1.5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors hover:bg-[var(--content-bg)] ${KIND[kind].card}`}
    >
      <div className="flex items-start justify-between gap-1">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${KIND[kind].icon}`} aria-hidden="true" />
        {item.order && (
          <span className="font-display text-[10px] tabular text-[var(--content-ink-dim)]">
            {formatWorkOrderNumber(item.order.number)}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-start gap-1">
        <p className="line-clamp-2 min-w-0 flex-1 text-xs font-semibold leading-snug text-[var(--content-ink)]">
          {item.order ? (
            <Link
              to={`/ordenes/${formatWorkOrderNumber(item.order.number)}`}
              className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-accent"
            >
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </p>
        {actions.length > 0 && (
          <span className="relative z-10 -mr-1 -mt-1 shrink-0 [&_button]:h-6 [&_button]:w-6">
            <DropdownMenu label={`Acciones de ${item.title}`} items={actions} />
          </span>
        )}
      </div>
      <p className="truncate text-[11px] text-[var(--content-ink-dim)]">{subtitleOf(item)}</p>
    </div>
  );
}

function Agenda({
  days,
  byDay,
  today,
  actionsOf,
}: {
  days: string[];
  byDay: Map<string, CalendarItem[]>;
  today: string;
  actionsOf: (item: CalendarItem) => DropdownItem[];
}) {
  const busy = days.filter((day) => byDay.has(day));
  if (!busy.length) {
    return (
      <Plate className="py-10 text-center text-sm text-[var(--content-ink-dim)] sm:hidden">
        Nada programado en estas fechas.
      </Plate>
    );
  }
  return (
    <ul className="space-y-4 sm:hidden">
      {busy.map((day) => (
        <li key={day}>
          <h3
            className={`mb-1.5 text-xs font-semibold ${day === today ? "text-accent-ink" : "text-[var(--content-ink-dim)]"}`}
          >
            {capitalize(format(day, { weekday: "long", day: "numeric", month: "short" }))}
            {day === today && " · hoy"}
          </h3>
          <div className="space-y-1.5">
            {byDay.get(day)!.map((item) => (
              <CalendarCard key={keyOf(item)} item={item} actions={actionsOf(item)} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}

function FilterCheck({
  label,
  checked,
  onChange,
  swatch,
  swatchColor,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  swatch?: string;
  swatchColor?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 text-sm text-[var(--content-ink)] hover:bg-[var(--content-bg)]">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 accent-[var(--accent)]" />
      <span
        className={`h-2.5 w-2.5 rounded-sm ${swatch ?? ""}`}
        style={swatchColor ? { background: swatchColor } : undefined}
        aria-hidden="true"
      />
      {label}
    </label>
  );
}

/** El mes a la vista, con un panel para saltar a cualquier mes del año. */
function MonthPicker({
  anchor,
  label,
  onPick,
  buttonClass,
}: {
  anchor: string;
  label: string;
  onPick: (key: string) => void;
  buttonClass: string;
}) {
  const [year, setYear] = useState(() => Number(anchor.slice(0, 4)));
  return (
    <Popover
      label="Elegir mes"
      triggerClassName={`${buttonClass} min-w-[11rem] justify-between`}
      trigger={
        <>
          <span className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-[var(--content-ink-dim)]" aria-hidden="true" />
            <span aria-live="polite">{label}</span>
          </span>
          <ChevronDownIcon className="h-4 w-4 text-[var(--content-ink-dim)]" aria-hidden="true" />
        </>
      }
    >
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={() => setYear((current) => current - 1)}
            aria-label="Año anterior"
            className="rounded-md px-2 py-1 text-sm hover:bg-[var(--content-bg)]"
          >
            ←
          </button>
          <span className="font-display text-sm font-semibold tabular text-[var(--content-ink)]">{year}</span>
          <button
            onClick={() => setYear((current) => current + 1)}
            aria-label="Año siguiente"
            className="rounded-md px-2 py-1 text-sm hover:bg-[var(--content-bg)]"
          >
            →
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {MONTHS.map((name, index) => {
            const key = `${year}-${String(index + 1).padStart(2, "0")}-01`;
            const current = key.slice(0, 7) === anchor.slice(0, 7);
            return (
              <button
                key={name}
                aria-pressed={current}
                data-popover-close
                onClick={() => onPick(key)}
                className={`rounded-md py-1.5 text-sm ${
                  current
                    ? "bg-accent font-semibold text-white"
                    : "text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
    </Popover>
  );
}
