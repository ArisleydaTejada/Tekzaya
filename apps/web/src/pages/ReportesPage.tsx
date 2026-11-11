import {
  PERSPECTIVE_LABEL,
  PERSPECTIVES,
  REPORT_SOURCE_LABEL,
  REPORT_SOURCES,
  STATS_PERIOD_LABEL,
  STATS_PERIODS,
  type ReportCatalog,
  type ReportDefinition,
  type ReportSource,
  type ReportTemplate,
  type ReportWidget,
  type SavedReport,
  STATS_SCOPES,
  PRIORITIES,
  TICKET_STATUSES,
  SLA_STATES,
  CSAT_RATINGS,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  createSavedReport,
  deleteSavedReport,
  duplicateSavedReport,
  getReportCatalog,
  listSavedReports,
  reportKeys,
  updateSavedReport,
  type ReportScopeRequest,
} from "../api/reports";
import { areaKeys, listAreaMembers, listAreas } from "../api/tickets";
import { useAuth } from "../auth/AuthContext";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { ChevronDownIcon, DownloadIcon, ChartIcon, PlusIcon, XIcon } from "../components/icons";
import { TicketsOfPeriod } from "./reportes/TicketsOfPeriod";
import { WidgetCard } from "./reportes/WidgetCard";
import { WidgetEditor } from "./reportes/WidgetEditor";
import { WorkOrdersOfPeriod, type WorkOrderListFilters } from "./reportes/WorkOrdersOfPeriod";
import { allOf, oneOf } from "../lib/oneOf";

/** Reporte que se está viendo: una plantilla abierta, uno guardado o un lienzo nuevo. */
interface Draft extends ReportDefinition {
  /** Identificador del reporte guardado, si viene de uno. */
  id?: string;
  title: string;
  description?: string;
  /** Hay cambios sin guardar. */
  dirty: boolean;
  /** El alcance guardado no cabe en el rol actual y se abrió recortado (spec §7.8.1). */
  narrowed?: boolean;
}

const EMPTY: Omit<Draft, "scope"> = {
  title: "Reporte sin título",
  period: "month",
  widgets: [],
  dirty: false,
};

/**
 * El panel plegado se recuerda en el navegador: es preferencia de quien mira,
 * no del reporte ni de la cuenta.
 */
const RAIL_KEY = "tekzaya-reportes-rail";

function readRailOpen(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) !== "0";
  } catch {
    /* modo privado o almacenamiento bloqueado: abierto, como siempre */
    return true;
  }
}

export default function ReportesPage() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [railOpen, setRailOpen] = useState(readRailOpen);

  // Debajo de `xl` el panel va apilado encima del reporte: abierto, el reporte elegido queda fuera de la vista.
  function closeRailIfStacked() {
    if (!window.matchMedia("(min-width: 80rem)").matches) setRailOpen(false);
  }

  /** `null` es la que toque: plantillas sin nada guardado, reportes propios si los hay. */
  const [railTab, setRailTab] = useState<RailTab | null>(null);
  /**
   * Módulo que lista el panel; se puede pedir con `?modulo=mantenimiento`.
   * Con `null` sigue al reporte abierto, para no tener que volver a elegirlo.
   */
  const [searchParams] = useSearchParams();

  const [railSource, setRailSource] = useState<ReportSource | null>(() =>
    searchParams.get("modulo") === "mantenimiento" ? "maintenance" : null,
  );

  const [workOrderFilters, setWorkOrderFilters] = useState<WorkOrderListFilters>({});
  const [edited, setEdited] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<ReportWidget | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketFilters, setTicketFilters] = useState<NonNullable<ReportDefinition["ticketFilters"]>>({});

  const catalog = useQuery({ queryKey: reportKeys.catalog(), queryFn: getReportCatalog });
  const saved = useQuery({ queryKey: reportKeys.saved(), queryFn: listSavedReports });

  useEffect(() => {
    try {
      window.localStorage.setItem(RAIL_KEY, railOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [railOpen]);

  /**
   * Sin elección se muestra la primera plantilla del rol, que es lo que promete
   * "Ver gráficas en Reportes". En cuanto se edita algo, manda `edited`.
   */
  const fallback = useMemo(() => {
    const templates = catalog.data?.templates ?? [];

    // Si se llegó pidiendo un módulo, se abre la primera plantilla de ese módulo.
    const first =
      (railSource && templates.find((template) => reportSourceOf(template.widgets) === railSource)) || templates[0];

    return first ? fromTemplate(first) : null;
  }, [catalog.data, railSource]);

  const draft = edited ?? fallback;

  /** Un lienzo vacío toma el módulo del panel: "Nuevo reporte" desde mantenimiento empieza uno de mantenimiento. */
  const draftSource: ReportSource =
    draft && draft.widgets.length > 0 ? reportSourceOf(draft.widgets) : (railSource ?? "tickets");

  const shownRailSource: ReportSource = railSource ?? (draft ? draftSource : "tickets");
  const setDraft = setEdited;

  const scope: ReportScopeRequest = useMemo(
    () =>
      draft
        ? {
            scope: draft.scope,
            areaId: draft.areaId || undefined,
            userId: draft.userId || undefined,
            period: draft.period,
            from: draft.from || undefined,
            to: draft.to || undefined,
          }
        : { scope: "me", period: "month" },
    [draft],
  );

  /**
   * Un empleado ve la lista de su área aunque sus gráficas sean solo suyas (spec §7.5,
   * única excepción del §7.8.9). Si un supervisor elige "Yo", la lista también se acota.
   */
  const listScope: ReportScopeRequest = useMemo(
    () =>
      catalog.data?.maxScope === "me"
        ? { period: scope.period, from: scope.from || undefined, to: scope.to || undefined, scope: "area" }
        : scope,
    [catalog.data, scope],
  );

  const createMutation = useMutation({
    mutationFn: createSavedReport,
    onSuccess: (report) => {
      void queryClient.invalidateQueries({ queryKey: reportKeys.saved() });
      setDraft(fromSaved(report));
    },
    onError: (cause: Error) => setError(cause.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Parameters<typeof updateSavedReport>[1] }) =>
      updateSavedReport(id, input),
    onSuccess: (report) => {
      void queryClient.invalidateQueries({ queryKey: reportKeys.saved() });
      setDraft(fromSaved(report));
    },
    onError: (cause: Error) => setError(cause.message),
  });

  if (!me || !catalog.data) {
    return (
      <div>
        <PageHeader title="Reportes y analítica" subtitle="Cargando el catálogo de medidas…" />
        <Plate className="h-64 animate-pulse" />
      </div>
    );
  }

  const update = (patch: Partial<Draft>) =>
    setEdited((current) => {
      const base = current ?? fallback;

      return base ? { ...base, ...patch, dirty: true } : null;
    });

  const save = () => {
    if (!draft) return;
    setError(null);

    const definition = {
      title: draft.title,
      description: draft.description || undefined,
      scope: draft.scope,
      areaId: draft.areaId || undefined,
      userId: draft.userId || undefined,
      period: draft.period,
      from: draft.from || undefined,
      to: draft.to || undefined,
      perspective: draft.perspective || undefined,
      widgets: draft.widgets,
      ticketFilters,
    };

    if (draft.id) updateMutation.mutate({ id: draft.id, input: definition });
    else createMutation.mutate(definition);
  };

  /**
   * Pulsar un valor filtra la lista de abajo (spec §7.8.2). Las dimensiones sin filtro
   * equivalente (el tiempo, el resultado de la IA) no hacen nada.
   */
  const drillInto = (dimension: string, key: string, source: ReportSource) => {
    // Cada gráfica filtra la lista de su propio módulo, y solo si es la que se ve.
    if (source !== draftSource) return;

    if (source === "maintenance") {
      const filter = WORK_ORDER_DRILL_FILTERS.get(dimension)?.(key);

      if (!filter) return;
      setWorkOrderFilters({ ...workOrderFilters, ...filter });
      document.getElementById("ordenes-del-periodo")?.scrollIntoView({ behavior: "smooth" });

      return;
    }

    const filter = DRILL_FILTERS.get(dimension)?.(key);

    if (!filter) return;
    setTicketFilters({ ...ticketFilters, ...filter });
    document.getElementById("tickets-del-periodo")?.scrollIntoView({ behavior: "smooth" });
  };

  const personal = draft?.scope === "me" || draft?.scope === "user";

  return (
    <div>
      <PageHeader
        title="Reportes y analítica"
        subtitle="Análisis del servicio, el desempeño y la carga de trabajo."
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <ScopeSelector catalog={catalog.data} draft={draft} myAreaId={me.areaId} onChange={update} />
            <div className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
              {STATS_PERIODS.filter((item) => item !== "range").map((item) => (
                <button
                  key={item}
                  onClick={() => update({ period: item })}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    draft?.period === item
                      ? "bg-accent text-white"
                      : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                  }`}
                >
                  {STATS_PERIOD_LABEL[item]}
                </button>
              ))}
              <RangePicker draft={draft} onChange={update} />
            </div>
            <ExportMenu
              open={exportOpen}
              setOpen={setExportOpen}
              onPdf={() => {
                setExportOpen(false);
                window.print();
              }}
            />
          </div>
        }
      />

      {/* Plantillas y reportes van en una columna aparte para no tapar el reporte abierto.
          Se repliega para dar todo el ancho y no se imprime. */}
      <div className="flex flex-col items-start gap-5 xl:flex-row">
        <div className="w-full min-w-0 flex-1">
          {draft && (
            <>
          {/* ── Barra de acciones del reporte (spec §7.8.2) ── */}
          <div className="no-print mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <input
                value={draft.title}
                onChange={(event) => update({ title: event.target.value })}
                className="w-full max-w-sm truncate rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-display text-lg font-semibold text-[var(--content-ink)] hover:border-[var(--content-border)] focus:border-accent focus:outline-none"
                aria-label="Nombre del reporte"
              />
              {draft.narrowed && (
                <p className="mt-0.5 px-1 text-xs text-amber">
                  Este reporte se guardó con un alcance mayor que el de tu rol actual: se
                  muestra con los datos que puedes ver.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {personal && (
                <div className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
                  {PERSPECTIVES.map((item) => (
                    <button
                      key={item}
                      onClick={() => update({ perspective: item })}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        (draft.perspective ?? "agent") === item
                          ? "bg-accent text-white"
                          : "text-[var(--content-ink-dim)]"
                      }`}
                    >
                      {PERSPECTIVE_LABEL[item]}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setEditing(blankWidget(draft.widgets.length, draftSource))}
                disabled={draft.widgets.length >= catalog.data.limits.maxWidgetsPerReport}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:opacity-40"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Añadir gráfica
              </button>
              <button
                onClick={save}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {draft.id ? (draft.dirty ? "Guardar cambios" : "Guardado") : "Guardar reporte"}
              </button>
              {/* El único interruptor del panel, y vive en el lienzo: plegado,
                  dentro del panel no quedaría nada que pulsar para volver. */}
              <button
                onClick={() => setRailOpen((value) => !value)}
                title={railOpen ? "Ocultar el panel de reportes" : "Mostrar el panel de reportes"}
                aria-expanded={railOpen}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
              >
                <ChartIcon className="h-3.5 w-3.5 -scale-x-100" /> Reportes
              </button>
              {draft.id && (
                <button
                  onClick={() => setDraft({ ...draft, id: undefined, title: `${draft.title} (copia)`, dirty: true })}
                  className="rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--content-ink)]"
                >
                  Guardar como…
                </button>
              )}
            </div>
          </div>

          {error && <p className="no-print mt-2 text-xs text-red">{error}</p>}

          {/* ── Cuadrícula de gráficas ── */}
          {draft.widgets.length === 0 ? (
            <Plate className="mt-4 flex flex-col items-center gap-3 py-14 text-center">
              <p className="text-sm text-[var(--content-ink-dim)]">
                Este reporte aún no tiene gráficas.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(blankWidget(0, draftSource))}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Añade la primera
                </button>
                <button
                  onClick={() => {
                    setRailOpen(true);
                    setRailTab("templates");
                  }}
                  className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-semibold text-[var(--content-ink)]"
                >
                  Empieza desde una plantilla
                </button>
              </div>
            </Plate>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
              {draft.widgets.map((widget) => (
                <WidgetCard
                  key={widget.id}
                  widget={{ ...widget, perspective: draft.perspective || widget.perspective }}
                  scope={scope}
                  editable
                  onEdit={() => setEditing(widget)}
                  onRemove={() =>
                    update({ widgets: draft.widgets.filter((item) => item.id !== widget.id) })
                  }
                  onDrill={drillInto}
                />
              ))}
            </div>
          )}

          {/* La lista es la del módulo del reporte: debajo de un MTBF no
              explica nada una lista de tickets. */}
          {draftSource === "maintenance" ? (
            <>
              <a
                href="#ordenes-del-periodo"
                className="no-print mt-4 inline-block text-xs font-medium text-accent-ink hover:underline"
              >
                Ir a la lista de órdenes de trabajo ↓
              </a>
              <WorkOrdersOfPeriod
                scope={scope}
                filters={workOrderFilters}
                onFiltersChange={setWorkOrderFilters}
              />
            </>
          ) : (
            <>
              <a
                href="#tickets-del-periodo"
                className="no-print mt-4 inline-block text-xs font-medium text-accent-ink hover:underline"
              >
                Ir a la lista de tickets ↓
              </a>
              <TicketsOfPeriod
                scope={listScope}
                filters={ticketFilters}
                onFiltersChange={setTicketFilters}
              />
            </>
          )}
            </>
          )}
        </div>

        {/* El interruptor del panel vive en la barra del reporte; sin reporte abierto
            el panel se queda puesto para que la página ofrezca algo. */}
        <ReportsRail
          open={railOpen || !draft}
          onToggle={() => setRailOpen((value) => !value)}
          tab={railTab ?? ((saved.data?.length ?? 0) > 0 ? "saved" : "templates")}
          onTabChange={setRailTab}
          source={shownRailSource}
          onSourceChange={setRailSource}
          templates={catalog.data.templates}
          reports={saved.data ?? []}
          loadingReports={saved.isPending}
          activeTemplate={draft?.id ? undefined : draft?.title}
          activeReportId={draft?.id}
          onNew={() => {
            // El lienzo vacío hereda el módulo que se estaba mirando; se fija para
            // que el panel no salte a tickets al quedarse sin gráficas.
            setRailSource(shownRailSource);
            setDraft({ ...EMPTY, scope: catalog.data!.maxScope, dirty: false });
            closeRailIfStacked();
          }}
          onOpenTemplate={(template) => {
            setDraft(fromTemplate(template));
            closeRailIfStacked();
          }}
          onOpenReport={(report) => {
            setDraft(fromSaved(report));
            closeRailIfStacked();
          }}
          onDuplicate={async (id) => {
            await duplicateSavedReport(id);
            void queryClient.invalidateQueries({ queryKey: reportKeys.saved() });
          }}
          onDelete={async (id) => {
            await deleteSavedReport(id);
            void queryClient.invalidateQueries({ queryKey: reportKeys.saved() });

            if (draft?.id === id) setDraft(null);
          }}
        />
      </div>

      {editing && (
        <WidgetEditor
          widget={editing}
          catalog={catalog.data}
          scope={scope}
          onClose={() => setEditing(null)}
          onSave={(widget) => {
            const exists = draft?.widgets.some((item) => item.id === widget.id);
            update({
              widgets: exists
                ? draft!.widgets.map((item) => (item.id === widget.id ? widget : item))
                : [...(draft?.widgets ?? []), widget],
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// Selectores del encabezado

/** El alcance se arma con lo que el servidor concedería (spec §7.8.1), que igualmente lo recalcula. */
function ScopeSelector({
  catalog,
  draft,
  myAreaId,
  onChange,
}: {
  catalog: ReportCatalog;
  draft: Draft | null;
  /** Área de quien mira: la de "Una persona de mi área" cuando no se eligió otra. */
  myAreaId: string;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const areas = useQuery({
    queryKey: areaKeys.all,
    queryFn: listAreas,
    enabled: catalog.maxScope === "global",
  });

  /* El supervisor no elige área, así que sin `areaId` las personas son las de su propia área. */
  const memberAreaId = draft?.areaId ?? (catalog.maxScope === "global" ? undefined : myAreaId);

  const members = useQuery({
    queryKey: areaKeys.members(memberAreaId ?? ""),
    queryFn: () => listAreaMembers(memberAreaId!),
    enabled: draft?.scope === "user" && Boolean(memberAreaId),
  });

  if (catalog.scopes.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="group"
        aria-label="Alcance"
        className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5"
      >
        {catalog.scopes.map((item) => (
          <button
            key={item.id}
            aria-pressed={draft?.scope === item.id}
            onClick={() => {
              const scope = oneOf(STATS_SCOPES, item.id);

              if (!scope) return;

              const patch: Partial<Draft> = { scope };

              // Elegir "un área" o "una persona" arranca en la propia: es el caso
              // normal y evita un selector vacío esperando una decisión.
              if (item.id === "user" && !draft?.areaId) patch.areaId = undefined;
              onChange(patch);
            }}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              draft?.scope === item.id
                ? "bg-accent text-white"
                : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {draft?.scope === "area" && catalog.maxScope === "global" && (
        <select
          aria-label="Área del reporte"
          value={draft.areaId ?? ""}
          onChange={(event) => onChange({ areaId: event.target.value || undefined })}
          className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2 py-1.5 text-xs text-[var(--content-ink)]"
        >
          <option value="">Mi área</option>
          {(areas.data ?? []).map((area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
        </select>
      )}

      {draft?.scope === "user" && (
        <div className="flex items-center gap-1.5">
          {catalog.maxScope === "global" && (
            <select
              aria-label="Área de la persona"
              value={draft.areaId ?? ""}
              onChange={(event) => onChange({ areaId: event.target.value || undefined, userId: undefined })}
              className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2 py-1.5 text-xs text-[var(--content-ink)]"
            >
              <option value="">Área…</option>
              {(areas.data ?? []).map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          )}
          <select
            aria-label="Persona del reporte"
            value={draft.userId ?? ""}
            onChange={(event) => onChange({ userId: event.target.value || undefined })}
            className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2 py-1.5 text-xs text-[var(--content-ink)]"
          >
            <option value="">Persona…</option>
            {(members.data ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/** Rango personalizado: entra en el mismo grupo de botones que los períodos fijos. */
function RangePicker({
  draft,
  onChange,
}: {
  draft: Draft | null;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = draft?.period === "range";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
          active ? "bg-accent text-white" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
        }`}
      >
        {STATS_PERIOD_LABEL.range}
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} aria-label="Cerrar" />
          <div className="absolute right-0 z-30 mt-1 flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-2 shadow-[var(--content-shadow)]">
            <input
              type="date"
              value={draft?.from ?? ""}
              onChange={(event) => onChange({ period: "range", from: event.target.value })}
              className="rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1 text-xs text-[var(--content-ink)]"
            />
            <span className="text-xs text-[var(--content-ink-dim)]">a</span>
            <input
              type="date"
              value={draft?.to ?? ""}
              onChange={(event) => onChange({ period: "range", to: event.target.value })}
              className="rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1 text-xs text-[var(--content-ink)]"
            />
          </div>
        </>
      )}
    </div>
  );
}

/** El PDF sale del navegador tal como se ve (spec §7.8.8); los CSV van en cada gráfica y en la lista. */
function ExportMenu({
  open,
  setOpen,
  onPdf,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  onPdf: () => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
      >
        <DownloadIcon className="h-3.5 w-3.5" /> Exportar <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} aria-label="Cerrar" />
          <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-1 shadow-[var(--content-shadow)]">
            <button
              onClick={onPdf}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
            >
              Imprimir o guardar PDF
            </button>
            <p className="px-2.5 py-1.5 text-[11px] leading-snug text-[var(--content-ink-dim)]">
              El CSV de cada gráfica está en su menú ⋯, y el de la lista de tickets, en
              la propia lista.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// Pestañas de reportes

type RailTab = "templates" | "saved";

/**
 * Plantillas y reportes propios en pestañas, marcando lo que se ve. Arranca en "Mis reportes"
 * si hay alguno guardado y, si no, en las plantillas.
 */
function ReportsRail({
  open,
  onToggle,
  tab,
  onTabChange,
  source,
  onSourceChange,
  templates,
  reports,
  loadingReports,
  activeTemplate,
  activeReportId,
  onNew,
  onOpenTemplate,
  onOpenReport,
  onDuplicate,
  onDelete,
}: {
  open: boolean;
  onToggle: () => void;
  tab: RailTab;
  onTabChange: (tab: RailTab) => void;
  source: ReportSource;
  onSourceChange: (source: ReportSource) => void;
  templates: ReportTemplate[];
  reports: SavedReport[];
  loadingReports: boolean;
  activeTemplate?: string;
  activeReportId?: string;
  onNew: () => void;
  onOpenTemplate: (template: ReportTemplate) => void;
  onOpenReport: (report: SavedReport) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  /* Plegado no deja nada: con botón o columna vacía, el lienzo dejaba un hueco a la derecha. */
  if (!open) return null;

  /*
   * Las listas se separan por módulo, con un selector compartido entre plantillas y reportes.
   * Solo aparece si el rol tiene plantillas de los dos módulos.
   */
  const templatesOf = (key: ReportSource) => templates.filter((item) => reportSourceOf(item.widgets) === key);
  const reportsOf = (key: ReportSource) => reports.filter((item) => reportSourceOf(item.widgets) === key);
  const sourceGroups = REPORT_SOURCES.filter((key) => templatesOf(key).length > 0);
  const split = sourceGroups.length > 1;
  const shownSource = sourceGroups.includes(source) ? source : (sourceGroups[0] ?? "tickets");
  const shownTemplates = split ? templatesOf(shownSource) : templates;
  const shownReports = split ? reportsOf(shownSource) : reports;
  const sourceLabel = REPORT_SOURCE_LABEL[shownSource].toLowerCase();

  /*
   * En `xl` el panel queda fijo bajo la barra superior (4rem + 1.5rem) y desborda la lista, no el panel,
   * para que título, "Nuevo reporte" y pestañas sigan a la vista. Debajo de `xl` va apilado.
   */
  return (
    <aside className="no-print order-first w-full shrink-0 xl:sticky xl:top-22 xl:order-none xl:w-72">
      <Plate className="flex flex-col p-3 xl:max-h-[calc(100dvh-7rem)]">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
          <h2 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--content-ink)]">
            Reportes
          </h2>
          <button
            onClick={onToggle}
            title="Ocultar el panel"
            aria-label="Ocultar el panel de reportes"
            className="text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <button
          onClick={onNew}
          className="mb-4 flex w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Nuevo reporte
        </button>

        {split && (
          <div
            role="group"
            aria-label="Módulo"
            className="mb-3 flex shrink-0 gap-1 border-b border-[var(--content-border)]"
          >
            {sourceGroups.map((key) => (
              <button
                key={key}
                aria-pressed={shownSource === key}
                onClick={() => onSourceChange(key)}
                className={`-mb-px flex-1 border-b-2 px-2 pb-1.5 pt-0.5 text-xs font-medium transition-colors ${
                  shownSource === key
                    ? "border-accent text-[var(--content-ink)]"
                    : "border-transparent text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                }`}
              >
                {REPORT_SOURCE_LABEL[key]}
              </button>
            ))}
          </div>
        )}

        <div
          role="tablist"
          className="mb-3 flex shrink-0 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] p-0.5"
        >
          {(
            [
              { id: "templates", label: "Plantillas", count: shownTemplates.length },
              { id: "saved", label: "Mis reportes", count: shownReports.length },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              id={`reportes-tab-${item.id}`}
              role="tab"
              aria-selected={tab === item.id}
              aria-controls="reportes-panel"
              onClick={() => onTabChange(item.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                tab === item.id
                  ? "bg-[var(--content-surface)] text-[var(--content-ink)] shadow-[var(--content-shadow)]"
                  : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
              }`}
            >
              {item.label}
              <span className="tabular text-[10px] text-[var(--content-ink-dim)]">{item.count}</span>
            </button>
          ))}
        </div>

        {/* `min-h-0` es lo que deja encoger a este hijo del flex: sin él crece
            con la lista y el recorte se lo come el panel, no el desbordamiento. */}
        <div
          id="reportes-panel"
          role="tabpanel"
          aria-labelledby={`reportes-tab-${tab}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ul className="flex min-h-0 flex-1 flex-col xl:overflow-y-auto">
            {tab === "templates" &&
              shownTemplates.map((template) => (
                <RailRow
                  key={template.templateId}
                  active={activeTemplate === template.title}
                  title={template.title}
                  description={template.description}
                  meta={`${template.widgets.length} gráficas`}
                  onOpen={() => onOpenTemplate(template)}
                />
              ))}

            {tab === "saved" && loadingReports && (
              <li className="px-2 py-2 text-xs text-[var(--content-ink-dim)]">Cargando…</li>
            )}
            {tab === "saved" && !loadingReports && shownReports.length === 0 && (
              <li className="px-2 py-2 text-xs leading-snug text-[var(--content-ink-dim)]">
                {split ? `Aún no has guardado ninguno de ${sourceLabel}.` : "Aún no has guardado ninguno."}{" "}
                <button onClick={() => onTabChange("templates")} className="text-accent-ink hover:underline">
                  Abre una plantilla
                </button>
                , cámbiala a tu gusto y guárdala.
              </li>
            )}
            {tab === "saved" &&
              shownReports.map((report) => (
                <RailRow
                  key={report.id}
                  active={activeReportId === report.id}
                  title={report.title}
                  {...(report.description ? { description: report.description } : {})}
                  meta={`${report.widgets.length} gráfica${report.widgets.length === 1 ? "" : "s"} · ${
                    STATS_PERIOD_LABEL[report.period]
                  }${report.scopeNarrowed ? " · alcance recortado" : ""}`}
                  onOpen={() => onOpenReport(report)}
                  actions={
                    <>
                      <button
                        onClick={() => onDuplicate(report.id)}
                        className="text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                      >
                        Duplicar
                      </button>
                      <button onClick={() => onDelete(report.id)} className="text-red hover:underline">
                        Eliminar
                      </button>
                    </>
                  }
                />
              ))}
          </ul>
        </div>
      </Plate>
    </aside>
  );
}

function RailRow({
  title,
  description,
  meta,
  active,
  onOpen,
  actions,
}: {
  title: string;
  /** Para qué sirve el reporte. Trece títulos solos no se distinguen entre sí. */
  description?: string;
  meta: string;
  active: boolean;
  onOpen: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <li
      className={`group rounded-lg px-2 py-1.5 ${
        // Sobre un tinte del primario, el gris secundario se quedaba en 4,47:1 en
        // oscuro; el lienzo con un filo del primario marca igual la selección.
        active
          ? "bg-[var(--content-bg)] ring-1 ring-inset ring-accent/40"
          : "hover:bg-[var(--content-bg)]"
      }`}
    >
      <button onClick={onOpen} className="block w-full text-left">
        <span
          className={`block truncate text-sm ${
            active ? "font-medium text-accent-ink" : "text-[var(--content-ink)]"
          }`}
        >
          {title}
        </span>
        {/* Dos líneas y cortada: en 288 px la frase entera empuja la lista fuera de la vista. */}
        {description && (
          <span className="mt-0.5 block line-clamp-2 text-[11px] leading-snug text-[var(--content-ink-dim)]">
            {description}
          </span>
        )}
        <span className="mt-0.5 block truncate text-[10px] text-[var(--content-ink-dim)]">
          {meta}
        </span>
      </button>
      {/* Duplicar y eliminar solo asoman al pasar por encima: son acciones de
          mantenimiento, y en una lista de doce estorban todo el rato. */}
      {actions && (
        <div className="mt-0.5 hidden gap-2 text-[11px] group-focus-within:flex group-hover:flex">
          {actions}
        </div>
      )}
    </li>
  );
}

// Conversiones

/** Es de mantenimiento si todas sus gráficas lo son; vacío o mezclado cuenta como de tickets. */
function reportSourceOf(widgets: ReportWidget[]): ReportSource {
  return widgets.length > 0 && widgets.every((widget) => widget.source === "maintenance")
    ? "maintenance"
    : "tickets";
}

/** Una plantilla se abre como un reporte editable, sin dueño todavía (spec §7.8.7). */
function fromTemplate(template: ReportTemplate): Draft {
  return {
    title: template.title,
    description: template.description,
    scope: template.scope,
    areaId: template.areaId || undefined,
    userId: template.userId || undefined,
    period: template.period,
    perspective: template.perspective || undefined,
    widgets: template.widgets,
    dirty: false,
  };
}

function fromSaved(report: SavedReport): Draft {
  return {
    id: report.id,
    title: report.title,
    description: report.description || undefined,
    // Se abre con el alcance que el rol permite hoy, no con el guardado.
    scope: report.effectiveScope,
    areaId: report.areaId || undefined,
    userId: report.userId || undefined,
    period: report.period,
    from: report.from || undefined,
    to: report.to || undefined,
    perspective: oneOf(PERSPECTIVES, report.perspective),
    widgets: report.widgets,
    dirty: false,
    narrowed: report.scopeNarrowed,
  };
}

/** De qué dimensión a qué filtro de la lista. Lo que no está aquí no es pulsable. */
type TicketDrill = (key: string) => NonNullable<ReportDefinition["ticketFilters"]>;

const DRILL_FILTERS = new Map<string, TicketDrill>([
  ["category", (key) => ({ categoryIds: [key] })],
  ["priority", (key) => ({ priorities: allOf(PRIORITIES, [key]) })],
  ["status", (key) => ({ statuses: allOf(TICKET_STATUSES, [key]) })],
  ["sla_state", (key) => ({ slaStates: allOf(SLA_STATES, [key]) })],
  ["area", (key) => ({ areaIds: [key] })],
  ["assignee", (key) => (key ? { assigneeIds: [key] } : { unassigned: true })],
  ["requester", (key) => ({ requesterId: key })],
  ["csat", (key) => ({ csatRatings: allOf(CSAT_RATINGS, [key || "none"]) })],
  ["created_on_behalf", (key) => ({ onBehalf: key === "on_behalf" })],
]);

/** Lo mismo para órdenes: solo el tipo de orden tiene filtro; equipo o técnico no hacen nada. */
type WorkOrderDrill = (key: string) => WorkOrderListFilters;

const WORK_ORDER_DRILL_FILTERS = new Map<string, WorkOrderDrill>([
  ["work_order_type", (key) => (key === "corrective" || key === "preventive" ? { type: key } : {})],
]);

let widgetCounter = 0;

/**
 * Gráfica nueva, ya en el módulo del reporte: en uno de mantenimiento empieza
 * con las órdenes por tipo, no con tickets por categoría que habría que deshacer.
 */
function blankWidget(position: number, source: ReportSource = "tickets"): ReportWidget {
  widgetCounter += 1;

  const start: Pick<ReportWidget, "source" | "measures" | "groupBy"> =
    source === "maintenance"
      ? { source, measures: [{ key: "wo_created" }], groupBy: "work_order_type" }
      : { source, measures: [{ key: "created" }], groupBy: "category" };

  return {
    id: `w${position}-${widgetCounter}`,
    title: "Nueva gráfica",
    chart: "bar",
    ...start,
    filters: {},
    sort: "value_desc",
    showValues: true,
    showLegend: true,
    showTarget: false,
    layout: { w: 1 },
  };
}
