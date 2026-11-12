import {
  formatAssetNumber,
  formatMoney,
  formatSparePartNumber,
  MAINTENANCE_PERIODS,
  STATS_PERIOD_LABEL,
  type MaintenanceDashboard,
  type MaintenancePeriod,
} from "@tekzaya/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getMaintenanceDashboard, maintenanceKeys } from "../api/maintenance";
import { AlertIcon, BoxIcon, ChartIcon, ClipboardIcon, WrenchIcon } from "../components/icons";
import { GaugeDial } from "../components/GaugeDial";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { Readout, Readouts } from "../components/Readouts";
import { Thumb } from "../components/Thumb";
import { formatDay, formatQuantity, warrantyCountdown } from "../lib/format";

/**
 * Panel de mantenimiento (plan A6). El análisis a fondo (MTBF, disponibilidad,
 * costo por equipo) vive en Reportes.
 */
export default function MantenimientoPage() {
  const [areaId, setAreaId] = useState<string | undefined>(undefined);
  const [period, setPeriod] = useState<MaintenancePeriod>("week");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: maintenanceKeys.dashboard(areaId, period),
    queryFn: () => getMaintenanceDashboard(areaId, period),
    // Al cambiar de período se queda el panel anterior mientras llega el nuevo.
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader
        title="Panel de mantenimiento"
        subtitle={data?.area ? `Equipos que mantiene ${data.area.name}.` : "Equipos de todas las áreas."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {data && data.areas.length > 1 && (
              <select
                aria-label="Área"
                value={areaId ?? ""}
                onChange={(event) => setAreaId(event.target.value || undefined)}
                className="rounded-lg border border-[var(--field-border)] bg-[var(--content-surface)] px-3 py-2 text-xs text-[var(--content-ink)]"
              >
                <option value="">Todas las áreas</option>
                {data.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            )}
            <div
              role="group"
              aria-label="Período"
              className="flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5"
            >
              {MAINTENANCE_PERIODS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={period === item}
                  onClick={() => setPeriod(item)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    period === item ? "bg-accent text-white" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                  }`}
                >
                  {STATS_PERIOD_LABEL[item]}
                </button>
              ))}
            </div>
            <Link
              to="/reportes?modulo=mantenimiento"
              className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
            >
              <ChartIcon className="h-3.5 w-3.5" aria-hidden="true" /> Reportes de mantenimiento
            </Link>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5" aria-label="Cargando panel">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-[var(--content-surface)]" />
          ))}
        </div>
      ) : isError || !data ? (
        <Plate className="py-12 text-center text-sm text-[var(--content-ink-dim)]">
          {error instanceof Error ? error.message : "No se pudo cargar el panel."}
        </Plate>
      ) : (
        <Dashboard data={data} />
      )}
    </div>
  );
}

/** "de hoy", "de la semana", "del mes": para los títulos del dial y del costo. */
const OF_PERIOD: Record<MaintenancePeriod, string> = { day: "de hoy", week: "de la semana", month: "del mes" };

/** Para el pie del dial cuando el período no tiene preventivos. */
const IN_PERIOD: Record<MaintenancePeriod, string> = { day: "hoy", week: "esta semana", month: "este mes" };

function Dashboard({ data }: { data: MaintenanceDashboard }) {
  const { kpis, alerts, rules, period } = data;
  const preventives = kpis.preventives;
  const pending = preventives.total - preventives.done;

  return (
    <>
      {/* La lectura del período —¿se están haciendo los preventivos?— va en el dial; los
          contadores la acompañan al lado, en una sola placa de la misma altura. */}
      <div className="mb-5 grid gap-3 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
        <Linked to="/preventivos">
          <GaugeDial
            id="maintenance-preventives"
            label={`Preventivos ${OF_PERIOD[period]}`}
            {...(preventives.total ? { badge: "Hechos" } : {})}
            featured
            className="h-full"
            value={preventives.total ? (preventives.done / preventives.total) * 100 : 0}
            displayValue={preventives.total ? `${preventives.done}/${preventives.total}` : "—"}
            tone={preventives.total === 0 ? "neutral" : pending === 0 ? "green" : "steel"}
            caption={
              preventives.total
                ? pending === 0
                  ? "Todos hechos"
                  : `${pending} por hacer`
                : kpis.preventivesOverdue
                  ? `Nada ${IN_PERIOD[period]}; hay vencidos`
                  : `Nada ${IN_PERIOD[period]}; todo al día`
            }
          />
        </Linked>
        <Readouts>
          <Readout
            to="/ordenes"
            label="Órdenes abiertas"
            value={String(kpis.openWorkOrders)}
            icon={<ClipboardIcon className="h-4 w-4" />}
            caption="Sin completar ni cancelar"
          />
          <Readout
            to="/preventivos"
            label="Preventivos vencidos"
            value={String(kpis.preventivesOverdue)}
            icon={<AlertIcon className={`h-4 w-4 ${kpis.preventivesOverdue ? "text-red" : ""}`} />}
            caption={kpis.preventivesOverdue ? "Pasaron su fecha sin hacerse" : "Todo al día"}
          />
          <Readout
            to="/repuestos"
            label="Repuestos bajo mínimo"
            value={String(kpis.lowStockParts)}
            icon={<BoxIcon className={`h-4 w-4 ${kpis.lowStockParts ? "text-amber" : ""}`} />}
            caption={kpis.lowStockParts ? "Conviene reponer" : "Almacén en orden"}
          />
          <Readout
            label={`Costo ${OF_PERIOD[period]}`}
            value={formatMoney(kpis.cost, data.currency)}
            icon={<WrenchIcon className="h-4 w-4" />}
            caption="Repuestos y servicios externos"
          />
        </Readouts>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <AlertList
          title="Garantías por vencer"
          hint={`En los próximos ${rules.warrantyAlertDays} días`}
          empty="Ninguna garantía vence pronto."
          tone="amber"
          items={alerts.warranty.map((asset) => ({
            id: asset.id,
            to: `/activos/${formatAssetNumber(asset.number)}`,
            code: formatAssetNumber(asset.number),
            name: asset.name,
            detail: warrantyCountdown(asset.warrantyUntil),
            title: formatDay(asset.warrantyUntil),
            photoId: asset.photoId,
            icon: WrenchIcon,
          }))}
        />
        <AlertList
          title="Fallas repetidas"
          hint={`${rules.repeatedFailure.count} o más correctivas en ${rules.repeatedFailure.windowDays} días`}
          empty="Ningún equipo falla de forma repetida."
          tone="red"
          items={alerts.repeatedFailures.map((asset) => ({
            id: asset.id,
            to: `/activos/${formatAssetNumber(asset.number)}`,
            code: formatAssetNumber(asset.number),
            name: asset.name,
            detail: `${asset.failures} fallas`,
            photoId: asset.photoId,
            icon: WrenchIcon,
          }))}
        />
        <AlertList
          title="Stock bajo"
          hint="Por debajo del mínimo"
          empty="Ningún repuesto está bajo mínimo."
          tone="amber"
          items={alerts.lowStock.map((part) => ({
            id: part.id,
            to: `/repuestos/${formatSparePartNumber(part.number)}`,
            code: formatSparePartNumber(part.number),
            name: part.name,
            detail: `${formatQuantity(part.stock, part.unit)} de ${part.minStock}`,
            photoId: part.photoId,
            icon: BoxIcon,
          }))}
        />
      </div>
    </>
  );
}

/** Una tarjeta KPI que lleva a su lista. */
function Linked({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="block rounded-2xl outline-offset-2 transition-transform hover:-translate-y-0.5">
      {children}
    </Link>
  );
}

const TONE_DOT = { amber: "bg-amber", red: "bg-red" } as const;

function AlertList({
  title,
  hint,
  empty,
  tone,
  items,
}: {
  title: string;
  hint: string;
  empty: string;
  tone: keyof typeof TONE_DOT;
  items: {
    id: string;
    to: string;
    code: string;
    name: string;
    detail: string;
    title?: string;
    photoId?: string;
    icon: ComponentType<{ className?: string }>;
  }[];
}) {
  return (
    <Plate className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          {title}
          {items.length > 0 && (
            <span className="ml-1.5 rounded-full bg-[var(--content-bg)] px-1.5 text-xs font-medium tabular text-[var(--content-ink-dim)]">
              {items.length}
            </span>
          )}
        </h2>
        <span className="text-xs text-[var(--content-ink-dim)]">{hint}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--content-ink-dim)]">{empty}</p>
      ) : (
        <ul className="divide-y divide-[var(--content-border)] text-sm">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={item.to}
                className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]"
              >
                <span className="relative">
                  <Thumb photoId={item.photoId} icon={item.icon} />
                  <span
                    className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--content-surface)] ${TONE_DOT[tone]}`}
                    aria-hidden="true"
                  />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[var(--content-ink)]">{item.name}</span>
                  <span className="block font-display text-xs tabular text-[var(--content-ink-dim)]">{item.code}</span>
                </span>
                <span className="whitespace-nowrap text-xs font-medium text-[var(--content-ink)]" title={item.title}>
                  {item.detail}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Plate>
  );
}
