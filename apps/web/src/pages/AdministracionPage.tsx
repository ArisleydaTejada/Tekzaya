import { PRIORITIES, PRIORITY_LABEL, type Settings } from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { CheckIcon, PlusIcon } from "../components/icons";
import { getSettings, settingsKey, updateSettings } from "../api/tickets";
import { AREAS, USERS } from "../data/mock";

const TABS = [
  { id: "usuarios", label: "Usuarios" },
  { id: "areas", label: "Áreas y categorías" },
  { id: "configuracion", label: "Configuración" },
];

const ROLE_LABEL: Record<string, string> = {
  employee: "Empleado",
  area_supervisor: "Supervisor de área",
  hr_supervisor: "Supervisor de RRHH",
  admin: "Administrador",
};

export default function AdministracionPage() {
  const { tab = "usuarios" } = useParams();
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="Administración" subtitle="Usuarios, áreas y configuración del sistema." />
      <div className="mb-5 flex gap-1 border-b border-[var(--content-border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/administracion/${t.id}`)}
            className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id ? "text-accent" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>

      {tab === "usuarios" && <UsuariosTab />}
      {tab === "areas" && <AreasTab />}
      {tab === "configuracion" && <ConfiguracionTab />}
    </div>
  );
}

function UsuariosTab() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revealedLink, setRevealedLink] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Invitar
        </button>
      </div>
      <Plate className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
              <th className="px-3 py-2.5 font-medium">Nombre</th>
              <th className="px-3 py-2.5 font-medium">Área</th>
              <th className="px-3 py-2.5 font-medium">Rol</th>
              <th className="px-3 py-2.5 font-medium">Supervisor</th>
              <th className="px-3 py-2.5 font-medium">Acceso global</th>
              <th className="px-3 py-2.5 font-medium">Estado</th>
              <th className="px-3 py-2.5 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((u) => (
              <tr key={u.id} className="border-b border-[var(--content-border)] last:border-0">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={u.name} initials={u.initials} size="sm" />
                    <div>
                      <p className="text-[var(--content-ink)]">{u.name}</p>
                      <p className="text-xs text-[var(--content-ink-dim)]">{u.name.toLowerCase().replace(" ", ".")}@tekzaya.com</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-[var(--content-ink-dim)]">{AREAS.find((a) => a.id === u.areaId)?.name}</td>
                <td className="px-3 py-2.5 text-[var(--content-ink-dim)]">{ROLE_LABEL[u.role]}</td>
                <td className="px-3 py-2.5">{u.role === "area_supervisor" ? <CheckIcon className="text-green" /> : "—"}</td>
                <td className="px-3 py-2.5">{u.role === "admin" || u.role === "hr_supervisor" ? <CheckIcon className="text-green" /> : "—"}</td>
                <td className="px-3 py-2.5">
                  <span className="rounded-full bg-[var(--content-bg)] px-2 py-0.5 text-xs text-[var(--content-ink-dim)]">Activo</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button className="text-accent hover:underline">Editar</button>
                    <button className="text-[var(--content-ink-dim)] hover:underline">Desactivar</button>
                    <button onClick={() => setRevealedLink(u.id)} className="text-[var(--content-ink-dim)] hover:underline">
                      Restablecer contraseña
                    </button>
                  </div>
                  {revealedLink === u.id && (
                    <p className="mt-1 truncate rounded bg-[var(--content-bg)] px-2 py-1 font-display text-[10px] tabular text-[var(--content-ink-dim)]">
                      tekzaya.app/reset/{u.id}-8f2a1c
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Plate>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invitar usuario"
        footer={
          <>
            <button onClick={() => setInviteOpen(false)} className="rounded-lg px-3 py-2 text-sm text-[var(--content-ink-dim)] hover:bg-[var(--content-bg)]">
              Cancelar
            </button>
            <button onClick={() => setInviteOpen(false)} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white">
              Generar enlace de invitación
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Nombre completo" placeholder="Ej. Rosa Delgado" />
          <Field label="Correo" placeholder="rosa.delgado@empresa.com" type="email" />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Área</label>
            <select className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]">
              {AREAS.map((a) => (
                <option key={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">Rol</label>
            <select className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]">
              <option>Empleado</option>
              <option>Supervisor de área</option>
              <option>Supervisor de RRHH</option>
              <option>Administrador</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AreasTab() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {AREAS.map((a) => {
        const supervisors = USERS.filter((u) => u.areaId === a.id && (u.role === "area_supervisor" || u.role === "admin"));
        return (
          <Plate key={a.id} className="p-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: a.color }} />
              <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">{a.name}</h3>
            </div>
            <p className="mt-1 text-xs text-[var(--content-ink-dim)]">
              Supervisores: {supervisors.map((s) => s.name).join(", ") || "sin asignar"}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.categories.map((c) => (
                <span key={c} className="rounded-full border border-[var(--content-border)] px-2 py-0.5 text-xs text-[var(--content-ink-dim)]">
                  {c}
                </span>
              ))}
              <button className="flex items-center gap-1 rounded-full border border-dashed border-[var(--content-border)] px-2 py-0.5 text-xs text-accent">
                <PlusIcon className="h-3 w-3" /> Categoría
              </button>
            </div>
          </Plate>
        );
      })}
    </div>
  );
}

const DAY_LABEL: Record<number, string> = {
  1: "L",
  2: "M",
  3: "X",
  4: "J",
  5: "V",
  6: "S",
  7: "D",
};

const AI_LABEL: Record<keyof Settings["aiEnabled"], string> = {
  suggestArea: "Sugerir área al crear un ticket",
  classify: "Clasificar prioridad y categoría",
  summary: "Resumir la conversación",
  autocomplete: "Autocompletar respuestas",
  detectIncidents: "Detectar incidentes",
};

/** Los plazos se guardan en minutos y se editan en horas: nadie piensa en 1440. */
const toHours = (minutes: number): string => String(Math.round((minutes / 60) * 100) / 100);
const toMinutes = (hours: string): number => Math.max(1, Math.round(Number(hours) * 60));

function ConfiguracionTab() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: settingsKey, queryFn: getSettings });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newHoliday, setNewHoliday] = useState("");

  // El borrador arranca del servidor y solo se reemplaza cuando llega otro
  // distinto, para no pisar lo que el administrador está escribiendo.
  const [loadedFrom, setLoadedFrom] = useState<Settings | null>(null);
  if (settings && settings !== loadedFrom) {
    setLoadedFrom(settings);
    setDraft(structuredClone(settings));
  }

  const save = useMutation({
    mutationFn: () => updateSettings(draft!),
    onSuccess: async (saved) => {
      setError(null);
      queryClient.setQueryData(settingsKey, saved);
      await queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
    onError: (cause) => setError(cause.message),
  });

  if (isLoading || !draft) {
    return (
      <Plate className="flex items-center justify-center py-16">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent"
          aria-label="Cargando configuración"
        />
      </Plate>
    );
  }

  const patch = (change: Partial<Settings>) => setDraft({ ...draft, ...change });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Plate className="space-y-3 p-4">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          SLA por prioridad (horas laborables)
        </h3>
        {PRIORITIES.map((priority) => {
          const policy = draft.slaPolicies[priority]!;
          return (
            <div key={priority} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-16 text-[var(--content-ink-dim)]">
                {PRIORITY_LABEL[priority]}
              </span>
              <input
                type="number"
                step="0.25"
                min="0.25"
                value={toHours(policy.responseMinutes)}
                onChange={(event) =>
                  patch({
                    slaPolicies: {
                      ...draft.slaPolicies,
                      [priority]: {
                        ...policy,
                        responseMinutes: toMinutes(event.target.value),
                      },
                    },
                  })
                }
                aria-label={`Primera respuesta para prioridad ${PRIORITY_LABEL[priority]}`}
                className="w-20 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]"
              />
              <span className="text-xs text-[var(--content-ink-dim)]">1.ª resp.</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={toHours(policy.resolutionMinutes)}
                onChange={(event) =>
                  patch({
                    slaPolicies: {
                      ...draft.slaPolicies,
                      [priority]: {
                        ...policy,
                        resolutionMinutes: toMinutes(event.target.value),
                      },
                    },
                  })
                }
                aria-label={`Resolución para prioridad ${PRIORITY_LABEL[priority]}`}
                className="w-20 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]"
              />
              <span className="text-xs text-[var(--content-ink-dim)]">resolución</span>
            </div>
          );
        })}
        <p className="text-xs text-[var(--content-ink-dim)]">
          El cambio afecta a los tickets nuevos. Los que ya existen conservan el plazo con el que
          nacieron, para que una edición no los venza de golpe.
        </p>
      </Plate>

      <Plate className="space-y-3 p-4">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          Jornada laboral
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7].map((day) => {
            const active = draft.businessHours.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  patch({
                    businessHours: {
                      ...draft.businessHours,
                      days: active
                        ? draft.businessHours.days.filter((value) => value !== day)
                        : [...draft.businessHours.days, day].sort((a, b) => a - b),
                    },
                  })
                }
                className={`h-8 w-8 rounded-lg border text-xs font-medium transition-colors ${
                  active
                    ? "border-accent bg-accent text-white"
                    : "border-[var(--content-border)] text-[var(--content-ink-dim)]"
                }`}
              >
                {DAY_LABEL[day]}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="time"
            value={draft.businessHours.start}
            onChange={(event) =>
              patch({ businessHours: { ...draft.businessHours, start: event.target.value } })
            }
            aria-label="Hora de apertura"
            className="rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]"
          />
          <span className="text-[var(--content-ink-dim)]">a</span>
          <input
            type="time"
            value={draft.businessHours.end}
            onChange={(event) =>
              patch({ businessHours: { ...draft.businessHours, end: event.target.value } })
            }
            aria-label="Hora de cierre"
            className="rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-1.5 text-[var(--content-ink)]"
          />
        </div>
        <Field
          label="Zona horaria de la empresa"
          value={draft.businessHours.timezone}
          onChange={(event) =>
            patch({ businessHours: { ...draft.businessHours, timezone: event.target.value } })
          }
        />
        <p className="text-xs text-[var(--content-ink-dim)]">
          Es la zona en la que corre el reloj del SLA, igual para todo el equipo. Cada persona ve
          las fechas en su propio reloj.
        </p>
      </Plate>

      <Plate className="space-y-3 p-4">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          Días festivos
        </h3>
        <div className="flex gap-2">
          <input
            type="date"
            value={newHoliday}
            onChange={(event) => setNewHoliday(event.target.value)}
            aria-label="Nuevo día festivo"
            className="flex-1 rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]"
          />
          <button
            type="button"
            disabled={!newHoliday || draft.holidays.includes(newHoliday)}
            onClick={() => {
              patch({ holidays: [...draft.holidays, newHoliday].sort() });
              setNewHoliday("");
            }}
            className="flex items-center gap-1 rounded-lg border border-[var(--content-border)] px-3 py-2 text-xs font-medium text-[var(--content-ink)] disabled:opacity-40"
          >
            <PlusIcon className="h-3.5 w-3.5" /> Añadir
          </button>
        </div>
        {draft.holidays.length === 0 ? (
          <p className="text-xs text-[var(--content-ink-dim)]">
            Sin festivos: el SLA solo salta los fines de semana.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {draft.holidays.map((holiday) => (
              <li
                key={holiday}
                className="flex items-center gap-1.5 rounded-full border border-[var(--content-border)] px-2.5 py-1 text-xs text-[var(--content-ink)]"
              >
                {holiday}
                <button
                  type="button"
                  onClick={() =>
                    patch({ holidays: draft.holidays.filter((value) => value !== holiday) })
                  }
                  aria-label={`Quitar ${holiday}`}
                  className="text-[var(--content-ink-dim)] hover:text-red"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Plate>

      <Plate className="space-y-3 p-4">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          Cierres automáticos (días hábiles)
        </h3>
        <Field
          label="Cerrar un ticket resuelto tras"
          type="number"
          min="1"
          value={String(draft.autoCloseResolvedDays)}
          onChange={(event) => patch({ autoCloseResolvedDays: Number(event.target.value) })}
        />
        <Field
          label="Recordar al solicitante en espera tras"
          type="number"
          min="1"
          value={String(draft.onHoldReminderDays)}
          onChange={(event) => patch({ onHoldReminderDays: Number(event.target.value) })}
        />
        <Field
          label="Cerrar un ticket en espera tras"
          type="number"
          min="1"
          value={String(draft.onHoldAutoCloseDays)}
          onChange={(event) => patch({ onHoldAutoCloseDays: Number(event.target.value) })}
        />
      </Plate>

      <Plate className="space-y-2 p-4 lg:col-span-2">
        <h3 className="font-display text-sm font-semibold text-[var(--content-ink)]">
          Funciones de inteligencia artificial
        </h3>
        <p className="mb-1 text-xs text-[var(--content-ink-dim)]">
          Apagarlas no rompe nada: el ticket se crea igual, con el área elegida a mano.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(AI_LABEL) as (keyof Settings["aiEnabled"])[]).map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-3 rounded-lg bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]"
            >
              {AI_LABEL[key]}
              <input
                type="checkbox"
                checked={draft.aiEnabled[key]}
                onChange={(event) =>
                  patch({ aiEnabled: { ...draft.aiEnabled, [key]: event.target.checked } })
                }
                className="h-4 w-4 accent-accent"
              />
            </label>
          ))}
        </div>
      </Plate>

      <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-dim disabled:opacity-60"
        >
          {save.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
        {save.isSuccess && !save.isPending && (
          <span className="flex items-center gap-1 text-xs text-green">
            <CheckIcon className="h-3.5 w-3.5" /> Cambios guardados.
          </span>
        )}
        {error && (
          <span role="alert" className="text-xs text-red">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
        {label}
      </label>
      <input
        {...rest}
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />
    </div>
  );
}
