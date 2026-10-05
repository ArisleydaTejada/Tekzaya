import type { MeasureUnit } from "@tekzaya/shared";

/**
 * Los colores viven en `index.css` como tokens, uno por tema, y aquí solo se leen: así
 * una gráfica nunca se queda con el color del tema anterior al cambiar de claro a
 * oscuro, y el sistema de diseño sigue teniendo un único sitio donde cambiarlos.
 *
 * Los valores de respaldo existen porque `getComputedStyle` devuelve cadena vacía
 * cuando el token no está resuelto —en una prueba sin hoja de estilos, o en el primer
 * pintado antes de que se aplique el tema— y una gráfica sin color es una gráfica
 * ilegible, no una gráfica con el color por defecto.
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
  categorical: ["#6c5ce7", "#1f9a63", "#2f6fcb", "#d6449c", "#0e9c8e", "#c67f1e", "#7c8cae"],
  compare: "#9aa3b2",
  grid: "#dbe0e9",
  axis: "#5b6472",
  surface: "#ffffff",
  ink: "#12141a",
  border: "#dbe0e9",
};

const DARK: ChartTheme = {
  categorical: ["#8b7cf6", "#2fa374", "#5b8fe0", "#c24e8e", "#1d9a78", "#e0a24a", "#9aa8c4"],
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

export function tooltipStyle(theme: ChartTheme): Record<string, string | number> {
  return {
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 8,
    fontSize: 12,
    color: theme.ink,
  };
}

/**
 * Un número con su unidad. El formato es parte de la medida, no de la gráfica: 94
 * puede ser noventa y cuatro tickets o el 94 % de cumplimiento, y la diferencia
 * importa en la tarjeta, en la tabla, en el CSV y en el tooltip.
 */
export function formatValue(value: number | null, unit: MeasureUnit): string {
  if (value === null) return "—";
  switch (unit) {
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
 * Variación frente al término de comparación. El signo no decide el color: lo decide si
 * esa medida mejora al subir (más resueltos es bueno, más vencidos no), que es lo que
 * dice `higherIsBetter` (spec §7.8.2).
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
