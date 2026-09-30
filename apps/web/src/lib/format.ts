/**
 * Las fechas llegan en ISO y UTC; se muestran en el reloj de quien mira. La
 * jornada laboral del SLA es única para toda la empresa, pero cada persona ve
 * las horas en su propia zona (ver `settings.businessHours`).
 */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (new Date(now).toDateString() === date.toDateString()) {
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return "justo ahora";
    if (minutes < 60) return `hace ${minutes} min`;
    return `hace ${Math.floor(minutes / 60)} h`;
  }
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "en 3 h", "hace 2 d": lo que queda (o lo que se pasó) de un plazo de SLA. */
export function formatDeadline(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const overdue = diffMs < 0;
  const minutes = Math.round(Math.abs(diffMs) / 60_000);

  const amount =
    minutes < 60
      ? `${minutes} min`
      : minutes < 60 * 48
        ? `${Math.round(minutes / 60)} h`
        : `${Math.round(minutes / 1440)} d`;

  return overdue ? `hace ${amount}` : `en ${amount}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
