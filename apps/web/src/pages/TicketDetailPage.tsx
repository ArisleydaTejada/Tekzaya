import {
  ALLOWED_ATTACHMENT_MIME,
  formatTicketNumber,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  TICKET_STATUS_LABEL,
  type Attachment,
  type MessageView,
  type TicketDetail,
  type TicketStatus,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  areaKeys,
  attachmentUrl,
  createMessage,
  getTicketByNumber,
  listAreaMembers,
  listMessages,
  setAssignees,
  takeTicket,
  ticketKeys,
  updateTicket,
  uploadAttachment,
} from "../api/tickets";
import { Avatar, AvatarStack } from "../components/Avatar";
import { AreaTag, PriorityBadge, SlaTag, StatusBadge } from "../components/badges";
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  LockIcon,
  PaperclipIcon,
  SparkleIcon,
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

  const [preferredTab, setComposerTab] = useState<"public" | "internal">("public");
  // Quien no puede escribir notas internas se queda en «Pública», sin necesidad
  // de un efecto que corrija el estado después de pintar.
  const composerTab = ticket?.permissions.writeInternalNote ? preferredTab : "public";
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);

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

  const upload = useMutation({
    mutationFn: uploadAttachment,
    onSuccess: (attachment) => {
      setFileError(null);
      setFiles((current) => [...current, attachment]);
    },
    onError: (error) => setFileError(error.message),
  });

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
              {permissions.manageAssignees && (
                <button
                  onClick={() => setAssignOpen(true)}
                  className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                >
                  Asignar
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

        {isAgentView && ticket.ai?.summary && (
          <Plate className="p-4">
            <button
              onClick={() => setSummaryOpen((open) => !open)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wide text-accent">
                <SparkleIcon /> Resumen de IA
              </span>
              <ChevronDownIcon
                className={`text-[var(--content-ink-dim)] transition-transform ${summaryOpen ? "rotate-180" : ""}`}
              />
            </button>
            {summaryOpen && (
              <p className="mt-2 text-sm leading-relaxed text-[var(--content-ink-dim)]">
                {ticket.ai.summary}
              </p>
            )}
          </Plate>
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
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={3}
                  maxLength={5000}
                  placeholder={
                    composerTab === "internal"
                      ? "Nota interna para el equipo…"
                      : "Escribe tu respuesta…"
                  }
                  className="w-full resize-none bg-transparent text-sm text-[var(--content-ink)] outline-none"
                />

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

        {isAgentView && ticket.ai?.incident && (
          <Plate className="border-amber/40 bg-amber/10 p-4 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-amber">
              <AlertIcon /> Parte de un incidente
            </p>
            <p className="mt-1 text-[var(--content-ink-dim)]">{ticket.ai.incident.label}</p>
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
            <ul className="space-y-1 text-xs text-[var(--content-ink-dim)]">
              {ticket.mergedTickets.map((merged) => (
                <li key={merged.id}>
                  <Link
                    to={`/tickets/${formatTicketNumber(merged.number)}`}
                    className="hover:underline"
                  >
                    {formatTicketNumber(merged.number)} — {merged.title}
                  </Link>
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
    </div>
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
        }`}
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
  const [error, setError] = useState<string | null>(null);

  // Al abrirse, la selección vuelve a partir de los responsables actuales. Es el
  // patrón de React para ajustar estado cuando cambia una prop, sin efecto.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelected(ticket.assignees.map((person) => person.id));
  }

  const { data: members = [] } = useQuery({
    queryKey: areaKeys.members(ticket.area.id),
    queryFn: () => listAreaMembers(ticket.area.id),
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Asignar responsables"
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
      <ul className="space-y-1">
        {members.map((member) => {
          const away = member.availability.state === "away";
          return (
            <li key={member.id}>
              <label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]">
                <input
                  type="checkbox"
                  checked={selected.includes(member.id)}
                  // Alguien ausente se puede desasignar, pero no cargar de nuevo.
                  disabled={away && !selected.includes(member.id)}
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
                <span className="flex-1 text-sm text-[var(--content-ink)]">{member.name}</span>
                <span className="text-xs text-[var(--content-ink-dim)]">
                  {away
                    ? member.availability.awayUntil
                      ? `Ausente hasta ${formatWhen(member.availability.awayUntil)}`
                      : "Ausente"
                    : `${member.openTickets} abiertos`}
                </span>
              </label>
            </li>
          );
        })}
        {members.length === 0 && (
          <p className="text-sm text-[var(--content-ink-dim)]">
            El área no tiene personas activas.
          </p>
        )}
      </ul>
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
