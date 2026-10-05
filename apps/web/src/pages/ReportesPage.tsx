import {
  PERSPECTIVE_LABEL,
  PERSPECTIVES,
  STATS_PERIOD_LABEL,
  STATS_PERIODS,
  type Perspective,
  type ReportCatalog,
  type ReportDefinition,
  type ReportTemplate,
  type ReportWidget,
  type SavedReport,
  type StatsScope,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { ChartIcon, ChevronDownIcon, DownloadIcon, PlusIcon } from "../components/icons";
import { TicketsOfPeriod } from "./reportes/TicketsOfPeriod";
import { WidgetCard } from "./reportes/WidgetCard";
import { WidgetEditor } from "./reportes/WidgetEditor";

type TabId = "mis-reportes" | "plantillas" | "nuevo";

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

export default function ReportesPage() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabId>("plantillas");
  const [edited, setEdited] = useState<Draft | null>(null);
  const [editing, setEditing] = useState<ReportWidget | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketFilters, setTicketFilters] = useState<NonNullable<ReportDefinition["ticketFilters"]>>({});

  const catalog = useQuery({ queryKey: reportKeys.catalog(), queryFn: getReportCatalog });
  const saved = useQuery({ queryKey: reportKeys.saved(), queryFn: listSavedReports });

  /**
   * Mientras nadie elige nada se muestra la primera plantilla del rol, derivada del
   * catálogo en el propio render: la pestaña Plantillas con datos reales es lo que el
   * tablero promete al enlazar "Ver gráficas en Reportes". En cuanto se abre o se edita
   * algo, `edited` manda.
   */
  const fallback = useMemo(
    () => (catalog.data?.templates.length ? fromTemplate(catalog.data.templates[0]!) : null),
    [catalog.data],
  );
  const draft = edited ?? fallback;
  const setDraft = setEdited;

  const scope: ReportScopeRequest = useMemo(
    () =>
      draft
        ? {
            scope: draft.scope,
            ...(draft.areaId ? { areaId: draft.areaId } : {}),
            ...(draft.userId ? { userId: draft.userId } : {}),
            period: draft.period,
            ...(draft.from ? { from: draft.from } : {}),
            ...(draft.to ? { to: draft.to } : {}),
          }
        : { scope: "me", period: "month" },
    [draft],
  );

  /**
   * La lista de tickets no siempre comparte el alcance de las gráficas. Un empleado no
   * puede elegir "mi área" —sus gráficas son solo suyas— pero su **lista** sí es la de
   * su área, porque puede leer esas conversaciones por la regla del §7.5. Es la única
   * excepción del spec §7.8.9, y solo se aplica a quien no tiene otra opción: si un
   * supervisor elige "Yo", su lista también se acota a sus tickets.
   */
  const listScope: ReportScopeRequest = useMemo(
    () =>
      catalog.data?.maxScope === "me"
        ? { period: scope.period, ...(scope.from ? { from: scope.from } : {}), ...(scope.to ? { to: scope.to } : {}), scope: "area" }
        : scope,
    [catalog.data, scope],
  );

  const createMutation = useMutation({
    mutationFn: createSavedReport,
    onSuccess: (report) => {
      void queryClient.invalidateQueries({ queryKey: reportKeys.saved() });
      setDraft(fromSaved(report));
      setTab("mis-reportes");
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
      ...(draft.description ? { description: draft.description } : {}),
      scope: draft.scope,
      ...(draft.areaId ? { areaId: draft.areaId } : {}),
      ...(draft.userId ? { userId: draft.userId } : {}),
      period: draft.period,
      ...(draft.from ? { from: draft.from } : {}),
      ...(draft.to ? { to: draft.to } : {}),
      ...(draft.perspective ? { perspective: draft.perspective } : {}),
      widgets: draft.widgets,
      ticketFilters,
    };
    if (draft.id) updateMutation.mutate({ id: draft.id, input: definition });
    else createMutation.mutate(definition);
  };

  /**
   * Pulsar una barra, una porción o un segmento filtra la lista de abajo por ese valor
   * (spec §7.8.2): clic en "Redes" → los tickets de esa categoría. Las dimensiones que
   * no tienen filtro equivalente en la lista —el tiempo, el resultado de la IA— no
   * hacen nada en vez de llevar a una lista que no corresponde con lo que se pulsó.
   */
  const drillInto = (dimension: string, key: string) => {
    const filter = DRILL_FILTERS[dimension]?.(key);
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
            <ScopeSelector catalog={catalog.data} draft={draft} onChange={update} />
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

      <nav className="no-print mb-5 flex gap-1 border-b border-[var(--content-border)]">
        {(
          [
            { id: "mis-reportes", label: "Mis reportes" },
            { id: "plantillas", label: "Plantillas" },
            { id: "nuevo", label: "Nuevo reporte" },
          ] as { id: TabId; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => {
              setTab(item.id);
              if (item.id === "nuevo") {
                setDraft({ ...EMPTY, scope: catalog.data!.maxScope, dirty: false });
              }
            }}
            className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === item.id ? "text-accent" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            }`}
          >
            {item.label}
            {tab === item.id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </nav>

      {tab === "mis-reportes" && (
        <SavedList
          reports={saved.data ?? []}
          loading={saved.isPending}
          onOpen={(report) => setDraft(fromSaved(report))}
          onDuplicate={async (id) => {
            await duplicateSavedReport(id);
            void queryClient.invalidateQueries({ queryKey: reportKeys.saved() });
          }}
          onDelete={async (id) => {
            await deleteSavedReport(id);
            void queryClient.invalidateQueries({ queryKey: reportKeys.saved() });
            if (draft?.id === id) setDraft(null);
          }}
          onStartFromTemplate={() => setTab("plantillas")}
        />
      )}

      {tab === "plantillas" && (
        <TemplateList
          templates={catalog.data.templates}
          active={draft?.id ? undefined : draft?.title}
          onOpen={(template) => setDraft(fromTemplate(template))}
        />
      )}

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
                onClick={() => setEditing(blankWidget(draft.widgets.length))}
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
                  onClick={() => setEditing(blankWidget(0))}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Añade la primera
                </button>
                <button
                  onClick={() => setTab("plantillas")}
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
                  widget={{ ...widget, ...(draft.perspective ? { perspective: draft.perspective } : {}) }}
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

          <a
            href="#tickets-del-periodo"
            className="no-print mt-4 inline-block text-xs font-medium text-accent hover:underline"
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

// ── Selectores del encabezado ─────────────────────────────────

/**
 * El selector de alcance se arma con lo que el servidor concedería, no con una lista
 * fija: un empleado no ve "Todas las áreas" porque pulsarlo solo le daría un 403
 * (spec §7.8.1). El servidor lo recalcula igualmente en cada consulta.
 */
function ScopeSelector({
  catalog,
  draft,
  onChange,
}: {
  catalog: ReportCatalog;
  draft: Draft | null;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const areas = useQuery({
    queryKey: areaKeys.all,
    queryFn: listAreas,
    enabled: catalog.maxScope === "global",
  });
  const members = useQuery({
    queryKey: areaKeys.members(draft?.areaId ?? ""),
    queryFn: () => listAreaMembers(draft!.areaId!),
    enabled: draft?.scope === "user" && Boolean(draft?.areaId),
  });

  if (catalog.scopes.length <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
        {catalog.scopes.map((item) => (
          <button
            key={item.id}
            onClick={() =>
              onChange({
                scope: item.id as StatsScope,
                // Elegir "un área" o "una persona" arranca en la propia: es el caso
                // normal y evita un selector vacío esperando una decisión.
                ...(item.id === "user" && !draft?.areaId ? { areaId: undefined } : {}),
              })
            }
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

/**
 * El PDF sale del navegador: el reporte tal como se ve, con su encabezado, alcance y
 * período (spec §7.8.8). El CSV de cada gráfica va en su menú `⋯`, y el de la lista de
 * tickets en la propia lista, porque cada uno exporta cosas distintas.
 */
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

// ── Pestañas de reportes ──────────────────────────────────────

function SavedList({
  reports,
  loading,
  onOpen,
  onDuplicate,
  onDelete,
  onStartFromTemplate,
}: {
  reports: SavedReport[];
  loading: boolean;
  onOpen: (report: SavedReport) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onStartFromTemplate: () => void;
}) {
  if (loading) return <Plate className="h-28 animate-pulse" />;

  if (!reports.length) {
    return (
      <Plate className="flex flex-col items-center gap-3 py-14 text-center">
        <p className="text-sm text-[var(--content-ink-dim)]">Aún no has guardado ningún reporte.</p>
        <button
          onClick={onStartFromTemplate}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
        >
          Empezar desde una plantilla
        </button>
      </Plate>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {reports.map((report) => (
        <Plate key={report.id} className="flex flex-col gap-2 p-4">
          <button onClick={() => onOpen(report)} className="text-left">
            <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
              {report.title}
            </h3>
            {report.description && (
              <p className="mt-0.5 text-xs text-[var(--content-ink-dim)]">{report.description}</p>
            )}
          </button>
          <p className="text-xs text-[var(--content-ink-dim)]">
            {report.widgets.length} gráfica{report.widgets.length === 1 ? "" : "s"} ·{" "}
            {STATS_PERIOD_LABEL[report.period]}
            {report.scopeNarrowed && " · alcance recortado"}
          </p>
          <div className="mt-auto flex gap-1.5 pt-1 text-xs">
            <button onClick={() => onOpen(report)} className="font-medium text-accent hover:underline">
              Abrir
            </button>
            <span className="text-[var(--content-ink-dim)]">·</span>
            <button
              onClick={() => onDuplicate(report.id)}
              className="text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            >
              Duplicar
            </button>
            <span className="text-[var(--content-ink-dim)]">·</span>
            <button onClick={() => onDelete(report.id)} className="text-red hover:underline">
              Eliminar
            </button>
          </div>
        </Plate>
      ))}
    </div>
  );
}

function TemplateList({
  templates,
  active,
  onOpen,
}: {
  templates: ReportTemplate[];
  active?: string;
  onOpen: (template: ReportTemplate) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {templates.map((template) => (
        <button
          key={template.templateId}
          onClick={() => onOpen(template)}
          className={`flex flex-col gap-1.5 rounded-2xl border p-3.5 text-left transition-colors ${
            active === template.title
              ? "border-accent bg-accent/5"
              : "border-[var(--content-border)] bg-[var(--content-surface)] hover:bg-[var(--content-bg)]"
          }`}
        >
          <span className="flex items-center gap-1.5 font-display text-sm font-semibold text-[var(--content-ink)]">
            <ChartIcon className="h-3.5 w-3.5 text-accent" /> {template.title}
          </span>
          <span className="text-xs leading-snug text-[var(--content-ink-dim)]">
            {template.description}
          </span>
          <span className="mt-auto pt-1 text-[11px] text-[var(--content-ink-dim)]">
            {template.widgets.length} gráficas
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Conversiones ──────────────────────────────────────────────

/** Una plantilla se abre como un reporte editable, sin dueño todavía (spec §7.8.7). */
function fromTemplate(template: ReportTemplate): Draft {
  return {
    title: template.title,
    description: template.description,
    scope: template.scope,
    ...(template.areaId ? { areaId: template.areaId } : {}),
    ...(template.userId ? { userId: template.userId } : {}),
    period: template.period,
    ...(template.perspective ? { perspective: template.perspective } : {}),
    widgets: template.widgets,
    dirty: false,
  };
}

function fromSaved(report: SavedReport): Draft {
  return {
    id: report.id,
    title: report.title,
    ...(report.description ? { description: report.description } : {}),
    // Se abre con el alcance que el rol permite hoy, no con el guardado.
    scope: report.effectiveScope,
    ...(report.areaId ? { areaId: report.areaId } : {}),
    ...(report.userId ? { userId: report.userId } : {}),
    period: report.period,
    ...(report.from ? { from: report.from } : {}),
    ...(report.to ? { to: report.to } : {}),
    ...(report.perspective ? { perspective: report.perspective as Perspective } : {}),
    widgets: report.widgets,
    dirty: false,
    narrowed: report.scopeNarrowed,
  };
}

/** De qué dimensión a qué filtro de la lista. Lo que no está aquí no es pulsable. */
const DRILL_FILTERS: Record<
  string,
  ((key: string) => NonNullable<ReportDefinition["ticketFilters"]>) | undefined
> = {
  category: (key) => ({ categoryIds: [key] }),
  priority: (key) => ({ priorities: [key as "urgent" | "high" | "medium" | "low"] }),
  status: (key) => ({ statuses: [key] as NonNullable<ReportDefinition["ticketFilters"]>["statuses"] }),
  sla_state: (key) => ({ slaStates: [key as "on_time" | "at_risk" | "breached"] }),
  area: (key) => ({ areaIds: [key] }),
  assignee: (key) => (key ? { assigneeIds: [key] } : { unassigned: true }),
  requester: (key) => ({ requesterId: key }),
  csat: (key) => ({ csatRatings: [(key || "none") as "1" | "2" | "3" | "4" | "5" | "none"] }),
  created_on_behalf: (key) => ({ onBehalf: key === "on_behalf" }),
};

let widgetCounter = 0;

function blankWidget(position: number): ReportWidget {
  widgetCounter += 1;
  return {
    id: `w${position}-${widgetCounter}`,
    title: "Nueva gráfica",
    chart: "bar",
    measures: [{ key: "created" }],
    groupBy: "category",
    filters: {},
    sort: "value_desc",
    showValues: true,
    showLegend: true,
    showTarget: false,
    layout: { w: 1 },
  };
}
