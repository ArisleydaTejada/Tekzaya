import {
  ASSET_TYPE_LABEL,
  ASSET_TYPES,
  amountInputFromCents,
  canManageAsset,
  centsFromAmountInput,
  type AssetDetail,
  type AssetType,
  type CreateAssetInput,
  type UpdateAssetInput,
} from "@tekzaya/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useId, useState, type ReactNode } from "react";
import {
  assetKeys,
  createAsset,
  listAssetLocations,
  listAssetPeople,
  updateAsset,
} from "../api/assets";
import { areaKeys, attachmentUrl, listAreas, uploadAttachment } from "../api/tickets";
import { useAuth } from "../auth/AuthContext";
import { Modal } from "./Modal";
import { MoneyInput } from "./MoneyInput";

/** Lo que se edita, todo como texto: así un campo vacío es "" y no `undefined`. */
interface Draft {
  name: string;
  type: AssetType;
  brand: string;
  model: string;
  serial: string;
  areaId: string;
  usedByAreaId: string;
  custodianId: string;
  location: string;
  purchaseDate: string;
  purchaseCost: string;
  warrantyUntil: string;
  photoId: string;
}

function draftOf(asset: AssetDetail | null, defaultAreaId: string): Draft {
  return {
    name: asset?.name ?? "",
    type: asset?.type ?? "laptop",
    brand: asset?.brand ?? "",
    model: asset?.model ?? "",
    serial: asset?.serial ?? "",
    areaId: asset?.areaId ?? defaultAreaId,
    usedByAreaId: asset?.usedByAreaId ?? "",
    custodianId: asset?.custodianId ?? "",
    location: asset?.location ?? "",
    purchaseDate: asset?.purchaseDate ?? "",
    purchaseCost: asset?.purchaseCost != null ? amountInputFromCents(asset.purchaseCost) : "",
    warrantyUntil: asset?.warrantyUntil ?? "",
    photoId: asset?.photoId ?? "",
  };
}

const OPTIONAL_TEXT = ["brand", "model", "serial", "usedByAreaId", "custodianId", "purchaseDate", "warrantyUntil", "photoId"] as const;

/**
 * Alta y edición del activo. Al editar solo viaja lo que cambió, y un campo
 * opcional que se vacía viaja como `null` para que el servidor lo quite: cambiar
 * la ubicación es lo que deja el paso "movido" en la línea de tiempo.
 */
export function AssetFormModal({
  open,
  asset,
  currency,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Moneda configurada por el administrador; los montos se guardan en ella. */
  currency: string;
  /** `null` para dar de alta uno nuevo. */
  asset: AssetDetail | null;
  onClose: () => void;
  onSaved: (asset: AssetDetail) => void;
}) {
  const { me } = useAuth();
  const [draft, setDraft] = useState<Draft>(() => draftOf(asset, me?.areaId ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Cada apertura parte de los datos actuales; patrón de React para ajustar
  // estado cuando cambia una prop, sin efecto de por medio.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(draftOf(asset, me?.areaId ?? ""));
      setError(null);
    }
  }

  const { data: areas = [] } = useQuery({ queryKey: areaKeys.all, queryFn: listAreas, enabled: open });
  const { data: locations = [] } = useQuery({
    queryKey: assetKeys.locations(),
    queryFn: listAssetLocations,
    enabled: open,
  });
  // La persona a cargo sale del área que usa el equipo; sin ella, de toda la empresa.
  const peopleArea = draft.usedByAreaId || "";
  const { data: people = [] } = useQuery({
    queryKey: assetKeys.people(peopleArea),
    queryFn: () => listAssetPeople(peopleArea),
    enabled: open,
  });

  // Solo las áreas que quien edita puede gestionar; el servidor lo vuelve a mirar.
  const manageable = areas.filter((area) => me && canManageAsset(me, { areaId: area.id }));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      let cost: number | null = null;
      if (draft.purchaseCost.trim()) {
        try {
          cost = centsFromAmountInput(draft.purchaseCost);
        } catch {
          throw new Error("Revisa el costo de compra: escríbelo como 1,234.50");
        }
      }

      if (!asset) {
        const input: CreateAssetInput = {
          name: draft.name.trim(),
          type: draft.type,
          areaId: draft.areaId,
          location: draft.location.trim(),
          ...(cost !== null ? { purchaseCost: cost } : {}),
        };
        for (const key of OPTIONAL_TEXT) {
          const value = draft[key].trim();
          if (value) input[key] = value;
        }
        return createAsset(input);
      }

      const before = draftOf(asset, asset.areaId);
      const input: UpdateAssetInput = {};
      if (draft.name.trim() !== before.name) input.name = draft.name.trim();
      if (draft.type !== before.type) input.type = draft.type;
      if (draft.areaId !== before.areaId) input.areaId = draft.areaId;
      if (draft.location.trim() !== before.location) input.location = draft.location.trim();
      if (draft.purchaseCost.trim() !== before.purchaseCost) input.purchaseCost = cost;
      for (const key of OPTIONAL_TEXT) {
        const value = draft[key].trim();
        if (value !== before[key]) input[key] = value || null;
      }
      return updateAsset(asset.id, input);
    },
    onSuccess: onSaved,
    onError: (cause) => setError(cause.message),
  });

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const stored = await uploadAttachment(file);
      if (!stored.mimeType.startsWith("image/")) throw new Error("La foto tiene que ser una imagen");
      set("photoId", stored.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo subir la foto");
    } finally {
      setUploading(false);
    }
  }

  const valid = draft.name.trim().length > 0 && draft.location.trim().length > 0 && draft.areaId !== "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asset ? `Editar ${asset.name}` : "Nuevo activo"}
      wide
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => save.mutate()}
            disabled={!valid || save.isPending || uploading}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {save.isPending ? "Guardando…" : asset ? "Guardar cambios" : "Dar de alta"}
          </button>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Labeled label="Nombre" className="sm:col-span-2">
          {(id) => (
            <input id={id} value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Laptop de Diego, Impresora de Ventas…" className={INPUT} />
          )}
        </Labeled>
        <Labeled label="Tipo">
          {(id) => (
            <select id={id} value={draft.type} onChange={(e) => set("type", e.target.value as AssetType)} className={INPUT}>
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ASSET_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          )}
        </Labeled>
        <Labeled label="Área responsable" hint="La que lo mantiene">
          {(id) => (
            <select id={id} value={draft.areaId} onChange={(e) => set("areaId", e.target.value)} className={INPUT}>
              {!manageable.some((area) => area.id === draft.areaId) && <option value="">Elige un área</option>}
              {manageable.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          )}
        </Labeled>
        <Labeled label="Marca">
          {(id) => <input id={id} value={draft.brand} onChange={(e) => set("brand", e.target.value)} className={INPUT} />}
        </Labeled>
        <Labeled label="Modelo">
          {(id) => <input id={id} value={draft.model} onChange={(e) => set("model", e.target.value)} className={INPUT} />}
        </Labeled>
        <Labeled label="Número de serie">
          {(id) => <input id={id} value={draft.serial} onChange={(e) => set("serial", e.target.value)} className={INPUT} />}
        </Labeled>
        <Labeled label="Ubicación">
          {(id) => (
            <>
              <input id={id} list={`${id}-places`} value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="Piso 1 · Ventas" className={INPUT} />
              <datalist id={`${id}-places`}>
                {locations.map((place) => (
                  <option key={place} value={place} />
                ))}
              </datalist>
            </>
          )}
        </Labeled>
        <Labeled label="Área que lo usa" hint="Si no es la responsable">
          {(id) => (
            <select
              id={id}
              value={draft.usedByAreaId}
              onChange={(e) => setDraft((current) => ({ ...current, usedByAreaId: e.target.value, custodianId: "" }))}
              className={INPUT}
            >
              <option value="">La misma área responsable</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          )}
        </Labeled>
        <Labeled label="Persona a cargo">
          {(id) => (
            <select id={id} value={draft.custodianId} onChange={(e) => set("custodianId", e.target.value)} className={INPUT}>
              <option value="">Nadie en concreto</option>
              {/* Al editar, quien ya lo tenía sigue en la lista aunque sea de otra área. */}
              {asset?.custodian && !people.some((person) => person.id === asset.custodian!.id) && (
                <option value={asset.custodian.id}>{asset.custodian.name}</option>
              )}
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
        </Labeled>
        <Labeled label="Fecha de compra">
          {(id) => <input id={id} type="date" value={draft.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} className={INPUT} />}
        </Labeled>
        <Labeled label="Costo de compra" hint="Opcional">
          {(id) => (
            <MoneyInput
              id={id}
              value={draft.purchaseCost}
              onChange={(value) => set("purchaseCost", value)}
              currency={currency}
              placeholder="1,129.00"
            />
          )}
        </Labeled>
        <Labeled label="Garantía hasta">
          {(id) => <input id={id} type="date" value={draft.warrantyUntil} onChange={(e) => set("warrantyUntil", e.target.value)} className={INPUT} />}
        </Labeled>
        <Labeled label="Foto" hint="Opcional">
          {(id) => (
            <div className="flex items-center gap-3">
              {draft.photoId && (
                <img src={attachmentUrl(draft.photoId)} alt="" className="h-10 w-10 rounded-lg border border-[var(--content-border)] object-cover" />
              )}
              <input
                id={id}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
                className="min-w-0 flex-1 text-xs text-[var(--content-ink-dim)] file:mr-2 file:rounded-md file:border-0 file:bg-[var(--content-bg)] file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-[var(--content-ink)]"
              />
              {uploading && <span className="text-xs text-[var(--content-ink-dim)]">Subiendo…</span>}
            </div>
          )}
        </Labeled>
      </div>
    </Modal>
  );
}

const INPUT =
  "w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent";

function Labeled({
  label,
  hint,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium text-[var(--content-ink-dim)]">
        {label}
        {hint && <span className="font-normal opacity-70">· {hint}</span>}
      </label>
      {children(id)}
    </div>
  );
}
