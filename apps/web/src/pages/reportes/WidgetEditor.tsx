import {
  AGGREGATION_LABEL,
  ASSET_TYPES,
  ASSET_TYPE_LABEL,
  CHART_META,
  CHART_TYPES,
  MEASURE_FAMILY_LABEL,
  MEASURE_FAMILIES,
  PRIORITIES,
  PRIORITY_LABEL,
  REPORT_SOURCES,
  REPORT_SOURCE_LABEL,
  SLA_STATES,
  SLA_STATE_LABEL,
  TICKET_STATUSES,
  TICKET_STATUS_LABEL,
  validateWidget,
  WIDGET_SORTS,
  WIDGET_SORT_LABEL,
  WORK_ORDER_TYPES,
  WORK_ORDER_TYPE_LABEL,
  type Aggregation,
  type AssetType,
  type ChartType,
  type DimensionKey,
  type MeasureKey,
  type ReportCatalog,
  type ReportSource,
  type ReportWidget,
  type WorkOrderType,
} from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { reportKeys, runReportWidget, type ReportScopeRequest } from "../../api/reports";
import { areaKeys, listAreas } from "../../api/tickets";
import { XIcon } from "../../components/icons";
import { ReportChart } from "./ReportChart";

/**
 * El panel del §7.8.3, con vista previa en vivo. La regla que lo gobierna es la del
 * spec: *"si una combinación no tiene sentido, el panel lo indica y deshabilita la
 * opción en lugar de mostrar un error"*. Quien decide qué tiene sentido es
 * `validateWidget`, el mismo que el servidor usa para rechazar: una sola definición de
 * lo posible, en `packages/shared`.
 */
export function WidgetEditor({
  widget,
  catalog,
  scope,
  onSave,
  onClose,
}: {
  widget: ReportWidget;
  catalog: ReportCatalog;
  scope: ReportScopeRequest;
  onSave: (widget: ReportWidget) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ReportWidget>(widget);
  const problem = validateWidget(draft);

  const areas = useQuery({ queryKey: areaKeys.all, queryFn: listAreas });
  const categories = useMemo(() => {
    const list = areas.data ?? [];
    const inScope = draft.filters.areaId
      ? list.filter((area) => area.id === draft.filters.areaId)
      : list;
    return inScope.flatMap((area) => area.categories.map((item) => ({ ...item, area: area.name })));
  }, [areas.data, draft.filters.areaId]);

  // La vista previa solo se pide cuando la gráfica es válida: una combinación
  // imposible no debe gastar una consulta para recibir un 422.
  const preview = useQuery({
    queryKey: reportKeys.widget(scope, draft),
    queryFn: () => runReportWidget(scope, draft),
    enabled: problem === null,
  });

  const set = (patch: Partial<ReportWidget>) => setDraft((current) => ({ ...current, ...patch }));
  const chartMeta = CHART_META[draft.chart];
  const source = draft.source ?? "tickets";
  // Mantenimiento solo aparece si el catálogo lo ofrece: quien no mantiene equipos ni lo ve.
  const sources = REPORT_SOURCES.filter((option) => catalog.measures.some((measure) => measure.source === option));
  const measures = catalog.measures.filter((measure) => measure.source === source);
  const dimensions = catalog.dimensions.filter((item) => item.sources.includes(source));

  /**
   * Cambiar de fuente es empezar la gráfica de nuevo: ninguna medida ni dimensión de
   * una sirve en la otra. Se queda el título, el área y los ajustes de presentación.
   */
  function switchSource(next: ReportSource) {
    if (next === source) return;
    const first = catalog.measures.find((measure) => measure.source === next);
    if (!first) return;
    setDraft((current) => {
      const { groupBy: _group, splitBy: _split, ...rest } = current;
      return {
        ...rest,
        source: next,
        chart: "kpi",
        measures: [{ key: first.key }],
        filters: current.filters.areaId ? { areaId: current.filters.areaId } : {},
        showTarget: false,
      };
    });
  }
  const allowsSplit = chartMeta.dimensions[1] >= 2;
  const allowsGroup = chartMeta.dimensions[1] >= 1;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
      <button className="flex-1 cursor-default" onClick={onClose} aria-label="Cerrar panel" />
      <div className="flex w-full max-w-md flex-col overflow-y-auto bg-[var(--content-surface)] shadow-2xl sm:max-w-lg">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--content-border)] bg-[var(--content-surface)] px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">
            Configurar gráfica
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            aria-label="Cerrar"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 px-5 py-4">
          {/* 0 · Fuente (plan A6) */}
          {sources.length > 1 && (
            <Row label="Fuente de datos">
              <div className="flex gap-1.5" role="radiogroup" aria-label="Fuente de datos">
                {sources.map((option) => (
                  <button
                    key={option}
                    role="radio"
                    aria-checked={source === option}
                    onClick={() => switchSource(option)}
                    className={`rounded-lg border px-2.5 py-1 text-xs ${
                      source === option
                        ? "border-accent bg-accent text-white"
                        : "border-[var(--content-border)] text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                    }`}
                  >
                    {REPORT_SOURCE_LABEL[option]}
                  </button>
                ))}
              </div>
            </Row>
          )}

          {/* 1 · Título */}
          <Row label="Título">
            <input
              value={draft.title}
              onChange={(event) => set({ title: event.target.value })}
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2.5 py-1.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
            />
          </Row>

          {/* 2 · Medidas */}
          <Row label="¿Qué quieres medir?" hint={`Hasta ${chartMeta.measures[1]}`}>
            <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-[var(--content-border)] p-2.5">
              {MEASURE_FAMILIES.map((family) => {
                const options = measures.filter((measure) => measure.family === family);
                if (!options.length) return null;
                return (
                  <div key={family}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--content-ink-dim)]">
                      {MEASURE_FAMILY_LABEL[family]}
                    </p>
                    <div className="space-y-1">
                      {options.map((measure) => {
                        const chosen = draft.measures.find((item) => item.key === measure.key);
                        return (
                          <div key={measure.key} className="flex items-center gap-2">
                            <label className="flex flex-1 items-center gap-2 text-xs text-[var(--content-ink)]">
                              <input
                                type="checkbox"
                                checked={Boolean(chosen)}
                                onChange={() => set({ measures: toggleMeasure(draft, measure.key) })}
                              />
                              <span className="truncate" title={measure.hint}>
                                {measure.label}
                              </span>
                            </label>
                            {chosen && measure.aggregations && (
                              <select
                                aria-label={`Cálculo de ${measure.label}`}
                                value={chosen.aggregation ?? "avg"}
                                onChange={(event) =>
                                  set({
                                    measures: draft.measures.map((item) =>
                                      item.key === measure.key
                                        ? { ...item, aggregation: event.target.value as Aggregation }
                                        : item,
                                    ),
                                  })
                                }
                                className="rounded border border-[var(--content-border)] bg-[var(--content-bg)] px-1 py-0.5 text-[11px] text-[var(--content-ink)]"
                              >
                                {measure.aggregations.map((option) => (
                                  <option key={option} value={option}>
                                    {AGGREGATION_LABEL[option]}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Row>

          {/* 3 y 4 · Agrupar y segmentar */}
          {allowsGroup && (
            <Row label="¿Cómo lo agrupas?">
              <Select
                label="Agrupar por"
                value={draft.groupBy ?? ""}
                onChange={(value) =>
                  set({ groupBy: (value || undefined) as DimensionKey | undefined })
                }
                options={[
                  { value: "", label: "Sin agrupar" },
                  ...dimensions.map((item) => ({ value: item.key, label: item.label })),
                ]}
              />
            </Row>
          )}
          {allowsSplit && (
            <Row label="¿Lo segmentas?" hint="Máximo 6 segmentos">
              <Select
                label="Segmentar por"
                value={draft.splitBy ?? ""}
                onChange={(value) => set({ splitBy: (value || undefined) as DimensionKey | undefined })}
                options={[
                  { value: "", label: "Sin segmentar" },
                  ...dimensions
                    .filter((item) => item.key !== draft.groupBy)
                    .map((item) => ({ value: item.key, label: item.label })),
                ]}
              />
            </Row>
          )}

          {/* 5 · Tipo de gráfica: solo los compatibles */}
          <Row label="Tipo de gráfica">
            <div className="flex flex-wrap gap-1.5">
              {CHART_TYPES.map((type) => {
                const candidate = { ...draft, chart: type };
                const incompatible = validateWidget(candidate) !== null && type !== draft.chart;
                return (
                  <button
                    key={type}
                    disabled={incompatible}
                    onClick={() => set({ chart: type as ChartType })}
                    title={incompatible ? validateWidget(candidate)! : undefined}
                    className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                      draft.chart === type
                        ? "border-accent bg-accent text-white"
                        : incompatible
                          ? "cursor-not-allowed border-[var(--content-border)] text-[var(--content-ink-dim)] opacity-40"
                          : "border-[var(--content-border)] text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                    }`}
                  >
                    {CHART_META[type].label}
                  </button>
                );
              })}
            </div>
          </Row>

          {/* 6 · Filtros */}
          <Row label="Filtros">
            <div className="space-y-2">
              {catalog.maxScope === "global" && (
                <Select
                  label="Filtrar por área"
                  value={draft.filters.areaId ?? ""}
                  onChange={(value) =>
                    set({ filters: { ...draft.filters, areaId: value || undefined } })
                  }
                  options={[
                    { value: "", label: "Todas las áreas" },
                    ...(areas.data ?? []).map((area) => ({ value: area.id, label: area.name })),
                  ]}
                />
              )}
              {source === "maintenance" && (
                <>
                  <Chips
                    options={ASSET_TYPES.map((value) => ({ value, label: ASSET_TYPE_LABEL[value] }))}
                    selected={draft.filters.assetTypes ?? []}
                    onChange={(values) =>
                      set({
                        filters: { ...draft.filters, assetTypes: values.length ? (values as AssetType[]) : undefined },
                      })
                    }
                  />
                  <Select
                    label="Filtrar por tipo de orden"
                    value={draft.filters.workOrderType ?? ""}
                    onChange={(value) =>
                      set({
                        filters: { ...draft.filters, workOrderType: (value || undefined) as WorkOrderType | undefined },
                      })
                    }
                    options={[
                      { value: "", label: "Correctivas y preventivas" },
                      ...WORK_ORDER_TYPES.map((value) => ({ value, label: WORK_ORDER_TYPE_LABEL[value] })),
                    ]}
                  />
                </>
              )}
              {source === "tickets" && (
              <>
              <Chips
                options={PRIORITIES.map((value) => ({ value, label: PRIORITY_LABEL[value] }))}
                selected={draft.filters.priorities ?? []}
                onChange={(values) =>
                  set({
                    filters: {
                      ...draft.filters,
                      priorities: values.length ? (values as typeof PRIORITIES[number][]) : undefined,
                    },
                  })
                }
              />
              <Chips
                options={TICKET_STATUSES.map((value) => ({ value, label: TICKET_STATUS_LABEL[value] }))}
                selected={draft.filters.statuses ?? []}
                onChange={(values) =>
                  set({
                    filters: {
                      ...draft.filters,
                      statuses: values.length ? (values as typeof TICKET_STATUSES[number][]) : undefined,
                    },
                  })
                }
              />
              <Select
                label="Filtrar por estado de SLA"
                value={draft.filters.slaState ?? ""}
                onChange={(value) =>
                  set({
                    filters: {
                      ...draft.filters,
                      slaState: (value || undefined) as typeof SLA_STATES[number] | undefined,
                    },
                  })
                }
                options={[
                  { value: "", label: "Cualquier estado de SLA" },
                  ...SLA_STATES.map((value) => ({ value, label: SLA_STATE_LABEL[value] })),
                ]}
              />
              {categories.length > 0 && (
                <Select
                  label="Filtrar por categoría"
                  value={draft.filters.categoryIds?.[0] ?? ""}
                  onChange={(value) =>
                    set({
                      filters: { ...draft.filters, categoryIds: value ? [value] : undefined },
                    })
                  }
                  options={[
                    { value: "", label: "Todas las categorías" },
                    ...categories.map((item) => ({ value: item.id, label: item.name })),
                  ]}
                />
              )}
              </>
              )}
            </div>
          </Row>

          {/* 7 · Orden y límite */}
          {allowsGroup && (
            <Row label="Orden y límite">
              <div className="flex gap-2">
                <Select
                  label="Orden"
                  value={draft.sort}
                  onChange={(value) => set({ sort: value as ReportWidget["sort"] })}
                  options={WIDGET_SORTS.map((value) => ({ value, label: WIDGET_SORT_LABEL[value] }))}
                />
                <Select
                  label="Límite de grupos"
                  value={String(draft.limit ?? "")}
                  onChange={(value) => set({ limit: value ? Number(value) : undefined })}
                  options={[
                    { value: "", label: "Automático" },
                    { value: "5", label: "Top 5" },
                    { value: "10", label: "Top 10" },
                    { value: "20", label: "Top 20" },
                  ]}
                />
              </div>
            </Row>
          )}

          {/* 8 · Comparar */}
          <Row label="Comparar">
            <Select
              label="Comparar con"
              value={draft.compareWith?.kind ?? ""}
              onChange={(value) =>
                set({
                  compareWith: value === "previous_period" ? { kind: "previous_period" } : undefined,
                })
              }
              options={[
                { value: "", label: "Sin comparación" },
                { value: "previous_period", label: "Con el período anterior" },
              ]}
            />
          </Row>

          {/* 9 · Ajustes */}
          <Row label="Ajustes">
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-[var(--content-ink)]">
              <Toggle
                label="Mostrar valores"
                checked={draft.showValues}
                onChange={(value) => set({ showValues: value })}
              />
              <Toggle
                label="Leyenda"
                checked={draft.showLegend}
                onChange={(value) => set({ showLegend: value })}
              />
              <Toggle
                label={source === "maintenance" ? "Meta del 100 %" : "Meta de SLA"}
                checked={draft.showTarget}
                onChange={(value) => set({ showTarget: value })}
              />
            </div>
            <div className="mt-2 flex gap-1.5">
              {([1, 2, 3] as const).map((width) => (
                <button
                  key={width}
                  onClick={() => set({ layout: { w: width } })}
                  className={`rounded-lg border px-2.5 py-1 text-xs ${
                    draft.layout.w === width
                      ? "border-accent bg-accent text-white"
                      : "border-[var(--content-border)] text-[var(--content-ink)]"
                  }`}
                >
                  {width === 1 ? "Un tercio" : width === 2 ? "Media" : "Ancho completo"}
                </button>
              ))}
            </div>
          </Row>

          {/* Vista previa en vivo */}
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--content-ink-dim)]">Vista previa</p>
            <div className="rounded-xl border border-[var(--content-border)] bg-[var(--content-bg)] p-3">
              {problem ? (
                <p className="py-6 text-center text-xs text-amber">{problem}</p>
              ) : preview.isPending ? (
                <div className="h-[200px] animate-pulse rounded-lg bg-[var(--content-surface)]" />
              ) : preview.isError ? (
                <p className="py-6 text-center text-xs text-red">
                  No se pudo calcular con estas opciones.
                </p>
              ) : (
                preview.data && <ReportChart widget={draft} result={preview.data} height={200} />
              )}
            </div>
          </div>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--content-border)] bg-[var(--content-surface)] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)]"
          >
            Cancelar
          </button>
          <button
            disabled={problem !== null}
            onClick={() => onSave(draft)}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Guardar gráfica
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Añade o quita una medida respetando el techo del tipo de gráfica. */
function toggleMeasure(widget: ReportWidget, key: MeasureKey): ReportWidget["measures"] {
  const existing = widget.measures.find((item) => item.key === key);
  if (existing) {
    const rest = widget.measures.filter((item) => item.key !== key);
    // Una gráfica sin medidas no existe: la última no se puede quitar.
    return rest.length ? rest : widget.measures;
  }
  const max = CHART_META[widget.chart].measures[1];
  const next = [...widget.measures, { key }];
  return next.length > max ? [...widget.measures.slice(1), { key }] : next;
}

function Row({
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
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium text-[var(--content-ink)]">{label}</label>
        {hint && <span className="text-[11px] text-[var(--content-ink-dim)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  /** Nombre para el lector de pantalla; la fila que lo rodea no es un `<label>`. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2.5 py-1.5 text-xs text-[var(--content-ink)] outline-none focus:border-accent"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function Chips({
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
              onChange(
                on
                  ? selected.filter((item) => item !== option.value)
                  : [...selected, option.value],
              )
            }
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              on
                ? "border-accent bg-accent/10 text-accent-ink"
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
