import { AGGREGATION_LABEL, type ReportWidget } from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { downloadWidgetCsv, reportKeys, runReportWidget, type ReportScopeRequest } from "../../api/reports";
import { Plate } from "../../components/Plate";
import { DownloadIcon, MoreIcon } from "../../components/icons";
import { downloadChartPng } from "../../lib/chartExport";
import { ReportChart } from "./ReportChart";

/** Las gráficas que no son SVG no se pueden descargar como imagen; su menú lo omite. */
const RASTERIZABLE = new Set([
  "bar",
  "hbar",
  "stacked",
  "line",
  "area",
  "donut",
  "semidonut",
  "radar",
]);

const SPAN: Record<number, string> = {
  1: "lg:col-span-2",
  2: "lg:col-span-3",
  3: "lg:col-span-6",
};

/**
 * Una tarjeta, una consulta, un esqueleto de carga y un error propios: si una gráfica
 * falla, las demás siguen en pie (spec §7.8.8, rendimiento). La tarjeta KPI se pinta
 * sin marco porque ya lo trae `StatTile`.
 */
export function WidgetCard({
  widget,
  scope,
  editable,
  onEdit,
  onRemove,
  onDrill,
}: {
  widget: ReportWidget;
  scope: ReportScopeRequest;
  editable: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
  /** Pulsar una barra o una porción filtra la lista de abajo (spec §7.8.2). */
  onDrill?: (dimension: NonNullable<ReportWidget["groupBy"]>, key: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const query = useQuery({
    queryKey: reportKeys.widget(scope, widget),
    queryFn: () => runReportWidget(scope, widget),
  });

  const span = widget.chart === "kpi" ? "lg:col-span-2 xl:col-span-2" : SPAN[widget.layout.w] ?? SPAN[1]!;
  const aggregation = widget.measures[0]?.aggregation;
  const subtitle = [
    widget.measures.map((item) => item.key).length > 1 ? `${widget.measures.length} medidas` : null,
    aggregation ? AGGREGATION_LABEL[aggregation] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (widget.chart === "kpi") {
    return (
      <div className={`print-block ${span} relative`}>
        {query.isPending && <Skeleton compact />}
        {query.isError && <Failed compact />}
        {query.data && <ReportChart widget={widget} result={query.data} />}
        {editable && (
          <Menu
            open={menuOpen}
            setOpen={setMenuOpen}
            widget={widget}
            scope={scope}
            chartRef={chartRef}
            onEdit={onEdit}
            onRemove={onRemove}
            floating
          />
        )}
      </div>
    );
  }

  return (
    <Plate className={`print-block flex flex-col p-4 ${span}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-semibold text-[var(--content-ink)]">
            {widget.title}
          </h3>
          {subtitle && <p className="text-xs text-[var(--content-ink-dim)]">{subtitle}</p>}
        </div>
        <Menu
          open={menuOpen}
          setOpen={setMenuOpen}
          widget={widget}
          scope={scope}
          chartRef={chartRef}
          {...(editable && onEdit ? { onEdit } : {})}
          {...(editable && onRemove ? { onRemove } : {})}
        />
      </div>

      <div ref={chartRef} className="flex-1">
        {query.isPending && <Skeleton />}
        {query.isError && <Failed />}
        {query.data && (
          <ReportChart
            widget={widget}
            result={query.data}
            {...(onDrill && widget.groupBy
              ? { onSelect: (key: string) => onDrill(widget.groupBy!, key) }
              : {})}
          />
        )}
      </div>
    </Plate>
  );
}

function Menu({
  open,
  setOpen,
  widget,
  scope,
  chartRef,
  onEdit,
  onRemove,
  floating = false,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  widget: ReportWidget;
  scope: ReportScopeRequest;
  chartRef: React.RefObject<HTMLDivElement | null>;
  onEdit?: () => void;
  onRemove?: () => void;
  floating?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={`no-print relative ${floating ? "absolute right-2 top-2" : ""}`}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md p-1 text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)] hover:text-[var(--content-ink)]"
        aria-label={`Opciones de ${widget.title}`}
      >
        <MoreIcon className="h-4 w-4" />
      </button>
      {open && (
        <>
          <button
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          />
          <div className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-1 text-left shadow-[var(--content-shadow)]">
            {onEdit && (
              <Item
                label="Editar gráfica"
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              />
            )}
            <Item
              label="Descargar CSV"
              icon
              onClick={async () => {
                setOpen(false);
                await downloadWidgetCsv(scope, widget);
              }}
            />
            {RASTERIZABLE.has(widget.chart) && (
              <Item
                label="Descargar PNG"
                icon
                onClick={async () => {
                  setOpen(false);
                  try {
                    if (chartRef.current) await downloadChartPng(chartRef.current, widget.title);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : "No se pudo descargar");
                  }
                }}
              />
            )}
            {onRemove && (
              <Item
                label="Quitar del reporte"
                danger
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              />
            )}
          </div>
        </>
      )}
      {error && <p className="absolute right-0 top-8 z-30 w-48 text-xs text-red">{error}</p>}
    </div>
  );
}

function Item({
  label,
  onClick,
  icon = false,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  icon?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-[var(--content-bg)] ${
        danger ? "text-red" : "text-[var(--content-ink)]"
      }`}
    >
      {icon && <DownloadIcon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function Skeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-[var(--content-bg)] ${compact ? "h-[108px]" : "h-[220px]"}`}
      aria-label="Cargando gráfica"
    />
  );
}

function Failed({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border border-dashed border-[var(--content-border)] px-3 text-center text-xs text-[var(--content-ink-dim)] ${
        compact ? "h-[108px]" : "h-[220px]"
      }`}
    >
      Esta gráfica no se pudo calcular. Las demás siguen disponibles.
    </div>
  );
}
