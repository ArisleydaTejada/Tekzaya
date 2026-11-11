import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Plate } from "./Plate";

export interface ReadoutProps {
  label: string;
  value: string;
  caption?: ReactNode;
  icon?: ReactNode;
  /** Si lleva a su lista, toda la fila es el enlace. */
  to?: string;
}

/**
 * Las lecturas que acompañan al dial: una lista compacta sobre una sola placa, no una
 * tarjeta por número. Así miden lo mismo que el dial y no dejan un hueco bajo cada cifra.
 */
export function Readouts({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Plate className={`flex flex-col divide-y divide-[var(--content-border)] overflow-hidden ${className}`}>{children}</Plate>;
}

export function Readout({ label, value, caption, icon, to }: ReadoutProps) {
  const body = (
    <>
      {icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--content-border)] text-[var(--content-ink-dim)]" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-[var(--content-ink)]">{label}</span>
        {caption && <span className="block text-xs text-[var(--content-ink-dim)]">{caption}</span>}
      </span>
      <span className="shrink-0 font-display text-2xl font-semibold tabular leading-none text-[var(--content-ink)]">{value}</span>
    </>
  );

  const row = "flex flex-1 items-center gap-3 px-4 py-3";

  return to ? (
    <Link to={to} className={`${row} transition-colors hover:bg-[var(--content-bg)]`}>
      {body}
    </Link>
  ) : (
    <div className={row}>{body}</div>
  );
}
