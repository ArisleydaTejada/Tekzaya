import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  icon: ReactNode;
  error?: string;
  revealable?: boolean;
}

export function Field({ label, icon, error, revealable = false, type = "text", className = "", ...rest }: FieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const resolvedType = revealable ? (revealed ? "text" : "password") : type;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-placard-ink-dim">
        {label}
      </label>
      <div
        className={`flex items-center gap-2.5 rounded-xl border bg-placard-surface px-3.5 py-2.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25 ${
          error ? "border-red" : "border-placard-border"
        }`}
      >
        <span className="text-placard-ink-dim/70" aria-hidden="true">
          {icon}
        </span>
        <input
          id={id}
          type={resolvedType}
          className="w-full bg-transparent text-sm text-placard-ink outline-none placeholder:text-placard-ink-dim/60"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          {...rest}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="text-placard-ink-dim/70 transition-colors hover:text-placard-ink"
            aria-label={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={revealed}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red">
          {error}
        </p>
      )}
    </div>
  );
}
