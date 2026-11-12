import {
  ASSET_TYPE_PLURAL_LABEL,
  createTicketInput,
  detectAssetType,
  formatAssetNumber,
  formatTicketNumber,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  PRIORITY_LABEL,
  mentionedAssetNumber,
  type Area,
  type AreaSuggestion,
  type AssetPickerItem,
  type Attachment,
  type TicketDetail,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { aiKeys, getAiStatus, suggestArea } from "../api/ai";
import { assetKeys, getAsset, listAssetLinkOptions } from "../api/assets";
import { ApiRequestError } from "../api/client";
import {
  areaKeys,
  createTicket,
  listAreaMembers,
  listAreas,
  ticketKeys,
  uploadAttachment,
} from "../api/tickets";
import { useAuth } from "../auth/AuthContext";
import { AssetPicker, type PickedAsset } from "../components/AssetPicker";
import { AssetStatusBadge } from "../components/assets";
import { ActionButton } from "../components/ActionButton";
import { CheckIcon, LightbulbIcon, PaperclipIcon, SparkleIcon, WrenchIcon, XIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { formatBytes } from "../lib/format";

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useAuth();

  const [onBehalfOf, setOnBehalfOf] = useState<string>("");
  const [proxyOpen, setProxyOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [areaId, setAreaId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [suggestion, setSuggestion] = useState<AreaSuggestion | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [created, setCreated] = useState<TicketDetail | null>(null);
  const [asset, setAsset] = useState<PickedAsset | null>(null);
  const [pickingAsset, setPickingAsset] = useState(false);
  /** El equipo salió de lo escrito, no de un clic: si el texto cambia, cambia con él. */
  const [assetFromText, setAssetFromText] = useState(false);
  /** Elegido o quitado a mano: desde ahí el texto ya no lo toca. */
  const [assetTouched, setAssetTouched] = useState(false);

  /*
   * `?activo=ACT-0012` llega desde la ficha del equipo y lo preelige, con su área si no hay otra.
   * Se aplica una sola vez para que quitarlo a mano no lo vuelva a poner.
   */
  const [searchParams] = useSearchParams();
  const fromAsset = searchParams.get("activo") ?? "";

  const { data: presetAsset } = useQuery({
    queryKey: assetKeys.detail(fromAsset),
    queryFn: () => getAsset(fromAsset),
    enabled: Boolean(fromAsset),
    retry: false,
  });

  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);

  if (presetAsset && presetAsset.status !== "retired" && appliedPreset !== presetAsset.id) {
    setAppliedPreset(presetAsset.id);
    pickAsset(presetAsset);
  }

  /** Elegir el equipo rellena el área si está vacía; si no, solo la sugiere abajo. */
  function pickAsset(picked: PickedAsset, fromText = false) {
    setAsset(picked);
    setAssetFromText(fromText);

    if (!fromText) setAssetTouched(true);

    if (!areaId) {
      setAreaId(picked.area.id);
      setCategoryId("");
    }
  }

  /*
   * Equipo deducido del texto, sin IA: "ACT-0012" lo nombra y "la impresora" busca entre los vinculables.
   * Si uno solo es suyo o de su área, se elige solo; si hay varios, se ofrecen.
   */
  const mentionedNumber = mentionedAssetNumber(`${title} ${description}`);
  const mentionedType = detectAssetType(title, description);

  const mentionQuery = mentionedNumber
    ? { q: formatAssetNumber(mentionedNumber) }
    : mentionedType
      ? { type: mentionedType }
      : null;

  const mentionKey = mentionQuery && { ...mentionQuery, requesterId: onBehalfOf || undefined };

  const { data: mentioned, status: mentionStatus } = useQuery({
    queryKey: assetKeys.linkOptions(mentionKey ?? {}),
    queryFn: () => listAssetLinkOptions(mentionKey ?? {}),
    enabled: mentionKey !== null,
    staleTime: 60_000,
  });

  const { pick: textPick, candidates } = mentionKey && mentioned ? chooseMentioned(mentioned.items) : NO_MENTION;

  if (!assetTouched && (mentionKey === null || mentionStatus !== "pending")) {
    if (textPick && textPick.id !== asset?.id) pickAsset(textPick, true);
    else if (!textPick && asset && assetFromText) {
      setAsset(null);
      setAssetFromText(false);
    }
  }

  const { data: areas = [] } = useQuery({ queryKey: areaKeys.all, queryFn: listAreas });
  const { data: ai } = useQuery({ queryKey: aiKeys.status, queryFn: getAiStatus, staleTime: 60_000 });
  const aiSuggests = Boolean(ai?.configured && ai.enabled.suggestArea);

  // Con menos de 20 caracteres no se sugiere nada. Se decide al pintar y no corrigiendo el estado,
  // para que borrar el texto la esconda en el mismo render.
  const longEnough = `${title} ${description}`.trim().length >= 20;
  const visibleSuggestion = longEnough ? suggestion : null;

  /**
   * IA-1 solo a petición: la cuota gratuita de Gemini no aguanta una llamada por pausa al teclear
   * (spec §6.3). El resultado se escribe en los dos desplegables.
   */
  function classifyWithAi() {
    setAiError(null);
    setAnalyzing(true);
    void suggestArea({ title, description })
      .then((result) => {
        setSuggestion(result);

        if (!result) {
          setAiError("La IA no pudo decidir con este texto. Elige el área a mano.");

          return;
        }

        setAreaId(result.areaId);
        setCategoryId(result.categoryId ?? "");
      })
      .catch((cause: unknown) => {
        setSuggestion(null);
        setAiError(cause instanceof Error ? cause.message : "No se pudo consultar a la IA");
      })
      .finally(() => setAnalyzing(false));
  }

  const { data: colleagues = [] } = useQuery({
    queryKey: areaKeys.members(me?.areaId ?? ""),
    queryFn: () => listAreaMembers(me!.areaId),
    enabled: Boolean(me?.areaId),
  });

  const area = areas.find((item: Area) => item.id === areaId);

  const upload = useMutation({
    mutationFn: uploadAttachment,
    onSuccess: (attachment) => {
      setFileError(null);
      setFiles((current) => [...current, attachment]);
    },
    onError: (error) => {
      setFileError(error instanceof Error ? error.message : "No se pudo subir el archivo");
    },
  });

  const submit = useMutation({
    mutationFn: createTicket,
    onSuccess: async (ticket) => {
      await queryClient.invalidateQueries({ queryKey: ticketKeys.all });
      setCreated(ticket);
    },
    onError: (error) => {
      // Los errores por campo vienen del mismo esquema Zod que valida el formulario.
      if (error instanceof ApiRequestError && error.code === "validation_error") return;
    },
  });

  function addFiles(list: FileList | null) {
    setFileError(null);
    let room = MAX_ATTACHMENTS_PER_MESSAGE - files.length;

    for (const file of Array.from(list ?? [])) {
      if (room <= 0) {
        setFileError(`Máximo ${MAX_ATTACHMENTS_PER_MESSAGE} archivos`);
        break;
      }

      if (file.size > MAX_ATTACHMENT_BYTES) {
        setFileError(`«${file.name}» supera los 10 MB`);
        continue;
      }

      room -= 1;
      upload.mutate(file);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldErrors({});

    const parsed = createTicketInput.safeParse({
      title,
      description,
      areaId,
      categoryId: categoryId || undefined,
      requesterId: onBehalfOf || undefined,
      assetId: asset ? asset.id : undefined,
      attachmentIds: files.map((file) => file.id),
    });

    if (!parsed.success) {
      const errors: Record<string, string[]> = {};

      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (errors[key] ??= []).push(issue.message);
      }

      setFieldErrors(errors);
      // El foco salta al primer campo con error: con el teclado o un lector de
      // pantalla, el aviso en rojo más abajo pasaría desapercibido.
      const first = FIELD_ORDER.find((key) => errors[key]);

      if (first) document.getElementById(FIELD_IDS[first])?.focus();

      return;
    }

    submit.mutate(parsed.data);
  }

  if (created) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green/15 text-green">
          <CheckIcon className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-[var(--content-ink)]">
          ¡Ticket creado!
        </h1>
        <Plate className="mt-5 space-y-2.5 p-5 text-left text-sm">
          <Row
            label="Número de ticket"
            value={
              <span className="font-display tabular text-[var(--content-ink)]">
                {formatTicketNumber(created.number)}
              </span>
            }
          />
          <Row label="Área" value={created.area.name} />
          {created.categoryName && <Row label="Categoría" value={created.categoryName} />}
          {created.asset && (
            <Row
              label="Equipo"
              value={`${formatAssetNumber(created.asset.number)} · ${created.asset.name}`}
            />
          )}
          <Row label="Prioridad" value={PRIORITY_LABEL[created.priority]} />
          <Row
            label="Primera respuesta antes de"
            value={new Date(created.sla.responseDueAt).toLocaleString("es-MX", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
        </Plate>
        <p className="mt-4 text-xs text-[var(--content-ink-dim)]">
          El área destino ya puede verlo en su bandeja.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => {
              setCreated(null);
              setTitle("");
              setDescription("");
              setAreaId("");
              setCategoryId("");
              setOnBehalfOf("");
              setSuggestion(null);
              setAiError(null);
              setFiles([]);
              setAsset(null);
              setAssetFromText(false);
              setAssetTouched(false);
            }}
            className="rounded-lg border border-[var(--content-border)] px-4 py-2 text-sm font-medium text-[var(--content-ink)] hover:bg-[var(--content-surface)]"
          >
            Crear otro
          </button>
          <button
            onClick={() => navigate(`/tickets/${formatTicketNumber(created.number)}`)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
          >
            Ir al ticket
          </button>
        </div>
      </div>
    );
  }

  const submitError =
    submit.error instanceof ApiRequestError ? submit.error.message : submit.error?.message;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Nuevo ticket"
        subtitle="Describe el problema y elige el área. La prioridad la ajusta el equipo al recibirlo."
      />
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Plate className="space-y-5 p-5">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="titulo" className="text-xs font-medium text-[var(--content-ink-dim)]">
                Título / asunto
              </label>
              <span className="text-xs tabular text-[var(--content-ink-dim)]">
                {title.length}/120
              </span>
            </div>
            <input
              id="titulo"
              aria-invalid={Boolean(fieldErrors["title"])}
              aria-describedby={fieldErrors["title"] ? "titulo-error" : undefined}
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Resume el problema en una frase"
              className="w-full rounded-lg border border-[var(--field-border)] aria-[invalid=true]:border-red bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <FieldError id="titulo-error" messages={fieldErrors["title"]} />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="descripcion"
                className="text-xs font-medium text-[var(--content-ink-dim)]"
              >
                Descripción
              </label>
            </div>
            <textarea
              id="descripcion"
              aria-invalid={Boolean(fieldErrors["description"])}
              aria-describedby={fieldErrors["description"] ? "descripcion-error" : undefined}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Cuéntanos qué pasó, cuándo empezó y qué has intentado."
              className="w-full rounded-lg border border-[var(--field-border)] aria-[invalid=true]:border-red bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <FieldError id="descripcion-error" messages={fieldErrors["description"]} />
          </div>

          {/* Plan A2: un enlace, no un campo. Quien no lo necesita sigue viendo un
              formulario de cuatro campos (regla de simplicidad del spec). */}
          {asset ? (
            <div>
              <span className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
                Equipo afectado
              </span>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm">
                <WrenchIcon className="h-3.5 w-3.5 shrink-0 text-[var(--content-ink-dim)]" />
                <span className="min-w-0 flex-1 truncate text-[var(--content-ink)]">
                  <span className="font-display tabular text-[var(--content-ink-dim)]">
                    {formatAssetNumber(asset.number)}
                  </span>{" "}
                  {asset.name}
                </span>
                <AssetStatusBadge status={asset.status} />
                <ActionButton onClick={() => setPickingAsset(true)}>Cambiar</ActionButton>
                <button
                  type="button"
                  onClick={() => {
                    setAsset(null);
                    setAssetTouched(true);
                  }}
                  className="text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                  aria-label="Quitar equipo"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              {assetFromText && (
                <p className="mt-1.5 text-xs text-[var(--content-ink-dim)]">
                  Elegido por lo que escribiste. Si no es este, cámbialo o quítalo.
                </p>
              )}
              {/* La impresora de Ventas la mantiene TI: el ticket debe ir allí. */}
              {areaId && areaId !== asset.area.id && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-amber">
                  Este equipo lo mantiene {asset.area.name}.
                  <button
                    type="button"
                    onClick={() => {
                      setAreaId(asset.area.id);
                      setCategoryId("");
                    }}
                    className="font-medium text-accent-ink underline"
                  >
                    Enviar el ticket a {asset.area.name}
                  </button>
                </p>
              )}
            </div>
          ) : candidates.length > 1 && mentionedType ? (
            <div className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2.5">
              <p className="text-xs text-[var(--content-ink)]">
                Hay {candidates.length} {ASSET_TYPE_PLURAL_LABEL[mentionedType]} que puedes vincular. ¿Cuál es?
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {candidates.slice(0, CANDIDATES_SHOWN).map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => pickAsset(candidate)}
                    className="flex min-w-0 max-w-full flex-col rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5 text-left text-xs hover:border-accent"
                  >
                    <span className="truncate font-medium text-[var(--content-ink)]">{candidate.name}</span>
                    <span className="truncate text-[var(--content-ink-dim)]">
                      <span className="font-display tabular">{formatAssetNumber(candidate.number)}</span> · {candidate.location}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPickingAsset(true)}
                className="mt-2 text-xs font-medium text-accent-ink hover:underline"
              >
                {candidates.length > CANDIDATES_SHOWN
                  ? `Ver las ${candidates.length} ${ASSET_TYPE_PLURAL_LABEL[mentionedType]}`
                  : "Es otro equipo"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickingAsset(true)}
              className="-mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--content-border)] px-2 py-1 text-xs text-accent-ink hover:border-accent"
            >
              <WrenchIcon className="h-3.5 w-3.5" /> Vincular un equipo
            </button>
          )}

          {/* Un solo botón para los dos campos que siguen: es una clasificación,
              no dos preguntas, y así cuesta una sola llamada al modelo. Mientras falta
              texto, el medidor dice cuánto: la IA está a la vista desde el principio,
              no como un botón apagado. */}
          {aiSuggests && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2.5">
              <AiReadiness progress={Math.min(1, `${title} ${description}`.trim().length / 20)} analyzing={analyzing} />
              <p className="min-w-0 flex-1 text-xs leading-snug text-[var(--content-ink)]">
                {analyzing
                  ? "La IA está leyendo tu solicitud…"
                  : longEnough
                    ? "La IA puede elegir el área y la categoría por ti; luego puedes cambiarlas."
                    : "Cuenta un poco más del problema y la IA podrá elegir el área por ti."}
              </p>
              {longEnough && (
                <button
                  type="button"
                  onClick={classifyWithAi}
                  disabled={analyzing}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-accent-dim disabled:opacity-60"
                >
                  <SparkleIcon className={analyzing ? "animate-pulse" : ""} />
                  {analyzing ? "Clasificando…" : "Clasificar con IA"}
                </button>
              )}
            </div>
          )}
          {aiError && <p className="-mt-2 text-xs text-amber">{aiError}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="area"
                className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]"
              >
                Área de destino
              </label>
              <select
                id="area"
              aria-invalid={Boolean(fieldErrors["areaId"])}
              aria-describedby={fieldErrors["areaId"] ? "area-error" : undefined}
                value={areaId}
                onChange={(event) => {
                  setAreaId(event.target.value);
                  setCategoryId("");
                }}
                className="w-full rounded-lg border border-[var(--field-border)] bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent aria-[invalid=true]:border-red"
              >
                <option value="">Selecciona un área</option>
                {areas.map((item: Area) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <FieldError id="area-error" messages={fieldErrors["areaId"]} />

              <AnimatePresence>
                {visibleSuggestion && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 overflow-hidden rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-[var(--content-ink)]"
                  >
                    <p className="flex items-center gap-1.5 font-medium text-accent-ink">
                      <SparkleIcon /> Sugerido por IA: {visibleSuggestion.areaName}
                      {visibleSuggestion.categoryName
                        ? ` · ${visibleSuggestion.categoryName}`
                        : ""}{" "}
                      · {Math.round(visibleSuggestion.confidence * 100)}% de confianza
                    </p>
                    <p className="mt-0.5 text-[var(--content-ink-dim)]">
                      {visibleSuggestion.rationale ?? "Puedes cambiarlo si no es correcto."}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div>
              <label
                htmlFor="categoria"
                className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]"
              >
                Categoría <span className="font-normal">(opcional)</span>
              </label>
              <select
                id="categoria"
                value={categoryId}
                disabled={!area}
                onChange={(event) => setCategoryId(event.target.value)}
                className="w-full rounded-lg border border-[var(--field-border)] bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent disabled:opacity-50"
              >
                <option value="">Que la elija el área</option>
                {area?.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
              Adjuntos
            </label>
            {/* `sr-only` en el campo, no `hidden`: así se llega con Tab y el
                recuadro entero se ilumina con el foco. */}
            <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-[var(--content-border)] px-4 py-6 text-center text-xs text-[var(--content-ink-dim)] hover:border-accent focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
              <PaperclipIcon />
              {upload.isPending
                ? "Subiendo…"
                : `Imágenes o PDF (máx. ${MAX_ATTACHMENTS_PER_MESSAGE}, 10 MB c/u)`}
              <input
                type="file"
                multiple
                aria-label="Adjuntos"
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
            {fileError && <p className="mt-1.5 text-xs text-red">{fileError}</p>}
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between rounded-md bg-[var(--content-bg)] px-2.5 py-1.5 text-xs text-[var(--content-ink)]"
                  >
                    <span className="truncate">
                      {file.fileName}{" "}
                      <span className="text-[var(--content-ink-dim)]">
                        {formatBytes(file.sizeBytes)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((current) => current.filter((item) => item.id !== file.id))
                      }
                      className="text-[var(--content-ink-dim)] hover:text-red"
                      aria-label={`Quitar ${file.fileName}`}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <AnimatePresence>
            {submitError && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                role="alert"
                className="overflow-hidden rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red"
              >
                {submitError}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Crear en nombre de otra persona es el caso raro: se abre desde el enlace de abajo
              y no ocupa la cabecera de un formulario que casi siempre es para uno mismo. */}
          {(proxyOpen || onBehalfOf) && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
              Solicitante
            </label>
            {onBehalfOf ? (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm">
                <span className="text-[var(--content-ink)]">
                  {colleagues.find((person) => person.id === onBehalfOf)?.name}
                </span>
                <button
                  type="button"
                  onClick={() => setOnBehalfOf("")}
                  className="ml-auto text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                  aria-label="Quitar solicitante"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--content-ink)]">Yo</span>
                {/* Solo compañeros del propio área: es lo que el servidor acepta. */}
                <select
                  aria-label="Crear en nombre de un compañero"
                  autoFocus
                  value=""
                  onChange={(event) => setOnBehalfOf(event.target.value)}
                  className="rounded-lg border border-dashed border-[var(--field-border)] bg-transparent px-2 py-1 text-xs text-accent-ink"
                >
                  <option value="">Crear en nombre de un compañero…</option>
                  {colleagues
                    .filter((person) => person.id !== me?.id)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {!proxyOpen && !onBehalfOf && colleagues.length > 1 && (
              <button
                type="button"
                onClick={() => setProxyOpen(true)}
                className="mr-auto text-xs font-medium text-accent-ink hover:underline"
              >
                ¿Es para un compañero?
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submit.isPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim disabled:opacity-60"
            >
              {submit.isPending ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </Plate>

        <Plate className="h-fit space-y-3 p-5 text-sm text-[var(--content-ink-dim)]">
          <h2 className="font-display text-sm font-semibold text-[var(--content-ink)]">Antes de enviar</h2>
          <p className="flex items-start gap-1.5">
            <LightbulbIcon className="mt-0.5 shrink-0 text-[var(--content-ink-dim)]" />
            Adjuntar capturas de pantalla con el código de error acelera la resolución.
          </p>
          <p>
            El plazo de primera respuesta se calcula al enviar, en horario laboral y según la
            prioridad que reciba el ticket.
          </p>
        </Plate>
      </form>

      <AssetPicker
        open={pickingAsset}
        onClose={() => setPickingAsset(false)}
        onPick={(picked) => pickAsset(picked)}
        {...(asset ? { selectedId: asset.id } : {})}
        {...(onBehalfOf ? { requesterId: onBehalfOf } : {})}
        {...(mentionedType ? { type: mentionedType } : {})}
      />
    </div>
  );
}

const CANDIDATES_SHOWN = 4;

/** El equipo que se deduce del texto, o los candidatos entre los que escoger. */
interface MentionChoice {
  pick: PickedAsset | null;
  candidates: PickedAsset[];
}

const NO_MENTION: MentionChoice = { pick: null, candidates: [] };

/**
 * Se elige solo el único equipo a cargo de quien reporta o, si no, el único de su área.
 * Si hay varios en el primer grupo con alguno, se ofrecen para escoger.
 */
function chooseMentioned(items: readonly AssetPickerItem[]): MentionChoice {
  for (const group of ["custodian", "area", "other"] as const) {
    const inGroup = items.flatMap(({ group: itemGroup, ...asset }) => (itemGroup === group ? [asset] : []));

    if (inGroup.length === 1) return { pick: inGroup[0]!, candidates: [] };

    if (inGroup.length > 1) return { pick: null, candidates: inGroup };
  }

  return NO_MENTION;
}

/** Medidor de instrumento en miniatura: cuánto texto falta para que la IA pueda clasificar. */
function AiReadiness({ progress, analyzing }: { progress: number; analyzing: boolean }) {
  const r = 9;
  const length = 2 * Math.PI * r;

  return (
    // La chispa en el centro dice "IA": un anillo vacío solo, parecía un botón de opción.
    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center" aria-hidden="true">
      <SparkleIcon className="absolute h-3 w-3 text-accent-ink" />
    <svg viewBox="0 0 24 24" className="h-7 w-7 -rotate-90">
      <circle cx="12" cy="12" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-accent/20" />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - progress)}
        className={`text-accent-ink transition-[stroke-dashoffset] duration-300 ease-out ${analyzing ? "animate-pulse" : ""}`}
      />
    </svg>
    </span>
  );
}

const FIELD_ORDER = ["title", "description", "areaId"] as const;

const FIELD_IDS: Record<(typeof FIELD_ORDER)[number], string> = {
  title: "titulo",
  description: "descripcion",
  areaId: "area",
};

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;

  return (
    <p id={id} className="mt-1.5 text-xs text-red">
      {messages[0]}
    </p>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--content-ink-dim)]">{label}</span>
      <span className="text-right font-medium text-[var(--content-ink)]">{value}</span>
    </div>
  );
}
