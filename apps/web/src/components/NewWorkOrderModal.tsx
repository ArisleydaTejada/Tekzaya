import {
  formatAssetNumber,
  WORK_ORDER_TYPE_LABEL,
  WORK_ORDER_TYPES,
  type AssetDetail,
  type WorkOrderDetail,
  type WorkOrderType,
} from "@tekzaya/shared";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { createWorkOrder } from "../api/workOrders";
import { useOnOpen } from "../lib/useOnOpen";
import { Modal } from "./Modal";

const inputClass =
  "w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent";
const labelClass = "mb-1 block text-xs font-medium text-[var(--content-ink-dim)]";

/**
 * Una OT que no nace de un ticket (plan A3): la avería que encuentra el propio
 * técnico, o un preventivo puntual. Igual que al convertir un ticket, "¿queda
 * fuera de servicio?" no trae respuesta marcada: decide el tiempo de parada.
 */
export function NewWorkOrderModal({
  open,
  asset,
  onClose,
  onCreated,
}: {
  open: boolean;
  asset: AssetDetail;
  onClose: () => void;
  onCreated: (order: WorkOrderDetail) => void;
}) {
  const [type, setType] = useState<WorkOrderType>("corrective");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [outOfService, setOutOfService] = useState<boolean | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [checklist, setChecklist] = useState("");

  useOnOpen(open, () => {
    setType("corrective");
    setTitle("");
    setDescription("");
    setOutOfService(null);
    setScheduledFor("");
    setChecklist("");
  });

  const create = useMutation({
    mutationFn: () =>
      createWorkOrder({
        assetId: asset.id,
        type,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        outOfService: outOfService!,
        ...(type === "preventive" && scheduledFor ? { scheduledFor } : {}),
        checklist: checklist
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    onSuccess: onCreated,
  });

  const valid = title.trim().length >= 5 && outOfService !== null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Nueva orden para ${formatAssetNumber(asset.number)}`}
      wide
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
            Cancelar
          </button>
          <button
            onClick={() => create.mutate()}
            disabled={!valid || create.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {create.isPending ? "Abriendo…" : "Abrir orden"}
          </button>
        </>
      }
    >
      {create.error && (
        <p role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {create.error.message}
        </p>
      )}
      <div className="space-y-3">
        <fieldset>
          <legend className={labelClass}>Tipo</legend>
          <div className="flex gap-4">
            {WORK_ORDER_TYPES.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-[var(--content-ink)]">
                <input type="radio" name="work-order-type" checked={type === option} onChange={() => setType(option)} className="h-4 w-4 accent-[var(--accent)]" />
                {WORK_ORDER_TYPE_LABEL[option]}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-[var(--content-ink-dim)]">
            {type === "corrective"
              ? "Una avería: queda como falla en la historia del equipo."
              : "Mantenimiento programado: no cuenta como falla."}
          </p>
        </fieldset>
        <label className="block">
          <span className={labelClass}>Título</span>
          <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Descripción (opcional)</span>
          <textarea value={description} rows={3} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
        </label>
        {type === "preventive" && (
          <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
            <label className="block">
              <span className={labelClass}>Fecha programada</span>
              <input type="date" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Lista de verificación (una tarea por línea)</span>
              <textarea value={checklist} rows={3} onChange={(event) => setChecklist(event.target.value)} className={inputClass} />
            </label>
          </div>
        )}
        <fieldset>
          <legend className={labelClass}>¿El equipo queda fuera de servicio?</legend>
          <div className="flex gap-4">
            {[
              { value: true, label: "Sí, deja de usarse" },
              { value: false, label: "No, sigue funcionando" },
            ].map((option) => (
              <label key={String(option.value)} className="flex items-center gap-2 text-sm text-[var(--content-ink)]">
                <input
                  type="radio"
                  name="out-of-service"
                  checked={outOfService === option.value}
                  onChange={() => setOutOfService(option.value)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
