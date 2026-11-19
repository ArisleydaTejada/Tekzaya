import { DEMO_MODULE_LABELS, DEMO_MODULES, demoRequestInput, type DemoModule } from "@tekzaya/shared";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { ApiRequestError } from "../../api/client";
import { requestDemo } from "../../api/demo";
import { Modal } from "../Modal";
import { AlertIcon, CheckIcon } from "../icons";

const FIELDS = ["name", "email", "company", "module", "message"] as const;

type Fields = (typeof FIELDS)[number];

type FieldErrors = Partial<Record<Fields, string>>;

function isField(key: unknown): key is Fields {
  return FIELDS.some((field) => field === key);
}

/** Lo escrito en el formulario, antes de pasar por el esquema que comparte con la API. */
interface DemoDraft {
  name: string;
  email: string;
  company: string;
  module: DemoModule;
  message?: string;
  website?: string;
}

interface ControlProps {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
  className: string;
}

const MODULE_HINT: Record<DemoModule, string> = {
  tickets: "Mesa de ayuda por áreas",
  maintenance: "Activos, órdenes y repuestos",
  both: "Los dos, conectados",
};

const inputClass =
  "w-full rounded-lg border bg-[var(--content-surface)] px-3 py-2.5 text-sm text-[var(--content-ink)] transition-colors focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30";

function FormField({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string | undefined;
  children: (props: ControlProps) => ReactNode;
}) {
  const id = useId();

  const control: ControlProps = {
    id,
    "aria-invalid": Boolean(error),
    className: `${inputClass} ${error ? "border-red" : "border-[var(--field-border)]"}`,
  };

  if (error) control["aria-describedby"] = `${id}-error`;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[var(--content-ink)]">
        {label}
        {optional && <span className="font-normal text-[var(--content-ink-dim)]"> (opcional)</span>}
      </label>
      {children(control)}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * El formulario de demo. Valida con el mismo esquema que la API y guarda en el
 * servidor; quien atiende la demo recibe el aviso en la campana.
 */
export function DemoRequestDialog({
  open,
  initialModule,
  onClose,
}: {
  open: boolean;
  initialModule: DemoModule;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [module, setModule] = useState<DemoModule>(initialModule);
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const legendId = useId();

  const mutation = useMutation({ mutationFn: requestDemo });
  const { reset } = mutation;

  // Cada apertura parte del plan desde el que se pidió; lo escrito se conserva.
  useEffect(() => {
    if (open) {
      setModule(initialModule);
      reset();
    }
  }, [open, initialModule, reset]);

  // El modal compartido no escucha Escape; aquí sí se cierra con él.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (mutation.isPending) return;

    const draft: DemoDraft = { name, email, company, module };

    if (message.trim()) draft.message = message;

    if (website) draft.website = website;

    const parsed = demoRequestInput.safeParse(draft);

    if (!parsed.success) {
      const next: FieldErrors = {};

      for (const issue of parsed.error.issues) {
        const field = issue.path[0];

        if (isField(field)) next[field] ??= issue.message;
      }

      setErrors(next);

      return;
    }

    setErrors({});
    mutation.mutate(parsed.data, {
      onError: (error) => {
        if (!(error instanceof ApiRequestError) || !Object.keys(error.fields).length) return;

        const next: FieldErrors = {};

        for (const [field, messages] of Object.entries(error.fields)) {
          if (isField(field) && messages[0]) next[field] = messages[0];
        }

        setErrors(next);
      },
    });
  }

  const serverError =
    mutation.isError && !Object.keys(errors).length
      ? mutation.error instanceof ApiRequestError
        ? mutation.error.message
        : "No pudimos enviar la solicitud. Revisa tu conexión e inténtalo de nuevo."
      : null;

  return (
    <Modal open={open} onClose={onClose} title="Solicitar demo">
      {mutation.isSuccess ? (
        <div className="py-2" role="status">
          <p className="flex items-center gap-2 font-display text-base font-semibold text-[var(--content-ink)]">
            <CheckIcon className="text-green" aria-hidden="true" />
            Recibimos tu solicitud
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--content-ink-dim)]">
            Te escribimos a <span className="font-semibold text-[var(--content-ink)]">{email.trim()}</span> para
            acordar el día de la demo de {DEMO_MODULE_LABELS[module]}.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dim"
          >
            Cerrar
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-sm text-[var(--content-ink-dim)]">
            Te mostramos el módulo con datos de ejemplo y te enviamos el precio para tu equipo.
          </p>

          <FormField label="Nombre" error={errors.name}>
            {(props) => (
              <input {...props} autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            )}
          </FormField>
          <FormField label="Correo de trabajo" error={errors.email}>
            {(props) => (
              <input
                {...props}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            )}
          </FormField>
          <FormField label="Empresa" error={errors.company}>
            {(props) => (
              <input
                {...props}
                autoComplete="organization"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            )}
          </FormField>

          <fieldset aria-labelledby={legendId}>
            <legend id={legendId} className="mb-1.5 text-sm font-medium text-[var(--content-ink)]">
              Módulo que te interesa
            </legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {DEMO_MODULES.map((option) => (
                <label
                  key={option}
                  className={`flex min-h-11 flex-col justify-center rounded-lg border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                    module === option
                      ? "border-accent bg-accent/10 text-[var(--content-ink)]"
                      : "border-[var(--content-border)] text-[var(--content-ink)] hover:border-[var(--field-border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="module"
                    value={option}
                    checked={module === option}
                    onChange={() => setModule(option)}
                    className="sr-only"
                  />
                  <span className="font-semibold">{DEMO_MODULE_LABELS[option]}</span>
                  {/* Sobre el tinte de la opción elegida, el gris secundario no llega a 4,5:1 en oscuro. */}
                  <span
                    className={`text-xs ${module === option ? "text-[var(--content-ink)]" : "text-[var(--content-ink-dim)]"}`}
                  >
                    {MODULE_HINT[option]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <FormField label="¿Qué quieres resolver?" optional error={errors.message}>
            {(props) => (
              <textarea {...props} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
            )}
          </FormField>

          {/* Trampa para robots: invisible y fuera del orden de tabulación. */}
          <div aria-hidden="true" className="sr-only">
            <label>
              Sitio web
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </label>
          </div>

          {serverError && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-red/10 px-3 py-2.5 text-sm text-red">
              <AlertIcon className="mt-0.5 shrink-0" aria-hidden="true" />
              {serverError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-lg border border-[var(--content-border)] px-4 py-2.5 text-sm font-medium text-[var(--content-ink)] transition-colors hover:bg-[var(--content-bg)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="min-h-11 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dim disabled:opacity-60"
            >
              {mutation.isPending ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
