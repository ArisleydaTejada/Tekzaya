import {
  formatAssetNumber,
  formatMoney,
  formatSparePartNumber,
  type MaintenanceDashboard,
} from "@tekzaya/shared";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getMaintenanceDashboard, maintenanceKeys } from "../api/maintenance";
import { AlertIcon, BoxIcon, ChartIcon, ClipboardIcon, ShieldIcon, WrenchIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { StatTile } from "../components/StatTile";
import { formatDay, formatQuantity, warrantyCountdown } from "../lib/format";

/**
 * El panel de mantenimiento (plan A6): página propia, no mezclada con el tablero de
 * tickets. Cinco números para saber cómo va el área y tres listas de cosas que piden
 * atención. Lo que se mide a fondo —MTBF, disponibilidad, costo por equipo— vive en
 * Reportes, con la fuente de mantenimiento.
 */
export default function MantenimientoPage() {
  const [areaId, setAreaId] = useState<string | undefined>(undefined);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: maintenanceKeys.dashboard(areaId),
    queryFn: () => getMaintenanceDashboard(areaId),
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
                className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs text-[var(--content-ink)]"
              >
                <option value="">Todas las áreas</option>
                {data.areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </select>
            )}
            <Link
              to="/reportes"
              className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
            >
              <ChartIcon className="h-3.5 w-3.5" aria-hidden="true" /> Reportes de mantenimiento
            </Link>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Cargando panel">
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

function Dashboard({ data }: { data: MaintenanceDashboard }) {
  const { kpis, alerts, rules } = data;
  const pending = kpis.preventivesThisWeek.total - kpis.preventivesThisWeek.done;
  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Linked to="/ordenes">
          <StatTile label="Órdenes abiertas" value={String(kpis.openWorkOrders)} icon={<ClipboardIcon className="h-4 w-4" />} caption="Sin completar ni cancelar" />
        </Linked>
        <Linked to="/preventivos">
          <StatTile
            label="Preventivos de la semana"
            value={String(kpis.preventivesThisWeek.total)}
            icon={<ShieldIcon className="h-4 w-4" />}
            caption={kpis.preventivesThisWeek.total ? `${kpis.preventivesThisWeek.done} hechos · ${pending} por hacer` : "Ninguno programado"}
          />
        </Linked>
        <Linked to="/preventivos">
          <StatTile
            label="Preventivos vencidos"
            value={String(kpis.preventivesOverdue)}
            icon={<AlertIcon className={`h-4 w-4 ${kpis.preventivesOverdue ? "text-red" : ""}`} />}
            caption={kpis.preventivesOverdue ? "Pasaron su fecha sin hacerse" : "Todo al día"}
          />
        </Linked>
        <Linked to="/repuestos">
          <StatTile
            label="Repuestos bajo mínimo"
            value={String(kpis.lowStockParts)}
            icon={<BoxIcon className={`h-4 w-4 ${kpis.lowStockParts ? "text-amber" : ""}`} />}
            caption={kpis.lowStockParts ? "Conviene reponer" : "Almacén en orden"}
          />
        </Linked>
        <StatTile
          label="Costo del mes"
          value={formatMoney(kpis.monthCost, data.currency)}
          icon={<WrenchIcon className="h-4 w-4" />}
          caption="Repuestos y servicios externos"
        />
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
  items: { id: string; to: string; code: string; name: string; detail: string; title?: string }[];
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
                <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} aria-hidden="true" />
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
