/**
 * Piezas comunes de los modales de asignación: la barra de carga y la etiqueta de
 * ausencia. Quien está ausente no recibe tickets, así que su barra va en gris
 * —su carga no compite en el reparto— y la etiqueta lo dice sin tener que leer
 * la columna de la derecha.
 */

export function LoadBar({ load, peak, away }: { load: number; peak: number; away: boolean }) {
  // La barra se mide contra la persona más cargada del área: importa el reparto relativo.
  const ratio = load / peak;
  const tone = away ? "bg-[var(--content-ink-dim)]" : ratio > 0.75 ? "bg-red" : ratio > 0.4 ? "bg-amber" : "bg-green";
  return (
    <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-[var(--content-border)]">
      <span
        className={`block h-full rounded-full ${tone} ${away ? "opacity-50" : ""}`}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </span>
  );
}

export function AwayTag({ awayUntil }: { awayUntil?: string | undefined }) {
  const until = awayUntil
    ? new Date(awayUntil).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
    : null;
  return (
    <span
      className="shrink-0 rounded-full border border-[var(--content-border)] bg-[var(--content-bg)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--content-ink-dim)]"
      title="No se le pueden asignar tickets mientras esté ausente"
    >
      Ausente{until ? ` hasta ${until}` : ""}
    </span>
  );
}
