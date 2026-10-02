import {
  ALLOWED_ATTACHMENT_MIME,
  formatTicketNumber,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  TICKET_STATUS_LABEL,
  type Area,
  type Attachment,
  type MessageView,
  type TicketDetail,
  type TicketStatus,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  aiKeys,
  autocomplete,
  dismissIncident,
  getAiStatus,
  getSummary,
  regenerateSummary,
} from "../api/ai";
import {
  areaKeys,
  attachmentUrl,
  createMessage,
  getTicketByNumber,
  listAreaWorkload,
  listAreas,
  listDuplicateCandidates,
  listMessages,
  mergeTickets,
  requestJoin,
  setAssignees,
  takeTicket,
  ticketKeys,
  transferTicket,
  unmergeTicket,
  updateTicket,
  uploadAttachment,
} from "../api/tickets";
import { answerCsat } from "../api/stats";
import { useWatchTicket } from "../realtime/RealtimeContext";
import { Avatar, AvatarStack } from "../components/Avatar";
import { AreaTag, PriorityBadge, SlaTag, StatusBadge } from "../components/badges";
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  LockIcon,
  MergeIcon,
  PaperclipIcon,
  SparkleIcon,
  StarIcon,
  XIcon,
} from "../components/icons";
import { Modal } from "../components/Modal";
import { Plate } from "../components/Plate";
import { formatBytes, formatDateTime, formatDeadline, formatWhen } from "../lib/format";

/** Estados a los que se puede saltar desde el desplegable; el servidor valida el resto. */
const STATUS_OPTIONS: TicketStatus[] = [
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "resolved",
  "closed",
  "reopened",
  "cancelled",
];

export default function TicketDetailPage() {
  const { number = "" } = useParams();
  const queryClient = useQueryClient();

  // Nada en esta página decide permisos por su cuenta: `ticket.permissions` viene
  // resuelto por el servidor, que es quien vuelve a comprobarlos en cada llamada.
  const ticketQuery = useQuery({
    queryKey: ticketKeys.detail(number),
    queryFn: () => getTicketByNumber(number),
    retry: false,
  });
  const ticket = ticketQuery.data;

  const messagesQuery = useQuery({
    queryKey: ticketKeys.messages(ticket?.id ?? ""),
    queryFn: () => listMessages(ticket!.id),
    enabled: Boolean(ticket?.id),
  });

  // Mientras el detalle está abierto, el socket entra en la sala del ticket: una
  // respuesta del otro lado aparece sin que nadie recargue (spec §12).
  useWatchTicket(ticket?.id);

  const [preferredTab, setComposerTab] = useState<"public" | "internal">("public");
  // Quien no puede escribir notas internas se queda en «Pública», sin necesidad
  // de un efecto que corrija el estado después de pintar.
  const composerTab = ticket?.permissions.writeInternalNote ? preferredTab : "public";
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);
  // La sugerencia se guarda junto al borrador para el que se pidió. Si la
  // persona sigue escribiendo, deja de coincidir y desaparece sola al pintar:
  // no hace falta un efecto que la limpie, ni puede quedarse una obsoleta.
  const [ghostFor, setGhostFor] = useState<{ draft: string; text: string } | null>(null);

  const { data: ai } = useQuery({ queryKey: aiKeys.status, queryFn: getAiStatus, staleTime: 60_000 });

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ticketKeys.detail(number) }),
      queryClient.invalidateQueries({ queryKey: ticketKeys.messages(ticket?.id ?? "") }),
      queryClient.invalidateQueries({ queryKey: ticketKeys.lists() }),
    ]);
  }

  const send = useMutation({
    mutationFn: () =>
      createMessage(ticket!.id, {
        type: composerTab,
        body: draft.trim(),
        attachmentIds: files.map((file) => file.id),
      }),
    onSuccess: async () => {
      setDraft("");
      setGhostFor(null);
      setFiles([]);
      setActionError(null);
      await refresh();
    },
    onError: (error) => setActionError(error.message),
  });

  const patch = useMutation({
    mutationFn: (input: Parameters<typeof updateTicket>[1]) => updateTicket(ticket!.id, input),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (error) => setActionError(error.message),
  });

  const take = useMutation({
    mutationFn: () => takeTicket(ticket!.id),
    onSuccess: refresh,
    onError: (error) => setActionError(error.message),
  });

  const join = useMutation({
    mutationFn: () => requestJoin(ticket!.id, {}),
    onSuccess: async () => {
      setActionError(null);
      await refresh();
    },
    onError: (error) => setActionError(error.message),
  });

  const unmerge = useMutation({
    mutationFn: (duplicateId: string) => unmergeTicket(ticket!.id, { duplicateId }),
    onSuccess: refresh,
    onError: (error) => setActionError(error.message),
  });

  const dismiss = useMutation({
    mutationFn: () => dismissIncident(ticket!.id),
    onSuccess: refresh,
    onError: (error) => setActionError(error.message),
  });

  const upload = useMutation({
    mutationFn: uploadAttachment,
    onSuccess: (attachment) => {
      setFileError(null);
      setFiles((current) => [...current, attachment]);
    },
    onError: (error) => setFileError(error.message),
  });

  // IA-4: tras 600 ms de pausa se pide una continuación. El servidor la descarta
  // a los 1,5 s y limita a una petición cada 2 s por persona (spec §6.2).
  const aiCompletes = Boolean(ai?.configured && ai.enabled.autocomplete);
  const ticketId = ticket?.id;
  const canGhost = Boolean(ticket?.permissions.viewInternalNotes);
  const ghost = ghostFor?.draft === draft ? ghostFor.text : "";

  useEffect(() => {
    if (!aiCompletes || !canGhost || !ticketId || draft.trim().length < 6) return;

    const timer = window.setTimeout(() => {
      void autocomplete({ ticketId, draft, type: composerTab })
        .then((completion) => {
          if (completion) setGhostFor({ draft, text: completion });
        })
        .catch(() => undefined);
    }, 600);

    return () => window.clearTimeout(timer);
  }, [draft, composerTab, aiCompletes, canGhost, ticketId]);

  if (ticketQuery.isLoading) {
    return (
      <Plate className="flex items-center justify-center py-16">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
          aria-label="Cargando ticket"
        />
      </Plate>
    );
  }

  if (!ticket) {
    return (
      <Plate className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-[var(--content-ink-dim)]">No encontramos el ticket {number}.</p>
        <Link
          to="/tickets"
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white"
        >
          Volver a tickets
        </Link>
      </Plate>
    );
  }

  const permissions = ticket.permissions;
  const isAgentView = permissions.viewInternalNotes;
  const canWrite = permissions.replyPublicly || permissions.writeInternalNote;
  const messages = messagesQuery.data?.items ?? [];

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

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <Plate className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-xs tabular text-[var(--content-ink-dim)]">
                {formatTicketNumber(ticket.number)}
              </p>
              <h1 className="font-display text-xl font-semibold text-[var(--content-ink)]">
                {ticket.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <StatusBadge status={ticket.status} />
                {/* La IA lo intentó y no pudo; se reintenta sola en segundo
                    plano, pero el equipo merece saber por qué falta la ficha. */}
                {ticket.ai?.classificationStatus === "failed" && (
                  <span
                    title="La clasificación automática falló; se reintentará"
                    className="rounded-md border border-[var(--content-border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--content-ink-dim)]"
                  >
                    Pendiente de clasificación
                  </span>
                )}
                <PriorityBadge priority={ticket.priority} />
                <SlaTag
                  state={ticket.resolutionState}
                  label={`Resolución ${formatDeadline(ticket.resolutionDueAt)}`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {permissions.selfAssign && ticket.assignees.length === 0 && (
                <button
                  onClick={() => take.mutate()}
                  disabled={take.isPending}
                  className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:opacity-50"
                >
                  Tomar
                </button>
              )}
              {/* Quien puede asignar no pide permiso: se añade y ya. */}
              {permissions.requestJoin && !permissions.manageAssignees && (
                <button
                  onClick={() => join.mutate()}
                  disabled={join.isPending}
                  title="Pide al supervisor que te sume a este ticket"
                  className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:opacity-50"
                >
                  {join.isSuccess ? "Solicitud enviada" : "Unirme"}
                </button>
              )}
              {permissions.manageAssignees && (
                <button
                  onClick={() => setAssignOpen(true)}
                  className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                >
                  Asignar
                </button>
              )}
              {permissions.transfer && (
                <button
                  onClick={() => setTransferOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                >
                  <ArrowRightIcon className="h-3.5 w-3.5" /> Transferir
                </button>
              )}
              {permissions.merge && (
                <button
                  onClick={() => setMergeOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                >
                  <MergeIcon className="h-3.5 w-3.5" /> Fusionar…
                </button>
              )}
              {permissions.changeStatus && (
                <select
                  value={ticket.status}
                  onChange={(event) => {
                    const next = event.target.value as TicketStatus;
                    if (next === "resolved") {
                      setResolveOpen(true);
                      return;
                    }
                    patch.mutate({ status: next });
                  }}
                  className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5 text-xs text-[var(--content-ink)]"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {TICKET_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {actionError && (
            <p
              role="alert"
              className="mt-3 rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-red"
            >
              {actionError}
            </p>
          )}
        </Plate>

        {isAgentView && ai?.configured && ai.enabled.summary && (
          <SummaryPanel
            ticketId={ticket.id}
            open={summaryOpen}
            onToggle={() => setSummaryOpen((open) => !open)}
          />
        )}

        <Plate className="p-4">
          {messagesQuery.isLoading ? (
            <p className="text-sm text-[var(--content-ink-dim)]">Cargando la conversación…</p>
          ) : (
            <ol className="flex flex-col gap-4">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ol>
          )}

          {ticket.status === "resolved" && (
            <ResolvedPanel
              ticket={ticket}
              onClose={() => patch.mutate({ status: "closed" })}
              onReopen={() => patch.mutate({ status: "reopened" })}
            />
          )}

          {ticket.permissions.answerCsat && <CsatPanel ticket={ticket} onAnswered={refresh} />}

          {canWrite && (
            <div className="mt-4 border-t border-[var(--content-border)] pt-4">
              {permissions.writeInternalNote && (
                <div className="mb-2 flex w-fit rounded-lg border border-[var(--content-border)] p-0.5">
                  <button
                    onClick={() => setComposerTab("public")}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${
                      composerTab === "public"
                        ? "bg-accent text-white"
                        : "text-[var(--content-ink-dim)]"
                    }`}
                  >
                    Pública
                  </button>
                  <button
                    onClick={() => setComposerTab("internal")}
                    className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium ${
                      composerTab === "internal"
                        ? "bg-amber text-[#3d2905]"
                        : "text-[var(--content-ink-dim)]"
                    }`}
                  >
                    <LockIcon className="h-3 w-3" /> Interna
                  </button>
                </div>
              )}

              <div
                className={`rounded-xl border p-3 ${
                  composerTab === "internal"
                    ? "border-amber/40 bg-amber/10"
                    : "border-[var(--content-border)] bg-[var(--content-bg)]"
                }`}
              >
                <div className="relative">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Tab" && ghost) {
                        event.preventDefault();
                        setDraft((current) => current + ghost);
                        setGhostFor(null);
                      } else if (event.key === "Escape") {
                        setGhostFor(null);
                      }
                    }}
                    rows={3}
                    maxLength={5000}
                    placeholder={
                      composerTab === "internal"
                        ? "Nota interna para el equipo…"
                        : "Escribe tu respuesta…"
                    }
                    className="w-full resize-none bg-transparent text-sm text-[var(--content-ink)] outline-none"
                  />
                  {/* El fantasma se pinta debajo, alineado con lo ya escrito. */}
                  {ghost && (
                    <p
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 top-0 whitespace-pre-wrap text-sm"
                    >
                      <span className="invisible">{draft}</span>
                      <span className="italic text-[var(--content-ink-dim)]">{ghost}</span>
                    </p>
                  )}
                </div>
                {ghost && (
                  <p className="mt-1 text-[10px] text-[var(--content-ink-dim)]">
                    Tab para aceptar · Esc para descartar
                  </p>
                )}

                {files.length > 0 && (
                  <ul className="mb-2 flex flex-wrap gap-1.5">
                    {files.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center gap-1.5 rounded-md bg-[var(--content-surface)] px-2 py-1 text-xs text-[var(--content-ink)]"
                      >
                        {file.fileName}
                        <button
                          onClick={() =>
                            setFiles((current) => current.filter((item) => item.id !== file.id))
                          }
                          className="text-[var(--content-ink-dim)] hover:text-red"
                          aria-label={`Quitar ${file.fileName}`}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {fileError && <p className="mb-2 text-xs text-red">{fileError}</p>}

                <div className="mt-2 flex items-center justify-between">
                  <label
                    className="cursor-pointer text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
                    title="Adjuntar archivo"
                  >
                    <PaperclipIcon />
                    <input
                      type="file"
                      multiple
                      accept={ALLOWED_ATTACHMENT_MIME.join(",")}
                      className="hidden"
                      onChange={(event) => {
                        addFiles(event.target.files);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  <button
                    onClick={() => send.mutate()}
                    disabled={draft.trim().length === 0 || send.isPending}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50"
                  >
                    {send.isPending ? "Enviando…" : "Enviar"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Plate>
      </div>

      <div className="space-y-4">
        <Plate className="space-y-3 p-4 text-sm">
          <DetailRow label="Solicitante" value={ticket.requester.name} />
          {ticket.createdBy.id !== ticket.requester.id && (
            <DetailRow label="Registrado por" value={ticket.createdBy.name} />
          )}
          {ticket.additionalRequesters.length > 0 && (
            <DetailRow
              label="También lo reportaron"
              value={ticket.additionalRequesters.map((person) => person.name).join(", ")}
            />
          )}
          <DetailRow label="Área" value={<AreaTag area={ticket.area} />} />
          <DetailRow label="Categoría" value={ticket.categoryName ?? "Sin categoría"} />
          <DetailRow
            label="Responsables"
            value={
              ticket.assignees.length ? (
                <AvatarStack users={ticket.assignees} max={5} />
              ) : (
                <span className="text-[var(--content-ink-dim)]">Sin asignar</span>
              )
            }
          />
          <DetailRow label="Creado" value={formatWhen(ticket.createdAt)} />
          {ticket.sla.firstResponseAt && (
            <DetailRow label="1.ª respuesta" value={formatWhen(ticket.sla.firstResponseAt)} />
          )}
          <DetailRow
            label="SLA respuesta"
            value={<SlaTag state={ticket.responseState} />}
          />
          <DetailRow
            label="SLA resolución"
            value={<SlaTag state={ticket.resolutionState} />}
          />
          <DetailRow label="Vence" value={formatDateTime(ticket.resolutionDueAt)} />
        </Plate>

        {isAgentView && ticket.ai?.incident?.status === "detected" && (
          <Plate className="border-amber/40 bg-amber/10 p-4 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-amber">
              <AlertIcon /> Parte de un incidente
            </p>
            <p className="mt-1 text-[var(--content-ink-dim)]">{ticket.ai.incident.label}</p>
            <p className="mt-0.5 text-xs text-[var(--content-ink-dim)]">
              Detectado con {Math.round(ticket.ai.incident.confidence * 100)}% de confianza. La IA
              no fusiona nada por su cuenta.
            </p>
            {permissions.manageAssignees && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {permissions.merge && (
                  <button onClick={() => setMergeOpen(true)} className="text-accent hover:underline">
                    Ver tickets del incidente
                  </button>
                )}
                <button
                  onClick={() => dismiss.mutate()}
                  disabled={dismiss.isPending}
                  className="text-[var(--content-ink-dim)] hover:underline disabled:opacity-50"
                >
                  No es un incidente
                </button>
              </div>
            )}
          </Plate>
        )}

        {(ticket.mergedInto || ticket.mergedTickets.length > 0) && (
          <Plate className="p-4 text-sm">
            <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-[var(--content-ink)]">
              Duplicados
            </p>
            {ticket.mergedInto && (
              <p className="text-xs text-[var(--content-ink-dim)]">
                Fusionado dentro de{" "}
                <Link
                  to={`/tickets/${formatTicketNumber(ticket.mergedInto.number)}`}
                  className="text-accent hover:underline"
                >
                  {formatTicketNumber(ticket.mergedInto.number)}
                </Link>
              </p>
            )}
            <ul className="space-y-1.5 text-xs text-[var(--content-ink-dim)]">
              {ticket.mergedTickets.map((merged) => (
                <li key={merged.id} className="flex items-start justify-between gap-2">
                  <Link
                    to={`/tickets/${formatTicketNumber(merged.number)}`}
                    className="min-w-0 hover:underline"
                  >
                    {formatTicketNumber(merged.number)} — {merged.title}
                  </Link>
                  {permissions.unmerge && (
                    <button
                      onClick={() => unmerge.mutate(merged.id)}
                      disabled={unmerge.isPending}
                      className="shrink-0 text-[var(--content-ink-dim)] underline hover:text-[var(--content-ink)] disabled:opacity-50"
                    >
                      Separar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Plate>
        )}

        <Plate className="p-4 text-sm">
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-[var(--content-ink)]">
            Historial
          </p>
          <ul className="space-y-2 text-xs text-[var(--content-ink-dim)]">
            {ticket.history.map((entry, index) => (
              <li key={`${entry.status}-${index}`}>
                {TICKET_STATUS_LABEL[entry.status]}
                {entry.by ? ` · ${entry.by.name}` : ""} — {formatWhen(entry.at)}
              </li>
            ))}
          </ul>
        </Plate>
      </div>

      <AssignModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        ticket={ticket}
        onSaved={refresh}
      />

      <ResolveModal
        open={resolveOpen}
        onClose={() => setResolveOpen(false)}
        onConfirm={(note) => {
          setResolveOpen(false);
          patch.mutate({ status: "resolved", note });
        }}
      />

      <TransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        ticket={ticket}
        onDone={refresh}
      />

      <MergeModal
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        ticket={ticket}
        onDone={refresh}
      />
    </div>
  );
}


/**
 * IA-3. El resumen se guarda en el ticket y se reutiliza hasta que la
 * conversación avanza tres mensajes; "Regenerar" fuerza uno nuevo. Si no llega
 * ninguno, el panel lo dice y no pasa nada más (spec §6.3).
 */
function SummaryPanel({
  ticketId,
  open,
  onToggle,
}: {
  ticketId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: aiKeys.summary(ticketId),
    queryFn: () => getSummary(ticketId),
  });

  const regenerate = useMutation({
    mutationFn: () => regenerateSummary(ticketId),
    onSuccess: (result) => queryClient.setQueryData(aiKeys.summary(ticketId), result),
  });

  return (
    <Plate className="p-4">
      <div className="flex items-center justify-between gap-2">
        <button onClick={onToggle} className="flex flex-1 items-center justify-between text-left">
          <span className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wide text-accent">
            <SparkleIcon /> Resumen de IA
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => regenerate.mutate()}
            disabled={regenerate.isPending}
            className="text-xs text-[var(--content-ink-dim)] hover:text-[var(--content-ink)] disabled:opacity-50"
          >
            {regenerate.isPending ? "Generando…" : "Regenerar"}
          </button>
          <button onClick={onToggle} aria-label={open ? "Ocultar resumen" : "Mostrar resumen"}>
            <ChevronDownIcon
              className={`text-[var(--content-ink-dim)] transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {open && (
        <p className="mt-2 text-sm leading-relaxed text-[var(--content-ink-dim)]">
          {isLoading
            ? "Preparando el resumen…"
            : (data?.summary ??
              "Todavía no hay resumen. Pulsa «Regenerar» para pedirlo.")}
        </p>
      )}
    </Plate>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--content-ink-dim)]">{label}</span>
      <span className="text-right text-[var(--content-ink)]">{value}</span>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageView }) {
  if (message.type === "system") {
    const event = message.systemEvent;
    return (
      <li className="flex justify-center">
        <span className="rounded-full bg-[var(--content-bg)] px-3 py-1 text-[11px] text-[var(--content-ink-dim)]">
          {describeEvent(event)} · {formatWhen(message.createdAt)}
        </span>
      </li>
    );
  }

  const internal = message.type === "internal";
  return (
    <li className="flex gap-3">
      <Avatar name={message.author?.name} size="sm" />
      <div
        className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm ${
          internal ? "border border-amber/40 bg-amber/10" : "bg-[var(--content-bg)]"
        } ${message.fromTicket ? "border-l-2 border-l-[var(--content-ink-dim)]/40" : ""}`}
      >
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className="font-medium text-[var(--content-ink)]">
            {message.author?.name ?? "Sistema"}
          </span>
          {internal && (
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber">
              <LockIcon className="h-3 w-3" /> Interna
            </span>
          )}
          <span className="text-xs text-[var(--content-ink-dim)]">
            {formatWhen(message.createdAt)}
          </span>
          {/* Viene de un duplicado absorbido: se lee aquí, pero vive allí. */}
          {message.fromTicket && (
            <Link
              to={`/tickets/${formatTicketNumber(message.fromTicket.number)}`}
              className="rounded-full border border-[var(--content-border)] px-1.5 py-0.5 text-[10px] text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            >
              Original de {formatTicketNumber(message.fromTicket.number)}
            </Link>
          )}
        </div>
        <p className="whitespace-pre-wrap text-[var(--content-ink)]">{message.body}</p>
        {message.attachments.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {message.attachments.map((file) => (
              <li key={file.id}>
                <a
                  href={attachmentUrl(file.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-md border border-[var(--content-border)] px-2 py-1 text-xs text-[var(--content-ink)] hover:bg-[var(--content-surface)]"
                >
                  <PaperclipIcon className="h-3 w-3" />
                  {file.fileName}
                  <span className="text-[var(--content-ink-dim)]">
                    {formatBytes(file.sizeBytes)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function describeEvent(event: MessageView["systemEvent"]): string {
  if (!event) return "Actualización";
  switch (event.kind) {
    case "status_changed":
      return `Estado: ${label(event.from)} → ${label(event.to)}${event.reason ? ` · ${event.reason}` : ""}`;
    case "priority_changed":
      return `Prioridad cambiada a ${event.to}${event.reason ? ` · ${event.reason}` : ""}`;
    case "category_changed":
      return `Categoría: ${event.to}`;
    case "assignees_changed":
      return `Responsables: ${event.to}`;
    case "transferred":
      return `Transferido de ${event.from} a ${event.to}${event.reason ? ` · ${event.reason}` : ""}`;
    case "merged":
      return `Fusionado con ${event.to}${event.reason ? ` · ${event.reason}` : ""}`;
    case "unmerged":
      return `Fusión deshecha: ${event.to}`;
    case "join_requested":
      return `${event.to} pidió unirse${event.reason ? ` · ${event.reason}` : ""}`;
    case "csat_answered":
      return `El solicitante calificó la atención con ${event.to}${event.reason ? ` · "${event.reason}"` : ""}`;
    default:
      return "Actualización";
  }
}

function label(status?: string): string {
  return status && status in TICKET_STATUS_LABEL
    ? TICKET_STATUS_LABEL[status as TicketStatus]
    : (status ?? "");
}

function ResolvedPanel({
  ticket,
  onClose,
  onReopen,
}: {
  ticket: TicketDetail;
  onClose: () => void;
  onReopen: () => void;
}) {
  // Solo el solicitante confirma que el problema desapareció (spec §5.2).
  const isRequesterSide = !ticket.permissions.viewInternalNotes;
  if (!isRequesterSide) return null;

  return (
    <div className="mt-4 rounded-xl border-2 border-green bg-green/10 p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-[var(--content-ink)]">
        <CheckIcon /> El equipo marcó este ticket como resuelto.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onClose}
          className="rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-[#06210f]"
        >
          Sí, se resolvió
        </button>
        <button
          onClick={onReopen}
          className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)]"
        >
          No, sigue el problema
        </button>
      </div>
    </div>
  );
}

/**
 * Encuesta de satisfacción (spec §7.6). Aparece al solicitante cuando el ticket pasa
 * a *Resuelto* y desaparece en cuanto responde o el ticket se cierra: el servidor
 * manda `answerCsat` ya resuelto, así que esta pantalla no decide cuándo mostrarla.
 */
function CsatPanel({ ticket, onAnswered }: { ticket: TicketDetail; onAnswered: () => Promise<void> }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () =>
      answerCsat(ticket.id, {
        rating,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      }),
    onSuccess: onAnswered,
    onError: (cause) => setError(cause.message),
  });

  const shown = hover || rating;

  return (
    <div className="mt-4 rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-4">
      <p className="text-sm font-medium text-[var(--content-ink)]">
        ¿Cómo calificarías la atención recibida?
      </p>
      <div className="mt-2 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onMouseEnter={() => setHover(value)}
            onFocus={() => setHover(value)}
            onClick={() => setRating(value)}
            aria-label={`${value} de 5`}
            aria-pressed={rating === value}
            className={`rounded p-0.5 transition-colors ${
              value <= shown ? "text-amber" : "text-[var(--content-ink-dim)]"
            }`}
          >
            <StarIcon className="h-5 w-5" />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 font-display text-xs tabular text-[var(--content-ink-dim)]">
            {rating}/5
          </span>
        )}
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="¿Algo que quieras añadir? (opcional)"
        className="mt-3 w-full resize-none rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] placeholder:text-[var(--content-ink-dim)]"
      />
      {error && <p className="mt-2 text-xs text-red">{error}</p>}
      <button
        onClick={() => send.mutate()}
        disabled={rating === 0 || send.isPending}
        className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim disabled:opacity-50"
      >
        {send.isPending ? "Enviando…" : "Enviar calificación"}
      </button>
    </div>
  );
}

function AssignModal({
  open,
  onClose,
  ticket,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  ticket: TicketDetail;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    ticket.assignees.map((person) => person.id),
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Al abrirse, la selección vuelve a partir de los responsables actuales. Es el
  // patrón de React para ajustar estado cuando cambia una prop, sin efecto.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelected(ticket.assignees.map((person) => person.id));
  }

  const { data: members = [] } = useQuery({
    queryKey: areaKeys.workload(ticket.area.id),
    queryFn: () => listAreaWorkload(ticket.area.id),
    enabled: open,
  });

  const save = useMutation({
    mutationFn: () => setAssignees(ticket.id, { assigneeIds: selected }),
    onSuccess: async () => {
      await onSaved();
      onClose();
    },
    onError: (cause) => setError(cause.message),
  });

  const visible = members.filter((member) =>
    member.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  // La barra se mide contra la persona más cargada del área, no contra un tope
  // inventado: lo que importa es el reparto relativo.
  const peak = Math.max(1, ...members.map((member) => member.load));
  const awaySelected = members.filter(
    (member) => member.availability.state === "away" && selected.includes(member.id),
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Asignar responsables"
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
            disabled={save.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Guardar responsables
          </button>
        </>
      }
    >
      {error && <p className="mb-2 text-sm text-red">{error}</p>}

      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar en el área…"
        className="mb-3 w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />

      <ul className="space-y-1">
        {visible.map((member) => {
          const away = member.availability.state === "away";
          const checked = selected.includes(member.id);
          return (
            <li key={member.id}>
              <label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked
                        ? [...current, member.id]
                        : current.filter((id) => id !== member.id),
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                <Avatar name={member.name} available={!away} size="sm" />

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm text-[var(--content-ink)]">
                    {member.name}
                    {member.suggested && (
                      <span
                        className="flex items-center gap-0.5 text-[10px] font-medium text-amber"
                        title="Disponible y con menos carga"
                      >
                        <StarIcon /> Sugerido
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-[var(--content-border)]">
                    <span
                      className={`block h-full rounded-full ${
                        member.load / peak > 0.75
                          ? "bg-red"
                          : member.load / peak > 0.4
                            ? "bg-amber"
                            : "bg-green"
                      }`}
                      style={{ width: `${Math.round((member.load / peak) * 100)}%` }}
                    />
                  </span>
                </span>

                <span className="w-44 shrink-0 text-right text-xs text-[var(--content-ink-dim)]">
                  {away ? (
                    member.availability.awayUntil ? (
                      `Ausente hasta ${formatWhen(member.availability.awayUntil)}`
                    ) : (
                      "Ausente"
                    )
                  ) : (
                    <>
                      {member.openTickets} abiertos
                      {member.urgentOrHigh > 0 && ` · ${member.urgentOrHigh} urg./alta`}
                      {member.atRisk > 0 && (
                        <span className="text-red"> · {member.atRisk} en riesgo</span>
                      )}
                      <span className="block">{member.resolvedThisWeek} resueltos esta semana</span>
                    </>
                  )}
                </span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && (
          <p className="text-sm text-[var(--content-ink-dim)]">Nadie coincide con la búsqueda.</p>
        )}
      </ul>

      {/* Asignar a alguien ausente se permite, pero nunca en silencio (spec §7.5). */}
      {awaySelected.length > 0 && (
        <p className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
          {awaySelected.map((member) => member.name).join(", ")}{" "}
          {awaySelected.length === 1 ? "está ausente" : "están ausentes"}: puede que nadie atienda
          el ticket hasta su regreso.
        </p>
      )}
    </Modal>
  );
}

function TransferModal({
  open,
  onClose,
  ticket,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ticket: TicketDetail;
  onDone: () => Promise<void>;
}) {
  const [areaId, setAreaId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: areas = [] } = useQuery({
    queryKey: areaKeys.all,
    queryFn: listAreas,
    enabled: open,
  });

  const transfer = useMutation({
    mutationFn: () => transferTicket(ticket.id, { areaId, reason: reason.trim() }),
    onSuccess: async () => {
      await onDone();
      setAreaId("");
      setReason("");
      onClose();
    },
    onError: (cause) => setError(cause.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transferir a otra área"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => transfer.mutate()}
            disabled={!areaId || reason.trim().length < 3 || transfer.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Transferir
          </button>
        </>
      }
    >
      {error && <p className="mb-2 text-sm text-red">{error}</p>}

      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
        Área destino
      </label>
      <select
        value={areaId}
        onChange={(event) => setAreaId(event.target.value)}
        className="mb-3 w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      >
        <option value="">Selecciona un área</option>
        {areas
          .filter((area: Area) => area.id !== ticket.area.id)
          .map((area: Area) => (
            <option key={area.id} value={area.id}>
              {area.name}
            </option>
          ))}
      </select>

      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
        Motivo (obligatorio)
      </label>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Ej. Es una consulta de nómina, no de sistemas"
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />

      <p className="mt-3 text-xs text-[var(--content-ink-dim)]">
        El ticket vuelve a <strong>Abierto</strong> en el área nueva y se queda sin responsables. El
        plazo del SLA sigue corriendo: mide lo que lleva esperando el solicitante.
      </p>
    </Modal>
  );
}

function MergeModal({
  open,
  onClose,
  ticket,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ticket: TicketDetail;
  onDone: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [addAssignees, setAddAssignees] = useState(true);
  const [notifyRequesters, setNotifyRequesters] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: [...ticketKeys.all, ticket.id, "duplicates"],
    queryFn: () => listDuplicateCandidates(ticket.id),
    enabled: open,
  });

  // Si el ticket pertenece a un incidente, sus compañeros llegan marcados; el
  // usuario siempre confirma (spec §7.5.1).
  const [primed, setPrimed] = useState(false);
  if (open && !primed && candidates.length > 0) {
    setPrimed(true);
    setPicked(candidates.filter((item) => item.sameIncident).map((item) => item.id));
  }
  if (!open && primed) setPrimed(false);

  const merge = useMutation({
    mutationFn: () =>
      mergeTickets(ticket.id, {
        duplicateIds: picked,
        reason: reason.trim(),
        addAssignees,
        notifyRequesters,
      }),
    onSuccess: async () => {
      await onDone();
      setPicked([]);
      setReason("");
      onClose();
    },
    onError: (cause) => setError(cause.message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fusionar tickets duplicados"
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
            onClick={() => merge.mutate()}
            disabled={picked.length === 0 || reason.trim().length < 3 || merge.isPending}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmar fusión
          </button>
        </>
      }
    >
      {error && <p className="mb-2 text-sm text-red">{error}</p>}

      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">
        Posibles duplicados en {ticket.area.name}, creados en las últimas 48 h con palabras
        parecidas en el título.
      </p>

      {isLoading ? (
        <p className="text-sm text-[var(--content-ink-dim)]">Buscando duplicados…</p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-[var(--content-ink-dim)]">
          No se encontraron posibles duplicados.
        </p>
      ) : (
        <ul className="mb-4 space-y-1">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]">
                <input
                  type="checkbox"
                  checked={picked.includes(candidate.id)}
                  onChange={(event) =>
                    setPicked((current) =>
                      event.target.checked
                        ? [...current, candidate.id]
                        : current.filter((id) => id !== candidate.id),
                    )
                  }
                  className="h-4 w-4 accent-accent"
                />
                <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">
                  {formatTicketNumber(candidate.number)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[var(--content-ink)]">
                  {candidate.title}
                </span>
                {candidate.sameIncident && (
                  <span className="shrink-0 rounded-full bg-amber/15 px-1.5 py-0.5 text-[10px] font-medium text-amber">
                    Mismo incidente
                  </span>
                )}
                <span className="shrink-0 text-xs text-[var(--content-ink-dim)]">
                  {candidate.requesterName} · {formatWhen(candidate.createdAt)}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="mb-3 flex items-center gap-2 text-sm text-[var(--content-ink)]">
        <ArrowRightIcon className="h-3.5 w-3.5 text-[var(--content-ink-dim)]" />
        Ticket principal:{" "}
        <span className="font-display tabular">{formatTicketNumber(ticket.number)}</span>
      </div>

      <label className="mb-1.5 flex items-center gap-2 text-sm text-[var(--content-ink)]">
        <input
          type="checkbox"
          checked={addAssignees}
          onChange={(event) => setAddAssignees(event.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Añadir a los responsables de los duplicados
      </label>
      <label className="mb-3 flex items-center gap-2 text-sm text-[var(--content-ink)]">
        <input
          type="checkbox"
          checked={notifyRequesters}
          onChange={(event) => setNotifyRequesters(event.target.checked)}
          className="h-4 w-4 accent-accent"
        />
        Avisar a los solicitantes
      </label>

      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
        Motivo (obligatorio)
      </label>
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Ej. Mismo fallo de wifi en Ventas"
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />
    </Modal>
  );
}

function ResolveModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Resolver el ticket"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onConfirm(note.trim());
              setNote("");
            }}
            disabled={note.trim().length < 3}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Marcar como resuelto
          </button>
        </>
      }
    >
      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
        Nota de solución (obligatoria)
      </label>
      <textarea
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={3}
        placeholder="¿Cómo se resolvió el problema?"
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] p-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />
      <p className="mt-2 text-xs text-[var(--content-ink-dim)]">
        La nota se publica en la conversación: es lo que el solicitante lee al confirmar.
      </p>
    </Modal>
  );
}
