import { useId, useState, type ComponentType, type SVGProps } from "react";
import { attachmentUrl } from "../api/tickets";
import { PHOTO_ACCEPT, uploadAssetPhotos } from "../lib/assetPhotos";
import { PlusIcon } from "./icons";
import { Modal } from "./Modal";

/**
 * Quien gestiona agrega, quita o cambia la portada sin abrir el formulario.
 * Cada cambio guarda la lista entera.
 */
export function PhotoGallery({
  name,
  photos,
  max,
  canEdit,
  saving,
  saveError,
  onSave,
  placeholderIcon: PlaceholderIcon,
}: {
  /** Nombre de lo fotografiado, para los textos alternativos y el título. */
  name: string;
  photos: readonly string[];
  max: number;
  canEdit: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: (photoIds: string[]) => void;
  placeholderIcon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputId = useId();
  const room = max - photos.length;
  const error = uploadError ?? saveError;
  const busy = uploading || saving;

  async function add(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, room);

    if (!files.length) return;
    setUploading(true);
    setUploadError(null);

    try {
      onSave([...photos, ...(await uploadAssetPhotos(files))]);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : "No se pudo subir la foto");
    } finally {
      setUploading(false);
    }
  }

  const current = viewing !== null ? photos[viewing] : undefined;

  return (
    <div className="flex w-full flex-col gap-2 md:w-40">
      {photos[0] ? (
        <button onClick={() => setViewing(0)} className="overflow-hidden rounded-xl" aria-label="Ver las fotos en grande">
          <img src={attachmentUrl(photos[0])} alt={`Foto de ${name}`} className="h-28 w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-xl bg-[var(--content-bg)] text-[var(--content-ink-dim)]">
          <PlaceholderIcon className="h-6 w-6" />
          <span className="text-xs">Sin foto</span>
        </div>
      )}
      {(photos.length > 1 || (canEdit && room > 0)) && (
        <div className="flex flex-wrap gap-1.5">
          {photos.slice(1).map((photoId, index) => (
            <button
              key={photoId}
              onClick={() => setViewing(index + 1)}
              aria-label={`Ver la foto ${index + 2}`}
              className="overflow-hidden rounded-md border border-[var(--content-border)]"
            >
              <img src={attachmentUrl(photoId)} alt="" className="h-9 w-9 object-cover" />
            </button>
          ))}
          {canEdit && room > 0 && (
            <label
              htmlFor={inputId}
              className="flex h-9 cursor-pointer items-center gap-1 rounded-md border border-dashed border-[var(--content-border)] px-2 text-[11px] text-[var(--content-ink-dim)] hover:border-accent hover:text-[var(--content-ink)] has-[:focus-visible]:border-accent"
            >
              <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {busy ? "Subiendo…" : "Agregar fotos"}
              <input
                id={inputId}
                type="file"
                multiple
                accept={PHOTO_ACCEPT}
                disabled={busy}
                onChange={(e) => {
                  void add(e.target.files);
                  e.target.value = "";
                }}
                className="sr-only"
              />
            </label>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red">
          {error}
        </p>
      )}

      <Modal
        open={current !== undefined}
        onClose={() => setViewing(null)}
        title={`Fotos de ${name}`}
        wide
        footer={
          canEdit && current ? (
            <>
              {viewing !== 0 && (
                <button
                  onClick={() => {
                    onSave([current, ...photos.filter((other) => other !== current)]);
                    setViewing(0);
                  }}
                  disabled={saving}
                  className="rounded-lg border border-[var(--content-border)] px-3 py-2 text-sm text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:opacity-50"
                >
                  Usar de portada
                </button>
              )}
              <button
                onClick={() => {
                  onSave(photos.filter((other) => other !== current));
                  setViewing(null);
                }}
                disabled={saving}
                className="rounded-lg border border-red/40 px-3 py-2 text-sm font-medium text-red hover:bg-red/10 disabled:opacity-50"
              >
                Quitar foto
              </button>
            </>
          ) : undefined
        }
      >
        {current && viewing !== null && (
          <div className="space-y-3">
            <img
              src={attachmentUrl(current)}
              alt={`Foto ${viewing + 1} de ${name}`}
              className="max-h-[55vh] w-full rounded-xl object-contain"
            />
            {photos.length > 1 && (
              <div className="flex flex-wrap justify-center gap-1.5">
                {photos.map((photoId, index) => (
                  <button
                    key={photoId}
                    onClick={() => setViewing(index)}
                    aria-label={`Foto ${index + 1}`}
                    aria-current={index === viewing}
                    className={`overflow-hidden rounded-md border-2 ${index === viewing ? "border-accent" : "border-transparent opacity-70 hover:opacity-100"}`}
                  >
                    <img src={attachmentUrl(photoId)} alt="" className="h-12 w-12 object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
