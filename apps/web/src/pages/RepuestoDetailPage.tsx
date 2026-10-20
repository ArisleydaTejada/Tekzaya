import {
  formatMoney,
  formatSparePartNumber,
  formatWorkOrderNumber,
  PART_UNIT_LABEL,
  STOCK_MOVEMENT_LABEL,
  type SparePartDetail,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { getSparePart, listStockMovements, sparePartKeys, updateSparePart } from "../api/spareParts";
import { workOrderKeys } from "../api/workOrders";
import { AreaTag } from "../components/badges";
import { PencilIcon, PlusIcon, SlidersIcon } from "../components/icons";
import { Plate } from "../components/Plate";
import { LowStockBadge, SparePartFormModal, StockMovementModal } from "../components/spareParts";
import { formatDateTime, formatQuantity, formatWhen } from "../lib/format";

const LEDGER_PAGE = 20;
const secondaryButton =
  "flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:opacity-50";

/**
 * Ficha del repuesto (plan A4): existencias frente al mínimo, su costo y el
 * libro de movimientos con el saldo que dejó cada uno. El supervisor registra
 * entradas y ajustes; los consumos llegan solos desde las órdenes de trabajo.
 */
export default function RepuestoDetailPage() {
  const { number = "" } = useParams();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"in" | "adjust" | "edit" | null>(null);
  const [page, setPage] = useState(1);

  const { data: part, isLoading, isError, error } = useQuery({
    queryKey: sparePartKeys.detail(number),
    queryFn: () => getSparePart(number),
    retry: false,
  });

  async function saved(next: SparePartDetail) {
    setDialog(null);
    setPage(1);
    queryClient.setQueryData(sparePartKeys.detail(number), next);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sparePartKeys.all }),
      // El selector de repuestos de las órdenes muestra lo que queda.
      queryClient.invalidateQueries({ queryKey: workOrderKeys.all }),
    ]);
  }

  const toggle = useMutation({
    mutationFn: () => updateSparePart(part!.id, { isActive: !part!.isActive }),
    onSuccess: saved,
  });

  if (isLoading) {
    return (
      <Plate className="flex items-center justify-center py-16">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent" aria-label="Cargando repuesto" />
      </Plate>
    );
  }
  if (isError || !part) {
    return (
      <Plate className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-[var(--content-ink-dim)]">{error instanceof Error ? error.message : "Ese repuesto no existe."}</p>
        <Link to="/repuestos" className="text-sm font-medium text-accent-ink hover:underline">
          Volver al almacén
        </Link>
      </Plate>
    );
  }

  const manage = part.permissions.manage;

  return (
    <div>
      <Link to="/repuestos" className="mb-3 inline-block text-xs font-medium text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]">
        ← Repuestos
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xs tabular text-[var(--content-ink-dim)]">{formatSparePartNumber(part.number)}</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--content-ink)]">{part.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {part.low && <LowStockBadge />}
            {!part.isActive && (
              <span className="rounded-md border border-[var(--content-border)] px-2 py-0.5 text-xs text-[var(--content-ink-dim)]">Desactivado</span>
            )}
            <span className="flex items-center gap-1.5 text-sm text-[var(--content-ink-dim)]">
              Almacén de <AreaTag area={part.area} />
            </span>
          </div>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            {part.isActive && (
              <>
                <button
                  onClick={() => setDialog("in")}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
                >
                  <PlusIcon className="h-3.5 w-3.5" /> Registrar entrada
                </button>
                <button onClick={() => setDialog("adjust")} className={secondaryButton}>
                  <SlidersIcon className="h-3.5 w-3.5" /> Ajustar stock
                </button>
                <button onClick={() => setDialog("edit")} className={secondaryButton}>
                  <PencilIcon className="h-3.5 w-3.5" /> Editar
                </button>
              </>
            )}
            <button onClick={() => toggle.mutate()} disabled={toggle.isPending} className={secondaryButton}>
              {part.isActive ? "Desactivar" : "Reactivar"}
            </button>
          </div>
        )}
      </div>

      {toggle.error && (
        <p role="alert" className="mb-4 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {toggle.error.message}
        </p>
      )}
      {!part.isActive && (
        <p className="mb-4 rounded-xl border border-[var(--content-border)] bg-[var(--content-bg)] px-4 py-3 text-sm text-[var(--content-ink-dim)]">
          Desactivado: ya no se ofrece en las órdenes de trabajo. Su libro se conserva.
        </p>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Figure label="Existencias">
          {formatQuantity(part.stock, part.unit)}
          <span className="mt-1 block text-xs font-normal text-[var(--content-ink-dim)]">Mínimo: {part.minStock}</span>
        </Figure>
        <Figure label="Costo promedio">
          {formatMoney(part.avgUnitCost, part.currency)}
          <span className="mt-1 block text-xs font-normal text-[var(--content-ink-dim)]">por {PART_UNIT_LABEL[part.unit]}</span>
        </Figure>
        <Figure label="Valor en el almacén">{formatMoney(part.stockValue, part.currency)}</Figure>
      </div>

      <Ledger part={part} page={page} onPage={setPage} />

      <StockMovementModal
        open={dialog === "in" || dialog === "adjust"}
        kind={dialog === "adjust" ? "adjust" : "in"}
        part={part}
        onClose={() => setDialog(null)}
        onSaved={saved}
      />
      <SparePartFormModal
        open={dialog === "edit"}
        part={part}
        areas={[]}
        currency={part.currency}
        onClose={() => setDialog(null)}
        onSaved={saved}
      />
    </div>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Plate className="p-4">
      <p className="text-xs text-[var(--content-ink-dim)]">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular text-[var(--content-ink)]">{children}</p>
    </Plate>
  );
}

/** El libro, más reciente primero. Entradas en verde y salidas en rojo, siempre con signo y texto. */
function Ledger({ part, page, onPage }: { part: SparePartDetail; page: number; onPage: (page: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: sparePartKeys.movements(part.id, page),
    queryFn: () => listStockMovements(part.id, page, LEDGER_PAGE),
    placeholderData: (previous) => previous,
  });
  const items = data?.items ?? [];
  const lastPage = Math.max(1, Math.ceil((data?.total ?? 0) / LEDGER_PAGE));

  return (
    <Plate className="overflow-hidden">
      <h2 className="px-4 pt-4 font-display text-sm font-semibold text-[var(--content-ink)]">Movimientos</h2>
      {isLoading ? (
        <p className="p-4 text-sm text-[var(--content-ink-dim)]">Cargando movimientos…</p>
      ) : items.length === 0 ? (
        <p className="p-4 text-sm text-[var(--content-ink-dim)]">Sin movimientos todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
                <th className="px-4 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Movimiento</th>
                <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                <th className="px-3 py-2 text-right font-medium">Costo unitario</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--content-border)] align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--content-ink-dim)]">
                    <time dateTime={item.at} title={formatDateTime(item.at)}>
                      {formatWhen(item.at)}
                    </time>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-[var(--content-ink)]">{STOCK_MOVEMENT_LABEL[item.kind]}</span>
                    {item.workOrder && (
                      <>
                        {" · "}
                        <Link
                          to={`/ordenes/${formatWorkOrderNumber(item.workOrder.number)}`}
                          className="font-display text-xs tabular text-accent-ink hover:underline"
                        >
                          {formatWorkOrderNumber(item.workOrder.number)}
                        </Link>
                      </>
                    )}
                    {(item.reason || item.actor) && (
                      <span className="block text-xs text-[var(--content-ink-dim)]">
                        {[item.reason, item.actor && `por ${item.actor.name}`].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right font-medium tabular ${item.qty > 0 ? "text-green" : "text-red"}`}>
                    {item.qty > 0 ? `+${item.qty}` : `−${Math.abs(item.qty)}`}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular text-[var(--content-ink-dim)]">
                    {formatMoney(item.unitCost, part.currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-display font-semibold tabular text-[var(--content-ink)]">
                    {item.balance}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lastPage > 1 && (
        <div className="flex items-center justify-end gap-2 border-t border-[var(--content-border)] px-4 py-2.5 text-xs">
          <button
            onClick={() => onPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 font-medium text-[var(--content-ink)] disabled:opacity-40"
          >
            Más recientes
          </button>
          <span className="tabular text-[var(--content-ink-dim)]">
            {page} / {lastPage}
          </span>
          <button
            onClick={() => onPage(Math.min(lastPage, page + 1))}
            disabled={page >= lastPage}
            className="rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 font-medium text-[var(--content-ink)] disabled:opacity-40"
          >
            Anteriores
          </button>
        </div>
      )}
    </Plate>
  );
}
