import {
  createTicketInput,
  formatTicketNumber,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  PRIORITY_LABEL,
  type Area,
  type AreaSuggestion,
  type Attachment,
  type TicketDetail,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { aiKeys, getAiStatus, suggestArea } from "../api/ai";
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
import { CheckIcon, LightbulbIcon, PaperclipIcon, SparkleIcon, XIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { formatBytes } from "../lib/format";

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { me } = useAuth();

  const [onBehalfOf, setOnBehalfOf] = useState<string>("");
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

  const { data: areas = [] } = useQuery({ queryKey: areaKeys.all, queryFn: listAreas });
  const { data: ai } = useQuery({ queryKey: aiKeys.status, queryFn: getAiStatus, staleTime: 60_000 });
  const aiSuggests = Boolean(ai?.configured && ai.enabled.suggestArea);

  // Con menos de 20 caracteres no hay nada que preguntar. Se decide al pintar,
  // no corrigiendo el estado después: así borrar el texto esconde la sugerencia
  // en el mismo render, sin un parpadeo intermedio.
  const longEnough = `${title} ${description}`.trim().length >= 20;
  const visibleSuggestion = longEnough ? suggestion : null;

  /**
   * IA-1, y solo cuando alguien lo pide. La cuota gratuita de Gemini se agota
   * rápido si cada pausa al teclear cuesta una llamada, así que el modelo no
   * opina hasta que se pulsa el botón (spec §6.3).
   *
   * Lo que devuelve se escribe en los dos desplegables: quien pulsó pidió
   * exactamente eso, y cambiarlos después sigue siendo un clic.
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
      ...(categoryId ? { categoryId } : {}),
      ...(onBehalfOf ? { requesterId: onBehalfOf } : {}),
      attachmentIds: files.map((file) => file.id),
    });

    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        (errors[key] ??= []).push(issue.message);
      }
      setFieldErrors(errors);
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
                  value=""
                  onChange={(event) => setOnBehalfOf(event.target.value)}
                  className="rounded-lg border border-dashed border-[var(--content-border)] bg-transparent px-2 py-1 text-xs text-accent"
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
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Resume el problema en una frase"
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <FieldError messages={fieldErrors["title"]} />
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
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              maxLength={5000}
              placeholder="Cuéntanos qué pasó, cuándo empezó y qué has intentado."
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
            <FieldError messages={fieldErrors["description"]} />
          </div>

          {/* Un solo botón para los dos campos que siguen: es una clasificación,
              no dos preguntas, y así cuesta una sola llamada al modelo. */}
          {aiSuggests && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={classifyWithAi}
                disabled={!longEnough || analyzing}
                title={
                  longEnough
                    ? "La IA propone departamento y categoría a partir de lo que escribiste"
                    : "Escribe primero el título y la descripción"
                }
                className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SparkleIcon className={analyzing ? "animate-pulse" : ""} />
                {analyzing ? "Clasificando…" : "Clasificar con IA"}
              </button>
              <span className="text-xs text-[var(--content-ink-dim)]">
                {longEnough
                  ? "Rellena departamento y categoría; puedes cambiarlos."
                  : "Disponible con al menos 20 caracteres."}
              </span>
            </div>
          )}
          {aiError && <p className="-mt-2 text-xs text-amber">{aiError}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="area"
                className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]"
              >
                Departamento de destino
              </label>
              <select
                id="area"
                value={areaId}
                onChange={(event) => {
                  setAreaId(event.target.value);
                  setCategoryId("");
                }}
                className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
              >
                <option value="">Selecciona un área</option>
                {areas.map((item: Area) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <FieldError messages={fieldErrors["areaId"]} />

              <AnimatePresence>
                {visibleSuggestion && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-2 overflow-hidden rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-[var(--content-ink)]"
                  >
                    <p className="flex items-center gap-1.5 font-medium text-accent">
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
                className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent disabled:opacity-50"
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
            <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-[var(--content-border)] px-4 py-6 text-center text-xs text-[var(--content-ink-dim)] hover:border-accent">
              <PaperclipIcon />
              {upload.isPending
                ? "Subiendo…"
                : `Imágenes o PDF (máx. ${MAX_ATTACHMENTS_PER_MESSAGE}, 10 MB c/u)`}
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                className="hidden"
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

          <div className="flex items-center justify-end gap-2 pt-2">
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
          <p className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wide text-[var(--content-ink)]">
            <SparkleIcon className="text-accent" /> Antes de enviar
          </p>
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
    </div>
  );
}

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <p className="mt-1.5 text-xs text-red">{messages[0]}</p>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--content-ink-dim)]">{label}</span>
      <span className="text-right font-medium text-[var(--content-ink)]">{value}</span>
    </div>
  );
}
