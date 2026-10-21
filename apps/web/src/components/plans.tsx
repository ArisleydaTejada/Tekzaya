import {
  ASSET_TYPE_LABEL,
  ASSET_TYPES,
  formatAssetNumber,
  PLAN_MODE_LABEL,
  PLAN_MODES,
  PLAN_UNIT_LABEL,
  PLAN_UNITS,
  type AreaRef,
  type AssetListQuery,
  type AssetType,
  type PlanMode,
  type PlanUnit,
  type PlanView,
} from "@tekzaya/shared";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { assetKeys, listAssets } from "../api/assets";
import { createPlan, updatePlan } from "../api/plans";
import { useOnOpen } from "../lib/useOnOpen";
import { Modal } from "./Modal";

const inputClass =
  "w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent";
const labelClass = "mb-1 block text-xs font-medium text-[var(--content-ink-dim)]";

/** Lo que significa cada modo, dicho para quien elige. */
const PLAN_MODE_HINT: Record<PlanMode, string> = {
  fixed: "Sigue el calendario aunque un mantenimiento se haga tarde. Para lo que exige una norma o un contrato.",
  from_last: "Cuenta desde el día en que se completó el anterior. Para el desgaste real del equipo.",
};

/** "Hoy" en el reloj de quien mira; el servidor valida con el de la empresa. */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const linesOf = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/**
 * Alta y edición de un plan preventivo (plan A5). Lo que cubre el plan —un
 * equipo, o todos los de un tipo en un área— se elige al darlo de alta y no
 * cambia después: otro equipo es otro plan.
 */
export function PlanFormModal({
  open,
  plan,
  areas,
  defaultLeadDays,
  presetAsset,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** `null` para dar de alta. */
  plan: PlanView | null;
  /** Áreas en las que se pueden crear planes (solo en el alta). */
  areas: readonly AreaRef[];
  defaultLeadDays: number;
  /** Alta desde la ficha de un equipo: ya viene elegido. */
  presetAsset?: { id: string; number: number; name: string } | undefined;
  onClose: () => void;
  onSaved: (plan: PlanView) => void;
}) {
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState<"asset" | "type">("asset");
  const [assetId, setAssetId] = useState("");
  const [assetSearch, setAssetSearch] = useState("");
  const [assetType, setAssetType] = useState<AssetType>("printer");
  const [areaId, setAreaId] = useState("");
  const [every, setEvery] = useState("3");
  const [unit, setUnit] = useState<PlanUnit>("month");
  const [mode, setMode] = useState<PlanMode>("fixed");
  const [date, setDate] = useState("");
  const [leadDays, setLeadDays] = useState("");
  const [checklist, setChecklist] = useState("");

  useOnOpen(open, () => {
    setTitle(plan?.title ?? "");
    setScope(plan ? (plan.assetId ? "asset" : "type") : "asset");
    setAssetId(presetAsset?.id ?? "");
    setAssetSearch("");
    setAssetType("printer");
    setAreaId(areas[0]?.id ?? "");
    setEvery(String(plan?.every ?? 3));
    setUnit(plan?.unit ?? "month");
    setMode(plan?.mode ?? "fixed");
    setDate(plan?.nextDueAt ?? localToday());
    setLeadDays(String(plan?.leadDays ?? defaultLeadDays));
    setChecklist((plan?.checklist ?? []).join("\n"));
  });

  const q = useDeferredValue(assetSearch.trim());
  const assetQuery: Partial<AssetListQuery> = { q, status: ["operational", "in_repair"], limit: 20, sort: "name" };
  const assets = useQuery({
    queryKey: assetKeys.list(assetQuery),
    queryFn: () => listAssets(assetQuery),
    enabled: open && !plan && !presetAsset && scope === "asset",
    placeholderData: keepPreviousData,
  });
  // Solo los equipos de un área donde quien crea puede gestionar planes.
  const manageable = new Set(areas.map((area) => area.id));
  const assetOptions = (assets.data?.items ?? []).filter((asset) => manageable.has(asset.areaId));

  const everyNumber = Number(every);
  const leadNumber = Number(leadDays);
  const valid =
    title.trim().length >= 3 &&
    Number.isInteger(everyNumber) &&
    everyNumber >= 1 &&
    everyNumber <= 365 &&
    Number.isInteger(leadNumber) &&
    leadNumber >= 0 &&
    leadNumber <= 60 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    (plan !== null || (scope === "asset" ? assetId !== "" : areaId !== ""));

  const save = useMutation({
    mutationFn: () => {
      const recurrence = { every: everyNumber, unit, mode, leadDays: leadNumber, checklist: linesOf(checklist) };
      if (plan) {
        return updatePlan(plan.id, {
          title: title.trim(),
          ...recurrence,
          ...(date !== plan.nextDueAt ? { nextDueAt: date } : {}),
        });
      }
      return createPlan({
        title: title.trim(),
        ...(scope === "asset" ? { assetId } : { assetType, areaId }),
        ...recurrence,
        startsOn: date,
      });
    },
    onSuccess: onSaved,
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan ? "Editar plan preventivo" : "Nuevo plan preventivo"}
      wide
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!valid || save.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Guardar
          </button>
        </>
      }
    >
      {save.error && (
        <p role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {save.error.message}
        </p>
      )}
      <div className="space-y-4">
        <label className="block">
          <span className={labelClass}>Título</span>
          <input
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Limpieza de filtros del aire acondicionado"
            className={inputClass}
          />
        </label>

        {plan ? (
          <p className="text-sm text-[var(--content-ink-dim)]">
            Cubre{" "}
            {plan.asset
              ? `${formatAssetNumber(plan.asset.number)} · ${plan.asset.name}`
              : `todos los equipos «${ASSET_TYPE_LABEL[plan.assetType!]}» de ${plan.area.name}`}
            . Otro equipo es otro plan.
          </p>
        ) : presetAsset ? (
          <p className="text-sm text-[var(--content-ink-dim)]">
            Para {formatAssetNumber(presetAsset.number)} · {presetAsset.name}.
          </p>
        ) : (
          <fieldset className="rounded-lg border border-[var(--content-border)] p-3">
            <legend className="px-1 text-xs font-medium text-[var(--content-ink-dim)]">Qué cubre</legend>
            <div className="mb-3 flex flex-wrap gap-4">
              {[
                { value: "asset" as const, label: "Un equipo" },
                { value: "type" as const, label: "Todos los de un tipo en un área" },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm text-[var(--content-ink)]">
                  <input
                    type="radio"
                    name="plan-scope"
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {scope === "asset" ? (
              <div className="space-y-2">
                <input
                  value={assetSearch}
                  onChange={(event) => setAssetSearch(event.target.value)}
                  aria-label="Buscar equipo"
                  placeholder="Buscar por nombre o número (ACT-0012)…"
                  className={inputClass}
                />
                <select
                  aria-label="Equipo"
                  value={assetId}
                  onChange={(event) => setAssetId(event.target.value)}
                  className={inputClass}
                >
                  <option value="">{assets.isLoading ? "Cargando equipos…" : "Elige un equipo"}</option>
                  {assetOptions.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {formatAssetNumber(asset.number)} · {asset.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClass}>Tipo de equipo</span>
                  <select value={assetType} onChange={(event) => setAssetType(event.target.value as AssetType)} className={inputClass}>
                    {ASSET_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {ASSET_TYPE_LABEL[type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>Área que los mantiene</span>
                  <select value={areaId} onChange={(event) => setAreaId(event.target.value)} className={inputClass}>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={labelClass}>Cada</span>
            <input type="number" min={1} max={365} inputMode="numeric" value={every} onChange={(event) => setEvery(event.target.value)} className={inputClass} />
          </label>
          <label className="block">
            <span className={labelClass}>Unidad</span>
            <select value={unit} onChange={(event) => setUnit(event.target.value as PlanUnit)} className={inputClass}>
              {PLAN_UNITS.map((option) => (
                <option key={option} value={option}>
                  {PLAN_UNIT_LABEL[option].many}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Días de antelación</span>
            <input type="number" min={0} max={60} inputMode="numeric" value={leadDays} onChange={(event) => setLeadDays(event.target.value)} className={inputClass} />
          </label>
        </div>

        <fieldset>
          <legend className={labelClass}>Cómo se cuenta la siguiente fecha</legend>
          <div className="space-y-2">
            {PLAN_MODES.map((option) => (
              <label key={option} className="flex items-start gap-2 text-sm text-[var(--content-ink)]">
                <input
                  type="radio"
                  name="plan-mode"
                  checked={mode === option}
                  onChange={() => setMode(option)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span>
                  <span className="font-medium">{PLAN_MODE_LABEL[option]}</span>
                  <span className="block text-xs text-[var(--content-ink-dim)]">{PLAN_MODE_HINT[option]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="plan-date" className={labelClass}>
            {plan ? "Próxima fecha" : "Primera fecha"}
          </label>
          <input
            id="plan-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            aria-describedby="plan-date-hint"
            className={inputClass}
          />
          <p id="plan-date-hint" className="mt-1 text-xs text-[var(--content-ink-dim)]">
            La orden se genera {leadNumber > 0 ? `${leadNumber} ${leadNumber === 1 ? "día" : "días"} antes` : "el mismo día"}.
            {mode === "fixed" && " En calendario fijo, las siguientes fechas cuentan desde esta."}
          </p>
        </div>

        <label className="block">
          <span className={labelClass}>Lista de verificación (una tarea por línea)</span>
          <textarea
            value={checklist}
            onChange={(event) => setChecklist(event.target.value)}
            rows={4}
            placeholder={"Desmontar y lavar filtros\nRevisar el drenaje\nMedir la temperatura de salida"}
            className={inputClass}
          />
          {plan && <span className="mt-1 block text-xs text-[var(--content-ink-dim)]">Los cambios valen para las próximas órdenes.</span>}
        </label>
      </div>
    </Modal>
  );
}
