import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Tarjeta de un registro vinculado (equipo, orden, ticket). Con `to`, toda ella es el
 * enlace; sin él, quien mira no puede abrirlo y queda como ficha.
 */
export function RecordCard({ to, children }: { to?: string | undefined; children: ReactNode }) {
  const base = "block rounded-lg border border-[var(--content-border)] bg-[var(--content-bg)] p-2.5";

  if (!to) return <div className={base}>{children}</div>;

  return (
    <Link to={to} className={`${base} transition-colors hover:border-accent/50 hover:bg-accent/5`}>
      {children}
    </Link>
  );
}
