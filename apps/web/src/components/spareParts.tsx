import {
  amountInputFromCents,
  centsFromAmountInput,
  formatAssetNumber,
  PART_UNIT_LABEL,
  PART_UNITS,
  type AreaRef,
  type PartUnit,
  type SparePartAssetRef,
  type SparePartDetail,
  type SparePartView,
} from "@tekzaya/shared";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { assetKeys, listAssets } from "../api/assets";
import { createSparePart, createStockMovement, updateSparePart } from "../api/spareParts";
import { formatQuantity } from "../lib/format";
import { useOnOpen } from "../lib/useOnOpen";
import { AlertIcon, SearchIcon, XIcon } from "./icons";
import { Modal } from "./Modal";
import { MoneyInput } from "./MoneyInput";

const inputClass =
  "w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent";
const labelClass = "mb-1 block text-xs font-medium text-[var(--content-ink-dim)]";

/** Bajo mínimo: icono y texto, nunca solo color (plan A7). */
export function LowStockBadge() {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-amber/40 bg-amber/10 px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-amber">
      <AlertIcon className="h-3 w-3" aria-hidden="true" />
      Bajo mínimo
    </span>
  );
}

/** Centavos de lo que se escribe en un campo de monto; lo ilegible cuenta como "sin monto". */
function centsOf(text: string): number | null {
  try {
    return text ? centsFromAmountInput(text) : null;
  } catch {
    return null;
  }
}

function ErrorBox({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
      {message}
    </p>
  );
}

function Footer({ onClose, onConfirm, label, disabled }: { onClose: () => void; onConfirm: () => void; label: string; disabled: boolean }) {
  return (
    <>
      <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
        Cancelar
      </button>
      <button
        onClick={onConfirm}
        disabled={disabled}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label}
      </button>
    </>
  );
}

/**
 * Alta y edición de un repuesto. Al darlo de alta se pueden registrar las
 * existencias con las que llega, que entran al libro como una entrada más; al
 * editarlo, el stock no se toca aquí: se mueve con entradas y ajustes.
 */
export function SparePartFormModal({
  open,
  part,
  areas,
  currency,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** `null` para dar de alta. */
  part: SparePartView | null;
  /** Áreas en las que se puede dar de alta (solo en el alta). */
  areas: readonly AreaRef[];
  currency: string;
  onClose: () => void;
  onSaved: (part: SparePartDetail) => void;
}) {
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("");
  const [unit, setUnit] = useState<PartUnit>("unit");
  const [minStock, setMinStock] = useState("0");
  const [initialQty, setInitialQty] = useState("");
  const [initialCost, setInitialCost] = useState("");
  const [linked, setLinked] = useState<SparePartAssetRef[]>([]);

  useOnOpen(open, () => {
    setLinked(part?.assets ?? []);
    setName(part?.name ?? "");
    setAreaId(part?.areaId ?? areas[0]?.id ?? "");
    setUnit(part?.unit ?? "unit");
    setMinStock(String(part?.minStock ?? 0));
    setInitialQty("");
    setInitialCost("");
  });

  const qty = Number(initialQty) || 0;
  const cost = centsOf(initialCost);
  const min = Number(minStock);
  const valid =
    name.trim().length > 0 &&
    Number.isInteger(min) &&
    min >= 0 &&
    (part !== null || areaId !== "") &&
    (qty === 0 || (Number.isInteger(qty) && qty > 0 && cost !== null));

  const save = useMutation({
    mutationFn: () =>
      part
        ? updateSparePart(part.id, { name: name.trim(), unit, minStock: min, assetIds: linked.map((asset) => asset.id) })
        : createSparePart({
            name: name.trim(),
            areaId,
            unit,
            minStock: min,
            assetIds: linked.map((asset) => asset.id),
            ...(qty > 0 && cost !== null ? { initialStock: { qty, unitCost: cost } } : {}),
          }),
    onSuccess: onSaved,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={part ? "Editar repuesto" : "Nuevo repuesto"}
      footer={<Footer onClose={onClose} onConfirm={() => save.mutate()} label="Guardar" disabled={!valid || save.isPending} />}
    >
      <ErrorBox message={save.error?.message} />
      <div className="space-y-3">
        <label className="block">
          <span className={labelClass}>Nombre</span>
          <input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </label>
        {!part && areas.length > 1 && (
          <label className="block">
            <span className={labelClass}>Almacén del área</span>
            <select
              value={areaId}
              onChange={(event) => {
                // Los equipos son del área: cambiar de almacén deja la lista vacía.
                setAreaId(event.target.value);
                setLinked([]);
              }}
              className={inputClass}
            >
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>Unidad</span>
            <select value={unit} onChange={(event) => setUnit(event.target.value as PartUnit)} className={inputClass}>
              {PART_UNITS.map((option) => (
                <option key={option} value={option}>
                  {PART_UNIT_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Stock mínimo</span>
            <input type="number" min={0} inputMode="numeric" value={minStock} onChange={(event) => setMinStock(event.target.value)} className={inputClass} />
          </label>
        </div>
        {(part?.areaId ?? areaId) && (
          <AssetChecklist areaId={part?.areaId ?? areaId} value={linked} onChange={setLinked} enabled={open} />
        )}
        {!part && (
          <fieldset className="rounded-lg border border-[var(--content-border)] p-3">
            <legend className="px-1 text-xs font-medium text-[var(--content-ink-dim)]">Existencias iniciales (opcional)</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>Cantidad</span>
                <input type="number" min={0} inputMode="numeric" value={initialQty} onChange={(event) => setInitialQty(event.target.value)} className={inputClass} />
              </label>
              <div>
                <label htmlFor="initial-cost" className={labelClass}>
                  Costo unitario
                </label>
                <MoneyInput id="initial-cost" value={initialCost} onChange={setInitialCost} currency={currency} />
              </div>
            </div>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

/**
 * "¿En qué equipos se usa?": los del área que guarda la pieza, con buscador. Lo
 * elegido queda arriba como fichas, aunque la búsqueda ya no lo muestre.
 */
function AssetChecklist({
  areaId,
  value,
  onChange,
  enabled,
}: {
  areaId: string;
  value: readonly SparePartAssetRef[];
  onChange: (assets: SparePartAssetRef[]) => void;
  enabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const query = { areaId, status: ["operational", "in_repair"] as ("operational" | "in_repair")[], sort: "name", limit: 100, ...(q ? { q } : {}) } as const;
  const { data, isLoading } = useQuery({
    queryKey: assetKeys.list(query),
    queryFn: () => listAssets(query),
    enabled,
    placeholderData: keepPreviousData,
  });
  const chosen = new Set(value.map((asset) => asset.id));
  const toggle = (asset: SparePartAssetRef) =>
    onChange(chosen.has(asset.id) ? value.filter((other) => other.id !== asset.id) : [...value, asset]);

  return (
    <fieldset className="rounded-lg border border-[var(--content-border)] p-3">
      <legend className="px-1 text-xs font-medium text-[var(--content-ink-dim)]">Equipos en los que se usa (opcional)</legend>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Equipos elegidos">
          {value.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => toggle(asset)}
                aria-label={`Quitar ${asset.name}`}
                className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-[var(--content-ink)] hover:bg-accent/20"
              >
                {asset.name}
                <XIcon className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative mb-2">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--content-ink-dim)]" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre, número o modelo"
          aria-label="Buscar equipos"
          className={`${inputClass} pl-8`}
        />
      </div>
      <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--content-border)]">
        {isLoading ? (
          <p className="px-3 py-2 text-xs text-[var(--content-ink-dim)]">Cargando equipos…</p>
        ) : !data?.items.length ? (
          <p className="px-3 py-2 text-xs text-[var(--content-ink-dim)]">Ningún equipo coincide.</p>
        ) : (
          <ul className="divide-y divide-[var(--content-border)]">
            {data.items.map((asset) => {
              const ref = { id: asset.id, number: asset.number, name: asset.name, status: asset.status };
              return (
                <li key={asset.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-[var(--content-ink)] hover:bg-[var(--content-bg)]">
                    <input
                      type="checkbox"
                      checked={chosen.has(asset.id)}
                      onChange={() => toggle(ref)}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                    <span className="font-display text-[11px] tabular text-[var(--content-ink-dim)]">
                      {formatAssetNumber(asset.number)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-1.5 text-xs text-[var(--content-ink-dim)]">
        Aparecerá en la ficha de esos equipos con sus existencias, y primero al cargar repuestos en sus órdenes.
      </p>
    </fieldset>
  );
}

/**
 * Entrada (una compra, con su costo, que mueve el promedio) o ajuste (conteo
 * físico o merma, al costo actual y con motivo). Consumos y devoluciones solo
 * salen de una orden de trabajo.
 */
export function StockMovementModal({
  open,
  kind,
  part,
  onClose,
  onSaved,
}: {
  open: boolean;
  kind: "in" | "adjust";
  part: SparePartDetail;
  onClose: () => void;
  onSaved: (part: SparePartDetail) => void;
}) {
  const [qty, setQty] = useState("");
  const [direction, setDirection] = useState<"down" | "up">("down");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");

  useOnOpen(open, () => {
    setQty("");
    setDirection("down");
    // Una compra suele costar lo mismo que la anterior: se propone el promedio.
    setCost(part.avgUnitCost ? amountInputFromCents(part.avgUnitCost) : "");
    setReason("");
  });

  const amount = Number(qty);
  const unitCost = centsOf(cost);
  const valid =
    Number.isInteger(amount) &&
    amount > 0 &&
    (kind === "in" ? unitCost !== null : reason.trim().length > 0 && (direction === "up" || amount <= part.stock));

  const save = useMutation({
    mutationFn: () =>
      createStockMovement(
        part.id,
        kind === "in"
          ? { kind, qty: amount, unitCost: unitCost!, ...(reason.trim() ? { reason: reason.trim() } : {}) }
          : { kind, qty: direction === "down" ? -amount : amount, reason: reason.trim() },
      ),
    onSuccess: onSaved,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === "in" ? "Registrar entrada" : "Ajustar stock"}
      footer={
        <Footer
          onClose={onClose}
          onConfirm={() => save.mutate()}
          label={kind === "in" ? "Registrar entrada" : "Ajustar"}
          disabled={!valid || save.isPending}
        />
      }
    >
      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">
        {part.name}: hay {formatQuantity(part.stock, part.unit)}.
        {kind === "in"
          ? " La entrada recalcula el costo promedio."
          : " El ajuste corrige la cantidad al costo actual y queda en el libro con su motivo."}
      </p>
      <ErrorBox message={save.error?.message} />
      <div className="space-y-3">
        {kind === "adjust" && (
          <fieldset>
            <legend className={labelClass}>Sentido</legend>
            <div className="flex gap-4">
              {[
                { value: "down" as const, label: "Faltan (restar)" },
                { value: "up" as const, label: "Sobran (sumar)" },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-[var(--content-ink)]">
                  <input
                    type="radio"
                    name="adjust-direction"
                    checked={direction === option.value}
                    onChange={() => setDirection(option.value)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={labelClass}>Cantidad ({PART_UNIT_LABEL[part.unit]})</span>
            <input type="number" min={1} inputMode="numeric" value={qty} onChange={(event) => setQty(event.target.value)} className={inputClass} />
          </label>
          {kind === "in" && (
            <div>
              <label htmlFor="movement-cost" className={labelClass}>
                Costo unitario
              </label>
              <MoneyInput id="movement-cost" value={cost} onChange={setCost} currency={part.currency} />
            </div>
          )}
        </div>
        {kind === "adjust" && direction === "down" && amount > part.stock && (
          <p className="text-xs text-red">No puedes restar más de lo que hay: el stock nunca queda en negativo.</p>
        )}
        <label className="block">
          <span className={labelClass}>{kind === "in" ? "Proveedor o factura (opcional)" : "Motivo"}</span>
          <input
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            placeholder={kind === "in" ? "Factura 1182 · Distribuidora Láser" : "Conteo físico, pieza dañada…"}
            className={inputClass}
          />
        </label>
      </div>
    </Modal>
  );
}
