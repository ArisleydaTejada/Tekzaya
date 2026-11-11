import type { MeasureUnit } from "@tekzaya/shared";
import type { CSSProperties } from "react";

/**
 * Los colores se leen de los tokens de `index.css` para seguir al tema. Los respaldos cubren
 * el `getComputedStyle` vacío antes de aplicar el tema o en pruebas sin estilos.
 */
export interface ChartTheme {
  categorical: string[];
  compare: string;
  grid: string;
  axis: string;
  surface: string;
  ink: string;
  border: string;
}

const LIGHT: ChartTheme = {
  categorical: ["#58479d", "#2f6fcb", "#d6449c", "#0e9c8e", "#c67f1e", "#7c8cae", "#8a6d1e"],
  compare: "#9aa3b2",
  grid: "#dbe0e9",
  axis: "#5b6472",
  surface: "#ffffff",
  ink: "#12141a",
  border: "#dbe0e9",
};

const DARK: ChartTheme = {
  categorical: ["#b5a3cf", "#5b8fe0", "#c24e8e", "#1d9a78", "#e0a24a", "#9aa8c4", "#c9a646"],
  compare: "#6b7384",
  grid: "#3a3444",
  axis: "#948da3",
  surface: "#292432",
  ink: "#f5f3f7",
  border: "#3a3444",
};

export function readChartTheme(mode: "light" | "dark"): ChartTheme {
  const fallback = mode === "dark" ? DARK : LIGHT;

  if (typeof window === "undefined") return fallback;

  const computed = getComputedStyle(document.documentElement);

  const token = (name: string, instead: string): string =>
    computed.getPropertyValue(name).trim() || instead;

  return {
    categorical: fallback.categorical.map((instead, index) =>
      token(`--chart-cat-${index + 1}`, instead),
    ),
    compare: token("--chart-compare", fallback.compare),
    grid: token("--chart-grid", fallback.grid),
    axis: token("--chart-axis", fallback.axis),
    surface: token("--content-surface", fallback.surface),
    ink: token("--content-ink", fallback.ink),
    border: token("--content-border", fallback.border),
  };
}

export function tooltipStyle(theme: ChartTheme): CSSProperties {
  return {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    fontSize: 12,
    color: theme.ink,
  };
}

/** El resalte de Recharts (`#ccc`) es un bloque blanco en oscuro; este sale del color de la cuadrícula. */
export function hoverCursor(theme: ChartTheme, kind: "band" | "line") {
  return kind === "band"
    ? { fill: theme.grid, fillOpacity: 0.45 }
    : { stroke: theme.axis, strokeOpacity: 0.5, strokeDasharray: "3 3" };
}

/** El formato es parte de la medida: 94 puede ser tickets o 94 % de cumplimiento. */
export function formatValue(value: number | null, unit: MeasureUnit, currency?: string): string {
  if (value === null) return "—";

  switch (unit) {
    case "money":
      // Montos en unidades de la moneda; sin decimales a partir de mil, que en una
      // tarjeta no aportan nada.
      return `${currency ?? ""} ${value.toLocaleString("es-MX", {
        minimumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
        maximumFractionDigits: Math.abs(value) >= 1000 ? 0 : 2,
      })}`.trim();
    case "count":
      return Number.isInteger(value) ? String(value) : formatNumber(value);
    case "hours":
      return `${formatNumber(value)} h`;
    case "percent":
      return `${Math.round(value)} %`;
    case "rating":
      return formatNumber(value);
    case "days":
      return `${formatNumber(value)} d`;
  }
}

/** Compacto para un eje, donde no cabe la unidad. */
export function formatAxis(value: number, unit: MeasureUnit): string {
  if (unit === "percent") return `${Math.round(value)}%`;

  if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10} k`;

  return formatNumber(value);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

/**
 * El color no lo decide el signo sino `higherIsBetter`: más resueltos es bueno, más vencidos no
 * (spec §7.8.2).
 */
export function trendOf(
  current: number | null,
  previous: number | null,
): { value: number } | undefined {
  if (current === null || previous === null || previous === 0) return undefined;
  const change = ((current - previous) / Math.abs(previous)) * 100;

  if (!Number.isFinite(change)) return undefined;

  return { value: Math.round(change) };
}
