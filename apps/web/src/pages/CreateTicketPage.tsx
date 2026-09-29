import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { CheckIcon, LightbulbIcon, PaperclipIcon, SparkleIcon, XIcon } from "../components/icons";
import { AREAS, CURRENT_USER, PRIORITY_META, TICKETS, USERS } from "../data/mock";
import type { AreaId, Priority } from "../data/types";

const KEYWORDS: { match: RegExp; area: AreaId }[] = [
  { match: /wifi|red|internet|correo|impresora|laptop|software|contraseñ|acceso/i, area: "it" },
  { match: /agua|fuga|luz|el[eé]ctric|aire|clima|silla|mueble|limpieza/i, area: "mantenimiento" },
  { match: /n[oó]mina|vacacion|constancia|permiso|beneficio/i, area: "rrhh" },
  { match: /cotizaci[oó]n|cliente|comisi[oó]n/i, area: "ventas" },
  { match: /banner|redes sociales|evento|gr[aá]fico/i, area: "marketing" },
  { match: /reembolso|factura|pago|proveedor/i, area: "finanzas" },
];

function suggestArea(text: string): { areaId: AreaId; confidence: number } {
  for (const k of KEYWORDS) {
    if (k.match.test(text)) return { areaId: k.area, confidence: 0.86 + Math.min(0.12, text.length / 800) };
  }
  return { areaId: "it", confidence: 0.52 };
}

function suggestPriority(text: string): Priority {
  if (/urgente|no funciona nada|ca[ií]do|se cay[oó]|fuga|incendio/i.test(text)) return "alta";
  if (/no puedo|error|falla/i.test(text)) return "media";
  return "media";
}

let nextTicketSeq = 521;

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const [onBehalfOf, setOnBehalfOf] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [areaId, setAreaId] = useState<AreaId | "">("");
  const [areaTouched, setAreaTouched] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<{ areaId: AreaId; confidence: number } | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState<null | { number: string; areaId: AreaId; category: string; priority: Priority }>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const text = `${title} ${description}`.trim();
    if (text.length < 20) {
      setSuggestion(null);
      return;
    }
    setAnalyzing(true);
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const s = suggestArea(text);
      setSuggestion(s);
      setAnalyzing(false);
      if (!areaTouched && s.confidence >= 0.6) setAreaId(s.areaId);
    }, 800);
    return () => window.clearTimeout(debounceRef.current);
  }, [title, description, areaTouched]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const finalArea = (areaId || suggestion?.areaId || "it") as AreaId;
    const category = AREAS.find((a) => a.id === finalArea)?.categories[0] ?? "General";
    const priority = suggestPriority(`${title} ${description}`);
    const number = `TK-${String(nextTicketSeq++).padStart(6, "0")}`;
    const requesterUser = onBehalfOf ? USERS.find((u) => u.id === onBehalfOf) : CURRENT_USER;
    TICKETS.unshift({
      number,
      title: title.trim(),
      description: description.trim(),
      areaId: finalArea,
      category,
      priority,
      status: "abierto",
      requester: requesterUser?.name ?? CURRENT_USER.name,
      createdBy: onBehalfOf ? CURRENT_USER.name : undefined,
      assignees: [],
      createdAt: new Date().toISOString(),
      slaResponse: "en_tiempo",
      slaResolution: "en_tiempo",
      aiConfidence: suggestion?.confidence ?? 0.7,
      hasAttachments: files.length > 0,
      messages: [
        {
          id: "m1",
          author: requesterUser?.name ?? CURRENT_USER.name,
          authorInitials: requesterUser?.initials ?? CURRENT_USER.initials,
          body: description.trim(),
          createdAt: new Date().toISOString(),
          internal: false,
        },
      ],
    });
    setSubmitted({ number, areaId: finalArea, category, priority });
  }

  if (submitted) {
    const area = AREAS.find((a) => a.id === submitted.areaId)!;
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green/15 text-green">
          <CheckIcon className="h-7 w-7" />
        </div>
        <h1 className="font-display text-2xl font-semibold text-[var(--content-ink)]">¡Ticket creado!</h1>
        <Plate className="mt-5 space-y-2.5 p-5 text-left text-sm">
          <Row label="Número de ticket" value={<span className="font-display tabular text-[var(--content-ink)]">{submitted.number}</span>} />
          <Row label="Área" value={area.name} />
          <Row label="Categoría asignada por IA" value={submitted.category} />
          <Row label="Prioridad asignada por IA" value={PRIORITY_META[submitted.priority].label} />
          <Row label="Primera respuesta estimada" value="< 4 h laborales" />
        </Plate>
        <p className="mt-4 text-xs text-[var(--content-ink-dim)]">Los miembros del área fueron notificados.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => {
              setSubmitted(null);
              setTitle("");
              setDescription("");
              setAreaId("");
              setAreaTouched(false);
              setSuggestion(null);
              setFiles([]);
            }}
            className="rounded-lg border border-[var(--content-border)] px-4 py-2 text-sm font-medium text-[var(--content-ink)] hover:bg-[var(--content-surface)]"
          >
            Crear otro
          </button>
          <button
            onClick={() => navigate(`/tickets/${submitted.number}`)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim"
          >
            Ir al ticket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nuevo ticket" subtitle="Describe el problema; la IA sugiere el área. Prioridad y categoría se deciden después." />
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Plate className="space-y-5 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Solicitante</label>
            {onBehalfOf ? (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm">
                <span className="text-[var(--content-ink)]">{USERS.find((u) => u.id === onBehalfOf)?.name}</span>
                <button type="button" onClick={() => setOnBehalfOf(null)} className="ml-auto text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]">
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-[var(--content-ink)]">Yo</span>
                <select
                  onChange={(e) => e.target.value && setOnBehalfOf(e.target.value)}
                  defaultValue=""
                  className="rounded-lg border border-dashed border-[var(--content-border)] bg-transparent px-2 py-1 text-xs text-accent"
                >
                  <option value="">Crear en nombre de un compañero…</option>
                  {USERS.filter((u) => u.id !== CURRENT_USER.id).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--content-ink-dim)]">Título / asunto</label>
              <span className="text-xs tabular text-[var(--content-ink-dim)]">{title.length}/120</span>
            </div>
            <input
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resume el problema en una frase"
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--content-ink-dim)]">Descripción</label>
              {analyzing && (
                <span className="flex items-center gap-1 text-xs text-accent">
                  <SparkleIcon className="animate-pulse" /> IA analizando…
                </span>
              )}
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Cuéntanos qué pasó, cuándo empezó y qué has intentado."
              minLength={10}
              maxLength={5000}
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Departamento de destino</label>
            <select
              value={areaId || suggestion?.areaId || ""}
              onChange={(e) => {
                setAreaId(e.target.value as AreaId);
                setAreaTouched(true);
              }}
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2.5 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
            >
              <option value="" disabled>
                Selecciona un área
              </option>
              {AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <AnimatePresence>
              {suggestion && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-2 overflow-hidden rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-[var(--content-ink)]"
                >
                  <p className="flex items-center gap-1.5 font-medium text-accent">
                    <SparkleIcon /> Sugerido por IA Tekzaya: {AREAS.find((a) => a.id === suggestion.areaId)?.name} ·{" "}
                    {Math.round(suggestion.confidence * 100)}% de confianza
                  </p>
                  <p className="mt-0.5 text-[var(--content-ink-dim)]">Puedes cambiarlo si no es correcto.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Adjuntos</label>
            <label className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-[var(--content-border)] px-4 py-6 text-center text-xs text-[var(--content-ink-dim)] hover:border-accent">
              <PaperclipIcon />
              Arrastra archivos o haz clic para explorar (máx. 5, 10 MB c/u)
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).map((f) => f.name))}
              />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center justify-between rounded-md bg-[var(--content-bg)] px-2.5 py-1.5 text-xs text-[var(--content-ink)]">
                    {f}
                    <button type="button" onClick={() => setFiles((fs) => fs.filter((_, idx) => idx !== i))} className="text-[var(--content-ink-dim)] hover:text-red">
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]"
            >
              Cancelar
            </button>
            <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim">
              Enviar solicitud
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
          <p>Tiempo estimado de primera respuesta según el SLA del área: <strong className="text-[var(--content-ink)]">menos de 4 h laborales</strong>.</p>
        </Plate>
      </form>
    </div>
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
