import {
  formatMoney,
  formatSparePartNumber,
  type SparePartListQuery,
  type SparePartSort,
  type SparePartState,
  type SparePartView,
} from "@tekzaya/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listSpareParts, sparePartKeys, sparePartsCsvUrl } from "../api/spareParts";
import { AreaTag } from "../components/badges";
import { AlertIcon, DownloadIcon, PlusIcon, SearchIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { LowStockBadge, SparePartFormModal } from "../components/spareParts";
import { formatQuantity } from "../lib/format";

const PAGE_SIZE = 25;
const partPath = (part: { number: number }) => `/repuestos/${formatSparePartNumber(part.number)}`;

/**
 * Almacén de repuestos (plan A4): qué hay, cuánto vale y qué hay que reponer.
 * Cada área ve el suyo; RRHH y el administrador, todos. Lo que está bajo
 * mínimo se marca con texto e icono, y el resumen de la derecha también filtra.
 */
export default function RepuestosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [low, setLow] = useState(false);
  const [state, setState] = useState<SparePartState>("active");
  const [sort, setSort] = useState<SparePartSort>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const query: Partial<SparePartListQuery> = {
    page,
    limit: PAGE_SIZE,
    sort,
    dir,
    state,
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(low ? { low: "true" as const } : {}),
  };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: sparePartKeys.list(query),
    queryFn: () => listSpareParts(query),
    placeholderData: (previous) => previous,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currency = data?.currency ?? "USD";
  const manageable = data?.manageableAreas ?? [];
  // Con varias áreas a la vista (admin, RRHH), la columna del área ayuda; con una, sobra.
  const showArea = new Set(items.map((part) => part.areaId)).size > 1 || manageable.length > 1;

  function sortBy(column: SparePartSort) {
    if (sort === column) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setDir(column === "value" ? "desc" : "asc");
    }
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Repuestos"
        subtitle="Existencias del almacén, su costo y lo que hay que reponer."
        actions={
          <>
            <a
              href={sparePartsCsvUrl(query)}
              className={`flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] ${
                total === 0 ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <DownloadIcon className="h-3.5 w-3.5" /> Exportar CSV
            </a>
            {manageable.length > 0 && (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Nuevo repuesto
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-ink-dim)]" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                aria-label="Buscar repuestos"
                placeholder="Nombre o número (REP-0003)…"
                className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] py-2 pl-9 pr-3 text-sm text-[var(--content-ink)] outline-none placeholder:text-[var(--content-ink-dim)] focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
            </div>
            <select
              aria-label="Filtrar por estado"
              value={state}
              onChange={(event) => {
                setState(event.target.value as SparePartState);
                setPage(1);
              }}
              className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
            >
              <option value="active">Activos</option>
              <option value="inactive">Desactivados</option>
              <option value="all">Todos</option>
            </select>
          </div>

          {isError ? (
            <Plate className="py-16 text-center text-sm text-red">
              {error instanceof Error ? error.message : "No se pudo cargar el almacén."}
            </Plate>
          ) : isLoading ? (
            <Plate className="flex items-center justify-center py-16">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent" aria-label="Cargando repuestos" />
            </Plate>
          ) : items.length === 0 ? (
            <Plate className="py-16 text-center text-sm text-[var(--content-ink-dim)]">
              {low
                ? "Nada bajo mínimo: el almacén está al día."
                : search
                  ? "Ningún repuesto coincide con la búsqueda."
                  : "No hay repuestos que puedas ver. El almacén lo ve el área a la que pertenece."}
            </Plate>
          ) : (
            <PartTable parts={items} currency={currency} showArea={showArea} sort={sort} dir={dir} onSort={sortBy} />
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--content-ink-dim)]">
              Mostrando {items.length} de {total} repuestos.
            </p>
            {lastPage > 1 && (
              <div className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 font-medium text-[var(--content-ink)] disabled:opacity-40"
                >
                  Anterior
                </button>
                <span className="tabular text-[var(--content-ink-dim)]">
                  {page} / {lastPage}
                </span>
                <button
                  onClick={() => setPage((current) => Math.min(lastPage, current + 1))}
                  disabled={page >= lastPage}
                  className="rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 font-medium text-[var(--content-ink)] disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="space-y-4" aria-label="Resumen del almacén">
          <Plate className="p-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-[var(--content-ink)]">Resumen</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--content-ink-dim)]">Repuestos</dt>
                <dd className="font-display font-semibold tabular text-[var(--content-ink)]">{data?.summary.total ?? 0}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--content-ink-dim)]">Valor del inventario</dt>
                <dd className="font-display font-semibold tabular text-[var(--content-ink)]">
                  {formatMoney(data?.summary.stockValue ?? 0, currency)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              aria-pressed={low}
              onClick={() => {
                setLow((current) => !current);
                setPage(1);
              }}
              className={`mt-3 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                low ? "bg-amber/10 ring-1 ring-amber/50" : "hover:bg-[var(--content-bg)]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[var(--content-ink)]">
                <AlertIcon className="h-4 w-4 text-amber" aria-hidden="true" /> Bajo mínimo
              </span>
              <span className="font-display font-semibold tabular text-[var(--content-ink)]">{data?.summary.low ?? 0}</span>
            </button>
            <p className="mt-2 text-xs text-[var(--content-ink-dim)]">
              {low ? "Mostrando solo lo que hay que reponer." : "Pulsa para ver solo lo que hay que reponer."}
            </p>
          </Plate>
        </aside>
      </div>

      <SparePartFormModal
        open={creating}
        part={null}
        areas={manageable}
        currency={currency}
        onClose={() => setCreating(false)}
        onSaved={async (part) => {
          setCreating(false);
          await queryClient.invalidateQueries({ queryKey: sparePartKeys.all });
          navigate(partPath(part));
        }}
      />
    </div>
  );
}

function Th({
  label,
  column,
  sort,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  column?: SparePartSort;
  sort: SparePartSort;
  dir: "asc" | "desc";
  onSort: (column: SparePartSort) => void;
  className?: string;
}) {
  if (!column) return <th className={`px-3 py-2.5 font-medium ${className}`}>{label}</th>;
  const active = sort === column;
  return (
    <th className={`px-3 py-2.5 font-medium ${className}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        onClick={() => onSort(column)}
        className={`flex items-center gap-1 whitespace-nowrap hover:text-[var(--content-ink)] ${active ? "text-[var(--content-ink)]" : ""}`}
      >
        {label}
        <span aria-hidden="true" className={active ? "" : "opacity-0"}>
          {dir === "asc" ? "↑" : "↓"}
        </span>
      </button>
    </th>
  );
}

/** Barra de existencias frente al mínimo: llena a partir del doble del mínimo. */
function StockBar({ part }: { part: SparePartView }) {
  const target = Math.max(part.minStock * 2, 1);
  const fill = Math.min(100, Math.round((part.stock / target) * 100));
  return (
    <span className="mt-1 block h-1 w-20 overflow-hidden rounded-full bg-[var(--content-border)]" aria-hidden="true">
      <span className={`block h-full rounded-full ${part.low ? "bg-amber" : "bg-green"}`} style={{ width: `${fill}%` }} />
    </span>
  );
}

function PartTable({
  parts,
  currency,
  showArea,
  sort,
  dir,
  onSort,
}: {
  parts: SparePartView[];
  currency: string;
  showArea: boolean;
  sort: SparePartSort;
  dir: "asc" | "desc";
  onSort: (column: SparePartSort) => void;
}) {
  return (
    <>
      {/* En el móvil, tarjetas: la tabla no cabe en 360 px. */}
      <ul className="space-y-2 sm:hidden">
        {parts.map((part) => (
          <li key={part.id}>
            <Link
              to={partPath(part)}
              className="block rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-3 hover:bg-[var(--content-bg)]"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-display text-xs tabular text-[var(--content-ink-dim)]">{formatSparePartNumber(part.number)}</span>
                  <span className="block truncate font-medium text-[var(--content-ink)]">{part.name}</span>
                </span>
                {part.low && <LowStockBadge />}
              </span>
              <span className="mt-1 block text-xs text-[var(--content-ink-dim)]">
                {formatQuantity(part.stock, part.unit)} · mínimo {part.minStock} · {formatMoney(part.avgUnitCost, currency)} c/u
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Plate className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
              <Th label="Número" column="number" sort={sort} dir={dir} onSort={onSort} />
              <Th label="Repuesto" column="name" sort={sort} dir={dir} onSort={onSort} />
              {showArea && <Th label="Área" sort={sort} dir={dir} onSort={onSort} />}
              <Th label="Stock" column="stock" sort={sort} dir={dir} onSort={onSort} />
              <Th label="Mínimo" sort={sort} dir={dir} onSort={onSort} />
              <Th label="Costo promedio" sort={sort} dir={dir} onSort={onSort} className="text-right" />
              <Th label="Valor" column="value" sort={sort} dir={dir} onSort={onSort} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <tr
                key={part.id}
                className={`border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)] ${part.isActive ? "" : "bg-[var(--content-bg)]/60"}`}
              >
                <td className="whitespace-nowrap px-3 py-2.5 font-display tabular text-[var(--content-ink)]">
                  <Link to={partPath(part)} className="hover:text-accent-ink hover:underline">
                    {formatSparePartNumber(part.number)}
                  </Link>
                </td>
                <td className="max-w-[260px] px-3 py-2.5">
                  <Link to={partPath(part)} className="block truncate font-medium text-[var(--content-ink)] hover:text-accent-ink">
                    {part.name}
                  </Link>
                  <span className="mt-0.5 flex items-center gap-2">
                    {part.low && <LowStockBadge />}
                    {!part.isActive && <span className="text-xs text-[var(--content-ink-dim)]">Desactivado</span>}
                  </span>
                </td>
                {showArea && (
                  <td className="px-3 py-2.5">
                    <AreaTag area={part.area} />
                  </td>
                )}
                <td className="whitespace-nowrap px-3 py-2.5 tabular text-[var(--content-ink)]">
                  {formatQuantity(part.stock, part.unit)}
                  <StockBar part={part} />
                </td>
                <td className="px-3 py-2.5 tabular text-[var(--content-ink-dim)]">{part.minStock}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular text-[var(--content-ink)]">{formatMoney(part.avgUnitCost, currency)}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular text-[var(--content-ink)]">{formatMoney(part.stockValue, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Plate>
    </>
  );
}
