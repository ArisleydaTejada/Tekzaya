import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar, AvatarStack } from "../components/Avatar";
import { AreaTag, PriorityBadge, SlaTag, StatusBadge } from "../components/badges";
import { Modal } from "../components/Modal";
import { Plate } from "../components/Plate";
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
} from "../components/icons";
import { CURRENT_USER, PRIORITY_META, STATUS_META, TICKETS, areaById, formatWhen, ticketByNumber, userById } from "../data/mock";
import type { Ticket, TicketMessage, TicketStatus } from "../data/types";

const SLA_RANK = { vencido: 0, en_riesgo: 1, en_tiempo: 2 } as const;
const PRIORITY_RANK = { urgente: 0, alta: 1, media: 2, baja: 3 } as const;
function railSort(a: Ticket, b: Ticket) {
  const aw = SLA_RANK[a.slaResponse] <= SLA_RANK[a.slaResolution] ? a.slaResponse : a.slaResolution;
  const bw = SLA_RANK[b.slaResponse] <= SLA_RANK[b.slaResolution] ? b.slaResponse : b.slaResolution;
  return SLA_RANK[aw] - SLA_RANK[bw] || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

const STATUS_OPTIONS: TicketStatus[] = ["abierto", "asignado", "en_progreso", "en_espera", "resuelto", "cerrado"];

export default function TicketDetailPage() {
  const { number } = useParams();
  const navigate = useNavigate();
  const ticket = number ? ticketByNumber(number) : undefined;
  const [, force] = useState(0);
  const rerender = () => force((v) => v + 1);

  const [summaryOpen, setSummaryOpen] = useState(true);
  const [composerTab, setComposerTab] = useState<"public" | "internal">("public");
  const [draft, setDraft] = useState("");
  const [ghost, setGhost] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [csatGiven, setCsatGiven] = useState<number | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const ghostTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(ghostTimer.current);
    if (draft.trim().length < 6) {
      setGhost("");
      return;
    }
    ghostTimer.current = window.setTimeout(() => {
      setGhost(
        composerTab === "internal"
          ? " — revisando el equipo, actualizo en cuanto tenga novedades."
          : " Gracias por reportarlo; ya estamos revisando el caso y te avisamos en cuanto tengamos novedades."
      );
    }, 600);
    return () => window.clearTimeout(ghostTimer.current);
  }, [draft, composerTab]);

  if (!ticket) {
    return (
      <Plate className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-[var(--content-ink-dim)]">No encontramos el ticket {number}.</p>
        <Link to="/tickets" className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white">
          Volver a tickets
        </Link>
      </Plate>
    );
  }

  const isRequester = ticket.requester === CURRENT_USER.name && ticket.assignees.length === 0;
  const isResponsible = ticket.assignees.includes(CURRENT_USER.id);
  const area = areaById(ticket.areaId);
  const railTickets = TICKETS.filter((t) => t.areaId === ticket.areaId && t.status !== "cancelado" && t.status !== "fusionado").sort(
    railSort
  );

  function sendMessage() {
    if (!draft.trim()) return;
    ticket!.messages.push({
      id: `m${Date.now()}`,
      author: CURRENT_USER.name,
      authorInitials: CURRENT_USER.initials,
      body: draft.trim(),
      createdAt: new Date().toISOString(),
      internal: composerTab === "internal",
    });
    if (ticket!.status === "en_espera") ticket!.status = "en_progreso";
    setDraft("");
    setGhost("");
    rerender();
  }

  function acceptGhost() {
    setDraft((d) => d + ghost);
    setGhost("");
  }

  return (
    <div
      className={`grid grid-cols-1 gap-4 ${
        isRequester ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "xl:grid-cols-[auto_minmax(0,1fr)_320px]"
      }`}
    >
      {!isRequester && (
        <div className={`hidden xl:block ${railOpen ? "w-56" : "w-11"}`}>
          <Plate className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto p-2">
            <button
              onClick={() => setRailOpen((v) => !v)}
              className="mb-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
              aria-label={railOpen ? "Colapsar lista" : "Expandir lista"}
            >
              {railOpen && (
                <span className="font-display text-[10px] font-semibold uppercase tracking-[0.12em]">
                  {area.name}
                </span>
              )}
              <ChevronDownIcon className={`transition-transform ${railOpen ? "-rotate-90" : "rotate-90"}`} />
            </button>
            {railOpen &&
              railTickets.map((t) => {
                const tone = PRIORITY_META[t.priority].tone;
                const dot = tone === "red" ? "bg-red" : tone === "green" ? "bg-green" : "bg-amber";
                return (
                  <Link
                    key={t.number}
                    to={`/tickets/${t.number}`}
                    className={`block rounded-lg px-2 py-2 text-xs transition-colors ${
                      t.number === ticket.number ? "bg-accent/15" : "hover:bg-[var(--content-bg)]"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                      <span className="font-display tabular text-[var(--content-ink-dim)]">{t.number}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[var(--content-ink)]">{t.title}</p>
                  </Link>
                );
              })}
          </Plate>
        </div>
      )}

      <div className="min-w-0 space-y-4">
        <Plate className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-xs tabular text-[var(--content-ink-dim)]">{ticket.number}</p>
              <h1 className="font-display text-xl font-semibold text-[var(--content-ink)]">{ticket.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                <SlaTag state={ticket.slaResolution} label={`Resolución ${ticket.slaResolution.replace("_", " ")}`} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isRequester && ticket.assignees.length === 0 && (
                <button
                  onClick={() => {
                    ticket.assignees.push(CURRENT_USER.id);
                    ticket.status = "asignado";
                    rerender();
                  }}
                  className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                >
                  Tomar
                </button>
              )}
              {!isRequester && (
                <button onClick={() => setAssignOpen(true)} className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]">
                  Asignar
                </button>
              )}
              {!isRequester && ticket.status !== "fusionado" && (
                <button onClick={() => setMergeOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]">
                  <MergeIcon className="h-3.5 w-3.5" /> Fusionar…
                </button>
              )}
              {(isResponsible || CURRENT_USER.role === "admin") && (
                <select
                  value={ticket.status}
                  onChange={(e) => {
                    ticket.status = e.target.value as TicketStatus;
                    rerender();
                  }}
                  className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-1.5 text-xs text-[var(--content-ink)]"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </Plate>

        {!isRequester && (
          <Plate className="p-4">
            <button onClick={() => setSummaryOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wide text-accent">
                <SparkleIcon /> Resumen de IA
              </span>
              <ChevronDownIcon className={`text-[var(--content-ink-dim)] transition-transform ${summaryOpen ? "rotate-180" : ""}`} />
            </button>
            {summaryOpen && (
              <p className="mt-2 text-sm leading-relaxed text-[var(--content-ink-dim)]">
                {ticket.requester} reportó "{ticket.title.toLowerCase()}" en {area.name}. {ticket.messages.length > 1
                  ? `El equipo ya respondió y está trabajando en el diagnóstico.`
                  : "Aún no hay respuesta del equipo."}{" "}
                Prioridad {ticket.priority} · confianza de clasificación {Math.round(ticket.aiConfidence * 100)}%.
              </p>
            )}
          </Plate>
        )}

        <Plate className="p-4">
          <ol className="flex flex-col gap-4">
            {ticket.messages.length === 0 && <p className="text-sm text-[var(--content-ink-dim)]">Aún no hay mensajes en este ticket.</p>}
            {ticket.messages.map((m) => (
              <MessageBubble key={m.id} m={m} hideInternal={isRequester} />
            ))}
          </ol>

          {ticket.status === "resuelto" && (
            <div className="mt-4 rounded-xl border-2 border-green bg-green/10 p-4">
              {csatGiven === null ? (
                <>
                  <p className="text-sm font-medium text-[var(--content-ink)]">¿Cómo calificarías la atención recibida?</p>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => setCsatGiven(n)} className="text-[var(--content-ink-dim)] hover:text-amber" aria-label={`${n} estrellas`}>
                        <StarIcon />
                      </button>
                    ))}
                  </div>
                  {isRequester && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => {
                          ticket.status = "cerrado";
                          rerender();
                        }}
                        className="rounded-lg bg-green px-3 py-1.5 text-xs font-semibold text-[#06210f]"
                      >
                        Sí, se resolvió
                      </button>
                      <button
                        onClick={() => {
                          ticket.status = "reabierto";
                          rerender();
                        }}
                        className="rounded-lg border border-[var(--content-border)] px-3 py-1.5 text-xs font-medium text-[var(--content-ink)]"
                      >
                        No, sigue el problema
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-green">
                  <CheckIcon /> Gracias por tu calificación ({csatGiven} de 5).
                </p>
              )}
            </div>
          )}

          {!isRequester && (
            <div className="mt-4 border-t border-[var(--content-border)] pt-4">
              <div className="mb-2 flex rounded-lg border border-[var(--content-border)] p-0.5 w-fit">
                <button
                  onClick={() => setComposerTab("public")}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${composerTab === "public" ? "bg-accent text-white" : "text-[var(--content-ink-dim)]"}`}
                >
                  Pública
                </button>
                <button
                  onClick={() => setComposerTab("internal")}
                  className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium ${composerTab === "internal" ? "bg-amber text-[#3d2905]" : "text-[var(--content-ink-dim)]"}`}
                >
                  <LockIcon className="h-3 w-3" /> Interna
                </button>
              </div>
              <div className={`rounded-xl border p-3 ${composerTab === "internal" ? "border-amber/40 bg-amber/10" : "border-[var(--content-border)] bg-[var(--content-bg)]"}`}>
                <div className="relative">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Tab" && ghost) {
                        e.preventDefault();
                        acceptGhost();
                      } else if (e.key === "Escape") {
                        setGhost("");
                      }
                    }}
                    rows={3}
                    placeholder={composerTab === "internal" ? "Nota interna para el equipo…" : "Escribe tu respuesta…"}
                    className="w-full resize-none bg-transparent text-sm text-[var(--content-ink)] outline-none"
                  />
                  {ghost && (
                    <p className="pointer-events-none absolute inset-x-0 top-0 whitespace-pre-wrap text-sm text-[var(--content-ink-dim)]/0">
                      <span className="invisible">{draft}</span>
                      <span className="italic text-[var(--content-ink-dim)]">{ghost}</span>
                    </p>
                  )}
                </div>
                {ghost && <p className="mt-1 text-[10px] text-[var(--content-ink-dim)]">Tab para aceptar · Esc para descartar</p>}
                <div className="mt-2 flex items-center justify-between">
                  <PaperclipIcon className="text-[var(--content-ink-dim)]" />
                  <button onClick={sendMessage} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim">
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          )}
          {isRequester && ticket.status !== "resuelto" && (
            <div className="mt-4 border-t border-[var(--content-border)] pt-4">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="Escribe tu respuesta…"
                className="w-full resize-none rounded-xl border border-[var(--content-border)] bg-[var(--content-bg)] p-3 text-sm text-[var(--content-ink)] outline-none"
              />
              <div className="mt-2 flex justify-end">
                <button onClick={sendMessage} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dim">
                  Enviar
                </button>
              </div>
            </div>
          )}
        </Plate>
      </div>

      <div className="space-y-4">
        <Plate className="space-y-3 p-4 text-sm">
          <DetailRow label="Solicitante" value={ticket.requester} />
          {ticket.createdBy && <DetailRow label="Creado por" value={`${ticket.createdBy} en nombre de ${ticket.requester}`} />}
          <DetailRow label="Área" value={<AreaTag areaId={ticket.areaId} />} />
          <DetailRow label="Categoría" value={ticket.category} />
          <DetailRow
            label="Responsables"
            value={ticket.assignees.length ? <AvatarStack userIds={ticket.assignees} max={5} /> : <span className="text-[var(--content-ink-dim)]">Sin asignar</span>}
          />
          <DetailRow label="Creado" value={formatWhen(ticket.createdAt)} />
          {ticket.firstResponseAt && <DetailRow label="1.ª respuesta" value={formatWhen(ticket.firstResponseAt)} />}
          <DetailRow label="SLA respuesta" value={<SlaTag state={ticket.slaResponse} />} />
          <DetailRow label="SLA resolución" value={<SlaTag state={ticket.slaResolution} />} />
          {ticket.hasAttachments && (
            <DetailRow label="Adjuntos" value={<span className="flex items-center gap-1 text-[var(--content-ink)]"><PaperclipIcon className="h-3.5 w-3.5" />1 archivo</span>} />
          )}
        </Plate>

        {ticket.incident && (
          <Plate className="border-amber/40 bg-amber/10 p-4 text-sm">
            <p className="flex items-center gap-1.5 font-medium text-amber">
              <AlertIcon /> Parte de un incidente
            </p>
            <p className="mt-1 text-[var(--content-ink-dim)]">{ticket.incident}</p>
          </Plate>
        )}

        <Plate className="p-4 text-sm">
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-[var(--content-ink)]">Historial</p>
          <ul className="space-y-2 text-xs text-[var(--content-ink-dim)]">
            <li>Creado — {formatWhen(ticket.createdAt)}</li>
            {ticket.assignees.map((id) => (
              <li key={id}>Asignado a {userById(id)?.name} — {formatWhen(ticket.createdAt)}</li>
            ))}
            {ticket.status !== "abierto" && <li>Estado actual: {STATUS_META[ticket.status].label}</li>}
          </ul>
        </Plate>
      </div>

      <AssignModal open={assignOpen} onClose={() => setAssignOpen(false)} ticket={ticket} onSaved={rerender} />
      <MergeModal open={mergeOpen} onClose={() => setMergeOpen(false)} ticket={ticket} onMerged={() => navigate(`/tickets/${ticket.number}`)} />
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

function MessageBubble({ m, hideInternal }: { m: TicketMessage; hideInternal: boolean }) {
  if (m.internal && hideInternal) return null;
  return (
    <li className={`flex gap-3 ${m.system ? "opacity-80" : ""}`}>
      <Avatar name={m.author} initials={m.authorInitials} size="sm" />
      <div className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm ${m.internal ? "border border-amber/40 bg-amber/10" : "bg-[var(--content-bg)]"}`}>
        <div className="mb-0.5 flex items-center gap-2">
          <span className="font-medium text-[var(--content-ink)]">{m.author}</span>
          {m.internal && (
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-amber">
              <LockIcon className="h-3 w-3" /> Interna
            </span>
          )}
          <span className="text-xs text-[var(--content-ink-dim)]">{formatWhen(m.createdAt)}</span>
        </div>
        <p className="text-[var(--content-ink)]">{m.body}</p>
      </div>
    </li>
  );
}

function AssignModal({ open, onClose, ticket, onSaved }: { open: boolean; onClose: () => void; ticket: Ticket; onSaved: () => void }) {
  const candidates = ["luis", "marta", "carlos", "ana"];
  const [selected, setSelected] = useState<string[]>(ticket.assignees);
  useEffect(() => setSelected(ticket.assignees), [ticket, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Asignar responsables"
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
            Cancelar
          </button>
          <button
            onClick={() => {
              ticket.assignees = selected;
              if (selected.length && ticket.status === "abierto") ticket.status = "asignado";
              onSaved();
              onClose();
            }}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white"
          >
            Guardar responsables
          </button>
        </>
      }
    >
      <ul className="space-y-1">
        {candidates.map((id) => {
          const u = userById(id)!;
          const loadCount = TICKETS.filter((t) => t.assignees.includes(id) && t.status !== "resuelto" && t.status !== "cerrado").length;
          return (
            <li key={id}>
              <label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]">
                <input
                  type="checkbox"
                  checked={selected.includes(id)}
                  disabled={!u.available}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, id] : s.filter((x) => x !== id)))
                  }
                  className="h-4 w-4 accent-accent"
                />
                <Avatar name={u.name} initials={u.initials} available={u.available} size="sm" />
                <span className="flex-1 text-sm text-[var(--content-ink)]">{u.name}</span>
                <span className="text-xs text-[var(--content-ink-dim)]">{u.available ? `${loadCount} abiertos` : "Ausente"}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function MergeModal({ open, onClose, ticket, onMerged }: { open: boolean; onClose: () => void; ticket: Ticket; onMerged: () => void }) {
  const candidates = TICKETS.filter(
    (t) => t.number !== ticket.number && t.areaId === ticket.areaId && t.status !== "fusionado" && t.status !== "cerrado" && t.status !== "cancelado"
  ).slice(0, 5);
  const [picked, setPicked] = useState<string[]>(ticket.incident ? candidates.filter((c) => c.incident === ticket.incident).map((c) => c.number) : []);
  const [reason, setReason] = useState("");

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fusionar tickets duplicados"
      wide
      footer={
        <>
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
            Cancelar
          </button>
          <button
            disabled={picked.length === 0 || !reason.trim()}
            onClick={() => {
              for (const num of picked) {
                const dup = TICKETS.find((t) => t.number === num);
                if (dup) {
                  dup.status = "fusionado";
                  dup.mergedInto = ticket.number;
                }
              }
              onClose();
              onMerged();
            }}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmar fusión
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-[var(--content-ink-dim)]">
        Posibles duplicados en {areaById(ticket.areaId).name}, creados en las últimas 48 h con palabras parecidas.
      </p>
      <ul className="mb-4 space-y-1">
        {candidates.map((c) => (
          <li key={c.number}>
            <label className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[var(--content-bg)]">
              <input
                type="checkbox"
                checked={picked.includes(c.number)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.number] : p.filter((x) => x !== c.number)))}
                className="h-4 w-4 accent-accent"
              />
              <span className="font-display text-xs tabular text-[var(--content-ink-dim)]">{c.number}</span>
              <span className="flex-1 truncate text-sm text-[var(--content-ink)]">{c.title}</span>
            </label>
          </li>
        ))}
        {candidates.length === 0 && <p className="text-sm text-[var(--content-ink-dim)]">No se encontraron posibles duplicados.</p>}
      </ul>
      <div className="mb-3 flex items-center gap-2 text-sm text-[var(--content-ink)]">
        <ArrowRightIcon className="h-3.5 w-3.5 text-[var(--content-ink-dim)]" />
        Ticket principal: <span className="font-display tabular">{ticket.number}</span> (el más antiguo)
      </div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Motivo (obligatorio)</label>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Ej. Mismo fallo de wifi en Ventas"
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />
    </Modal>
  );
}
