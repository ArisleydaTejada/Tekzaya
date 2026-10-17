import {
  ASSET_STATUSES,
  ASSET_STATUS_LABEL,
  ASSET_TYPE_LABEL,
  ASSET_TYPES,
  formatAssetNumber,
  isAdmin,
  WARRANTY_STATE_LABEL,
  WARRANTY_STATES,
  type AssetListQuery,
  type AssetSort,
  type AssetStatus,
  type AssetType,
  type AssetView,
  type WarrantyState,
} from "@tekzaya/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { assetKeys, assetsCsvUrl, listAssetLocations, listAssets } from "../api/assets";
import { areaKeys, listAreas } from "../api/tickets";
import { useAuth } from "../auth/AuthContext";
import { AssetFormModal } from "../components/AssetFormModal";
import { AssetStatusBadge, WarrantyBadge } from "../components/assets";
import { Avatar } from "../components/Avatar";
import { AreaTag } from "../components/badges";
import { DownloadIcon, PlusIcon, SearchIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";

const PAGE_SIZE = 25;

interface Filters {
  status: AssetStatus | "";
  type: AssetType | "";
  areaId: string;
  usedByAreaId: string;
  location: string;
  warranty: WarrantyState | "";
}

const NO_FILTERS: Filters = { status: "", type: "", areaId: "", usedByAreaId: "", location: "", warranty: "" };

/** Barras del resumen: el estado se lee por el texto, el color solo acompaña. */
const SUMMARY_BAR: Record<AssetStatus, string> = {
  operational: "bg-green",
  in_repair: "bg-amber",
  retired: "bg-[var(--content-ink-dim)]",
};

/**
 * Inventario de activos (plan A1). Lista a la izquierda y, a la derecha, el
 * panel de la referencia de diseño: resumen por estado —que también filtra— y
 * los filtros. Lo que entra en la lista lo decide el servidor desde la sesión:
 * el empleado solo recibe los equipos que usa su área o tiene a su cargo.
 */
export default function ActivosPage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sort, setSort] = useState<AssetSort>("number");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const query: Partial<AssetListQuery> = {
    page,
    limit: PAGE_SIZE,
    sort,
    dir,
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(filters.status ? { status: [filters.status] } : {}),
    ...(filters.type ? { type: [filters.type] } : {}),
    ...(filters.areaId ? { areaId: filters.areaId } : {}),
    ...(filters.usedByAreaId ? { usedByAreaId: filters.usedByAreaId } : {}),
    ...(filters.location ? { location: filters.location } : {}),
    ...(filters.warranty ? { warranty: filters.warranty } : {}),
  };

  const { data, isLoading, isError, error } = useQuery({
    queryKey: assetKeys.list(query),
    queryFn: () => listAssets(query),
    placeholderData: (previous) => previous,
  });
  const { data: areas = [] } = useQuery({ queryKey: areaKeys.all, queryFn: listAreas });
  const { data: locations = [] } = useQuery({ queryKey: assetKeys.locations(), queryFn: listAssetLocations });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts = data?.statusCounts;
  const countsTotal = counts ? ASSET_STATUSES.reduce((sum, status) => sum + counts[status], 0) : 0;
  const canCreate = Boolean(me && (isAdmin(me) || me.isAreaSupervisor));
  const filtering = search.trim() !== "" || Object.values(filters).some(Boolean);

  function filter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function sortBy(column: AssetSort) {
    if (sort === column) setDir((current) => (current === "asc" ? "desc" : "asc"));
    else {
      setSort(column);
      setDir("asc");
    }
    setPage(1);
  }

  return (
    <div>
      <PageHeader
        title="Activos"
        subtitle="Inventario de equipos, quién los usa y en qué estado están."
        actions={
          <>
            <a
              href={assetsCsvUrl(query)}
              className={`flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] ${
                total === 0 ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <DownloadIcon className="h-3.5 w-3.5" /> Exportar CSV
            </a>
            {canCreate && (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
              >
                <PlusIcon className="h-3.5 w-3.5" /> Nuevo activo
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 lg:order-1">
          <div className="relative mb-3 max-w-md">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--content-ink-dim)]" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              aria-label="Buscar activos"
              placeholder="Buscar por número, nombre, marca o serie…"
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] py-2 pl-9 pr-3 text-sm text-[var(--content-ink)] outline-none placeholder:text-[var(--content-ink-dim)] focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
          </div>

          {isError ? (
            <Plate className="py-16 text-center text-sm text-red">
              {error instanceof Error ? error.message : "No se pudo cargar el inventario."}
            </Plate>
          ) : isLoading ? (
            <Plate className="flex items-center justify-center py-16">
              <span
                className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
                aria-label="Cargando activos"
              />
            </Plate>
          ) : items.length === 0 ? (
            <Plate className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-sm text-[var(--content-ink-dim)]">
                {filtering ? "Ningún activo coincide con los filtros." : "Todavía no hay activos que puedas ver."}
              </p>
              {filtering && (
                <button
                  onClick={() => {
                    setSearch("");
                    setFilters(NO_FILTERS);
                    setPage(1);
                  }}
                  className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                >
                  Limpiar filtros
                </button>
              )}
            </Plate>
          ) : (
            <AssetTable assets={items} sort={sort} dir={dir} onSort={sortBy} />
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--content-ink-dim)]">
              Mostrando {items.length} de {total} activos.
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

        <aside className="space-y-4 lg:order-2" aria-label="Resumen y filtros">
          <Plate className="p-4">
            <h2 className="mb-3 font-display text-sm font-semibold text-[var(--content-ink)]">Por estado</h2>
            <ul className="space-y-1">
              {ASSET_STATUSES.map((status) => {
                const count = counts?.[status] ?? 0;
                const active = filters.status === status;
                return (
                  <li key={status}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => filter("status", active ? "" : status)}
                      className={`w-full rounded-lg px-2.5 py-2 text-left transition-colors ${
                        active ? "bg-accent/10 ring-1 ring-accent/40" : "hover:bg-[var(--content-bg)]"
                      }`}
                    >
                      <span className="flex items-center justify-between text-sm">
                        <span className="text-[var(--content-ink)]">{ASSET_STATUS_LABEL[status]}</span>
                        <span className="font-display font-semibold tabular text-[var(--content-ink)]">{count}</span>
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-[var(--content-border)]">
                        <span
                          className={`block h-full rounded-full ${SUMMARY_BAR[status]}`}
                          style={{ width: `${countsTotal ? Math.round((count / countsTotal) * 100) : 0}%` }}
                        />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Plate>

          <Plate className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">Filtros</h2>
              {Object.values(filters).some(Boolean) && (
                <button
                  onClick={() => {
                    setFilters(NO_FILTERS);
                    setPage(1);
                  }}
                  className="text-xs font-medium text-accent-ink hover:underline"
                >
                  Limpiar
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <FilterSelect label="Tipo" value={filters.type} onChange={(value) => filter("type", value as AssetType | "")}>
                <option value="">Todos los tipos</option>
                {ASSET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ASSET_TYPE_LABEL[type]}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Área responsable" value={filters.areaId} onChange={(value) => filter("areaId", value)}>
                <option value="">Todas</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Área que lo usa" value={filters.usedByAreaId} onChange={(value) => filter("usedByAreaId", value)}>
                <option value="">Todas</option>
                {areas.map((area) => (
                  <option key={area.id} value={area.id}>
                    {area.name}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Ubicación" value={filters.location} onChange={(value) => filter("location", value)}>
                <option value="">Todas</option>
                {locations.map((place) => (
                  <option key={place} value={place}>
                    {place}
                  </option>
                ))}
              </FilterSelect>
              <FilterSelect label="Garantía" value={filters.warranty} onChange={(value) => filter("warranty", value as WarrantyState | "")}>
                <option value="">Cualquiera</option>
                {WARRANTY_STATES.map((state) => (
                  <option key={state} value={state}>
                    {WARRANTY_STATE_LABEL[state]}
                  </option>
                ))}
              </FilterSelect>
            </div>
          </Plate>
        </aside>
      </div>

      <AssetFormModal
        open={creating}
        asset={null}
        currency={data?.currency ?? "USD"}
        onClose={() => setCreating(false)}
        onSaved={async (asset) => {
          setCreating(false);
          await queryClient.invalidateQueries({ queryKey: assetKeys.all });
          navigate(`/activos/${formatAssetNumber(asset.number)}`);
        }}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--content-ink-dim)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
      >
        {children}
      </select>
    </label>
  );
}

function Th({
  label,
  column,
  sort,
  dir,
  onSort,
}: {
  label: string;
  column?: AssetSort;
  sort: AssetSort;
  dir: "asc" | "desc";
  onSort: (column: AssetSort) => void;
}) {
  if (!column) return <th className="px-3 py-2.5 font-medium">{label}</th>;
  const active = sort === column;
  return (
    <th className="px-3 py-2.5 font-medium" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
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

function AssetTable({
  assets,
  sort,
  dir,
  onSort,
}: {
  assets: AssetView[];
  sort: AssetSort;
  dir: "asc" | "desc";
  onSort: (column: AssetSort) => void;
}) {
  return (
    <>
      {/* En el móvil, tarjetas: una tabla de seis columnas escondería el estado de lado. */}
      <ul className="space-y-2 sm:hidden">
        {assets.map((asset) => {
          const number = formatAssetNumber(asset.number);
          return (
            <li key={asset.id}>
              <Link
                to={`/activos/${number}`}
                className="block rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-3 hover:bg-[var(--content-bg)]"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-display text-xs tabular text-[var(--content-ink-dim)]">{number}</span>
                    <span className="block truncate font-medium text-[var(--content-ink)]">{asset.name}</span>
                  </span>
                  <AssetStatusBadge status={asset.status} />
                </span>
                <span className="mt-1 block truncate text-xs text-[var(--content-ink-dim)]">
                  {asset.location}
                  {asset.custodian && ` · ${asset.custodian.name}`}
                </span>
                <span className="mt-1.5 block">
                  <WarrantyBadge state={asset.warranty} until={asset.warrantyUntil} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    <Plate className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
            <Th label="Número" column="number" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Equipo" column="name" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Estado" column="status" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Lo usa" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Ubicación" column="location" sort={sort} dir={dir} onSort={onSort} />
            <Th label="Garantía" column="warranty" sort={sort} dir={dir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => {
            const number = formatAssetNumber(asset.number);
            return (
              <tr
                key={asset.id}
                // Los dados de baja se distinguen por el fondo y su etiqueta, no
                // atenuando el texto: bajaría del contraste AA.
                className={`border-b border-[var(--content-border)] last:border-0 hover:bg-[var(--content-bg)] ${
                  asset.status === "retired" ? "bg-[var(--content-bg)]/60" : ""
                }`}
              >
                <td className="whitespace-nowrap px-3 py-2.5 font-display tabular text-[var(--content-ink)]">
                  <Link to={`/activos/${number}`} className="hover:text-accent-ink hover:underline">
                    {number}
                  </Link>
                </td>
                <td className="max-w-[240px] px-3 py-2.5">
                  <Link to={`/activos/${number}`} className="block truncate font-medium text-[var(--content-ink)] hover:text-accent-ink">
                    {asset.name}
                  </Link>
                  <span className="block truncate text-xs text-[var(--content-ink-dim)]">
                    {ASSET_TYPE_LABEL[asset.type]}
                    {(asset.brand || asset.model) && ` · ${[asset.brand, asset.model].filter(Boolean).join(" ")}`}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <AssetStatusBadge status={asset.status} />
                </td>
                <td className="px-3 py-2.5">
                  {asset.custodian ? (
                    <span className="flex items-center gap-2 text-[var(--content-ink)]">
                      <Avatar name={asset.custodian.name} src={asset.custodian.avatarUrl} size="sm" />
                      <span className="truncate">{asset.custodian.name}</span>
                    </span>
                  ) : (
                    <AreaTag area={asset.usedByArea ?? asset.area} />
                  )}
                </td>
                <td className="min-w-[120px] px-3 py-2.5 text-xs text-[var(--content-ink-dim)]">{asset.location}</td>
                <td className="px-3 py-2.5">
                  <WarrantyBadge state={asset.warranty} until={asset.warrantyUntil} stacked />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Plate>
    </>
  );
}
