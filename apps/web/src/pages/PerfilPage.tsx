import {
  AVAILABILITY_STATE_LABEL,
  AWAY_REASON_LABEL,
  AWAY_REASONS,
  changePasswordInput,
  initialsOf,
  roleLabelOf,
  updateProfileInput,
  type AwayReason,
} from "@tekzaya/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { changeMyPassword, updateMyAvailability, updateMyProfile } from "../api/auth";
import { ME_QUERY_KEY, useAuth } from "../auth/AuthContext";
import { Avatar } from "../components/Avatar";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { CheckIcon } from "../components/icons";
import { formatWhen } from "../lib/format";

/**
 * «Administrar perfil»: lo que cada persona decide de sí misma. El área, el rol
 * y el correo se muestran pero no se editan — los lleva quien administra, y
 * dejarlos aquí haría creer que se pueden cambiar pidiéndolo a la pantalla.
 */
export default function PerfilPage() {
  const { me } = useAuth();
  if (!me) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Mi perfil"
        subtitle="Tus datos, tu disponibilidad y tu contraseña."
      />

      <div className="flex flex-col gap-4">
        <IdentityCard />
        <AvailabilityCard />
        <PasswordCard />
      </div>
    </div>
  );
}

/** Estado de guardado compartido por las tres tarjetas, sin librerías de más. */
function Saved({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-green">
      <CheckIcon className="h-3.5 w-3.5" /> Guardado
    </span>
  );
}

function IdentityCard() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(me?.name ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => updateMyProfile({ name: name.trim() }),
    onSuccess: (updated) => {
      setError(null);
      queryClient.setQueryData(ME_QUERY_KEY, updated);
    },
    onError: (cause: Error) => setError(cause.message),
  });

  if (!me) return null;

  const parsed = updateProfileInput.safeParse({ name: name.trim() });
  const issue = parsed.success ? null : parsed.error.issues[0]!.message;
  const changed = name.trim() !== me.name;

  return (
    <Plate className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
          Datos
        </h2>
        <Saved shown={save.isSuccess && !changed} />
      </div>

      <div className="flex items-center gap-4">
        <Avatar name={me.name} initials={initialsOf(me.name)} size="md" />
        <div className="min-w-0 flex-1">
          <label
            htmlFor="nombre"
            className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]"
          >
            Nombre
          </label>
          <input
            id="nombre"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            className="w-full max-w-sm rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          {issue && changed && <p className="mt-1.5 text-xs text-red">{issue}</p>}
        </div>
      </div>

      <dl className="mt-5 grid gap-3 border-t border-[var(--content-border)] pt-4 text-sm sm:grid-cols-2">
        <Field label="Correo" value={me.email} />
        <Field label="Área" value={me.areaName} />
        <Field label="Rol" value={roleLabelOf(me)} />
        <Field
          label="Último acceso"
          value={me.lastLoginAt ? formatWhen(me.lastLoginAt) : "—"}
        />
      </dl>
      <p className="mt-3 text-xs text-[var(--content-ink-dim)]">
        El correo, el área y el rol los administra el equipo de sistemas o de RRHH.
      </p>

      {error && <p className="mt-3 text-sm text-red">{error}</p>}

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={!changed || !parsed.success || save.isPending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {save.isPending ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </Plate>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--content-ink-dim)]">{label}</dt>
      <dd className="text-[var(--content-ink)]">{value}</dd>
    </div>
  );
}

/**
 * La misma disponibilidad que el menú de la cabecera, pero con el motivo y la
 * fecha de vuelta: ahí se marca ausente de un clic, y aquí se explica.
 */
function AvailabilityCard() {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const away = me?.availability.state === "away";
  const [reason, setReason] = useState<AwayReason>(me?.availability.reason ?? "other");
  const [until, setUntil] = useState(me?.availability.awayUntil?.slice(0, 10) ?? "");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (next: "available" | "away") =>
      updateMyAvailability(
        next === "away"
          ? {
              state: "away",
              reason,
              // El selector da un día; el contrato pide un instante.
              ...(until ? { awayUntil: new Date(`${until}T23:59:59`).toISOString() } : {}),
            }
          : { state: "available" },
      ),
    onSuccess: (updated) => {
      setError(null);
      queryClient.setQueryData(ME_QUERY_KEY, updated);
    },
    onError: (cause: Error) => setError(cause.message),
  });

  if (!me) return null;

  return (
    <Plate className="p-5">
      <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
        Disponibilidad
      </h2>

      <p className="flex items-center gap-2 text-sm text-[var(--content-ink)]">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${away ? "bg-amber" : "bg-green"}`}
          aria-hidden="true"
        />
        {AVAILABILITY_STATE_LABEL[me.availability.state]}
        {me.availability.awayUntil && (
          <span className="text-[var(--content-ink-dim)]">
            · hasta {new Date(me.availability.awayUntil).toLocaleDateString("es-MX")}
          </span>
        )}
      </p>

      {!away && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor="motivo"
              className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]"
            >
              Motivo
            </label>
            <select
              id="motivo"
              value={reason}
              onChange={(event) => setReason(event.target.value as AwayReason)}
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]"
            >
              {AWAY_REASONS.map((item) => (
                <option key={item} value={item}>
                  {AWAY_REASON_LABEL[item]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="hasta"
              className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]"
            >
              Hasta <span className="font-normal">(opcional)</span>
            </label>
            <input
              id="hasta"
              type="date"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)]"
            />
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red">{error}</p>}

      <p className="mt-3 text-xs text-[var(--content-ink-dim)]">
        Marcarte ausente con tickets sin resolver avisa a tu supervisor: alguien tiene que
        cubrirlos mientras no estés.
      </p>

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => save.mutate(away ? "available" : "away")}
          disabled={save.isPending}
          className="rounded-lg border border-[var(--content-border)] px-4 py-2 text-sm font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:opacity-50"
        >
          {away ? "Volví: marcarme disponible" : "Marcarme como ausente"}
        </button>
      </div>
    </Plate>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => changeMyPassword({ currentPassword: current, password: next }),
    onSuccess: () => {
      setError(null);
      setCurrent("");
      setNext("");
      setRepeat("");
    },
    onError: (cause: Error) => setError(cause.message),
  });

  const parsed = changePasswordInput.safeParse({ currentPassword: current, password: next });
  const rule = next && !parsed.success ? parsed.error.issues[0]!.message : null;
  const mismatch = repeat.length > 0 && repeat !== next;

  return (
    <Plate className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-[var(--content-ink)]">
          Contraseña
        </h2>
        <Saved shown={save.isSuccess && current === ""} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <PasswordField label="Actual" value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField label="Nueva" value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField label="Repite la nueva" value={repeat} onChange={setRepeat} autoComplete="new-password" />
      </div>

      <p className="mt-2 text-xs text-[var(--content-ink-dim)]">
        Al menos 10 caracteres, combinando letras y números.
      </p>
      {rule && <p className="mt-1.5 text-xs text-red">{rule}</p>}
      {mismatch && <p className="mt-1.5 text-xs text-red">Las dos contraseñas nuevas no coinciden.</p>}
      {error && <p className="mt-3 text-sm text-red">{error}</p>}

      <div className="mt-4 flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={!parsed.success || mismatch || repeat !== next || save.isPending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {save.isPending ? "Cambiando…" : "Cambiar contraseña"}
        </button>
      </div>
    </Plate>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-[var(--content-ink-dim)]">
        {label}
      </label>
      <input
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] px-3 py-2 text-sm text-[var(--content-ink)] outline-none focus:border-accent"
      />
    </div>
  );
}
