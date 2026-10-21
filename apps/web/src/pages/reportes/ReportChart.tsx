import { MEASURE_META, type ReportQueryResult, type ReportWidget } from "@tekzaya/shared";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatTile } from "../../components/StatTile";
import { ChartIcon } from "../../components/icons";
import { useTheme } from "../../theme/ThemeContext";
import { formatAxis, formatValue, hoverCursor, readChartTheme, tooltipStyle, trendOf } from "./chartTheme";

/**
 * Una gráfica, los once tipos del spec §7.8.6. El servidor manda filas ya agrupadas y
 * etiquetadas, así que aquí no se calcula nada: solo se elige la forma. Es lo que
 * permite que la misma consulta alimente una dona o una tabla sin tocar el backend.
 */
export function ReportChart({
  widget,
  result,
  height = 240,
  onSelect,
}: {
  widget: ReportWidget;
  result: ReportQueryResult;
  height?: number;
  /** Clave del grupo pulsado: una barra, una porción o un segmento (spec §7.8.2). */
  onSelect?: (key: string) => void;
}) {
  /**
   * Recharts reenvía el dato de la barra o la porción pulsada, pero cada tipo de
   * gráfica lo envuelve a su manera —una barra llega plana, una porción dentro de
   * `payload`— y lo tipa con su propia forma. La clave del grupo viaja como `groupKey`
   * (`key` lo reserva React) y se busca en los tres sitios posibles.
   */
  const clickHandler = onSelect
    ? {
        onClick: (entry: unknown) => {
          const key = groupKeyOf(entry);
          if (key) onSelect(key);
        },
        cursor: "pointer",
      }
    : {};

  // Los colores son tokens de CSS, así que se vuelven a leer en cada render: cambiar de
  // tema repinta la gráfica sin tener que invalidar nada. Son siete lecturas sobre
  // `:root`, y este componente solo se renderiza cuando cambian sus props o el tema.
  const { theme: mode } = useTheme();
  const theme = readChartTheme(mode);
  const units = result.measures.map((measure) => measure.unit);
  const unit = units[0]!;

  if (!result.rows.length) {
    return <Empty />;
  }

  // Las líneas y áreas se marcan con una guía vertical; barras y porciones, con una banda.
  const cursor = hoverCursor(theme, widget.chart === "line" || widget.chart === "area" ? "line" : "band");

  const common = {
    grid: <CartesianGrid stroke={theme.grid} vertical={false} />,
    tooltip: (
      <Tooltip
        contentStyle={tooltipStyle(theme)}
        cursor={cursor}
        formatter={(value, name) => {
          const index = result.measures.findIndex((measure) => measure.label === name);
          return [formatValue(Number(value ?? 0), units[index === -1 ? 0 : index]!, result.currency), String(name)];
        }}
      />
    ),
    legend: widget.showLegend ? <Legend wrapperStyle={{ fontSize: 12, color: theme.axis }} /> : null,
  };

  switch (widget.chart) {
    case "kpi":
      return <Kpi widget={widget} result={result} />;

    case "table":
      return <Table result={result} />;

    case "segmented":
      return (
        <Segmented
          result={result}
          colors={theme.categorical}
          showValues={widget.showValues}
          {...(onSelect ? { onSelect } : {})}
        />
      );

    case "heatmap":
      return <Heatmap result={result} color={theme.categorical[2]!} />;

    case "radar": {
      const data = result.measures.map((measure, index) => ({
        axis: measure.label,
        actual: result.rows[0]?.values[index] ?? 0,
        previous: result.comparison?.rows[0]?.values[index] ?? null,
      }));
      return (
        <ResponsiveContainer width="100%" height={height}>
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke={theme.grid} />
            <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: theme.axis }} />
            {/* Todos los ejes están normalizados a 0–100 y "más lejos = mejor", así que
                la escala es fija: si fuera automática, un perfil malo se vería lleno. */}
            <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: theme.axis }} />
            <Radar
              name="Actual"
              dataKey="actual"
              stroke={theme.categorical[0]}
              fill={theme.categorical[0]}
              fillOpacity={0.3}
            />
            {result.comparison && (
              <Radar
                name={result.comparison.label}
                dataKey="previous"
                stroke={theme.compare}
                fill={theme.compare}
                fillOpacity={0.15}
              />
            )}
            {common.legend}
            <Tooltip
              contentStyle={tooltipStyle(theme)}
              cursor={hoverCursor(theme, "line")}
              formatter={(value) => `${Number(value ?? 0)} %`}
            />
          </RadarChart>
        </ResponsiveContainer>
      );
    }

    case "donut":
    case "semidonut": {
      const data = result.rows.map((row, index) => ({
        name: row.label,
        groupKey: row.key ?? "",
        value: row.values[0] ?? 0,
        fill: theme.categorical[index % theme.categorical.length]!,
      }));
      const half = widget.chart === "semidonut";
      return (
        <div className="relative">
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
                startAngle={half ? 180 : 90}
                endAngle={half ? 0 : -270}
                {...clickHandler}
                {...(widget.showValues ? { label: ({ value }: { value: number }) => value } : {})}
              >
                {data.map((slice) => (
                  <Cell key={slice.name} fill={slice.fill} stroke={theme.surface} strokeWidth={2} />
                ))}
              </Pie>
              {common.tooltip}
              {common.legend}
            </PieChart>
          </ResponsiveContainer>
          {half && (
            // La semidona existe para destacar el total en el centro (spec §7.8.6).
            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-6 text-center">
              <p className="font-display text-2xl font-semibold tabular text-[var(--content-ink)]">
                {formatValue(result.totals[0] ?? null, unit, result.currency)}
              </p>
              <p className="text-xs text-[var(--content-ink-dim)]">Total</p>
            </div>
          )}
        </div>
      );
    }

    case "line":
    case "area": {
      const data = seriesData(result);
      const Chart = widget.chart === "area" ? AreaChart : LineChart;
      return (
        <ResponsiveContainer width="100%" height={height}>
          <Chart data={data} margin={{ left: -16, right: 10, top: 6 }}>
            <defs>
              {result.measures.map((measure, index) => (
                <linearGradient key={measure.key} id={`g-${widget.id}-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.categorical[index]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={theme.categorical[index]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {common.grid}
            <XAxis dataKey="label" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              stroke={theme.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(value: number) => formatAxis(value, unit)}
            />
            {common.tooltip}
            {common.legend}
            {widget.showTarget && unit === "percent" && (
              <ReferenceLine y={100} stroke={theme.compare} strokeDasharray="4 4" />
            )}
            {result.measures.map((measure, index) =>
              widget.chart === "area" ? (
                <Area
                  key={measure.key}
                  type="monotone"
                  dataKey={`m${index}`}
                  name={measure.label}
                  stroke={theme.categorical[index]}
                  fill={`url(#g-${widget.id}-${index})`}
                  strokeWidth={2}
                  connectNulls
                />
              ) : (
                <Line
                  key={measure.key}
                  type="monotone"
                  dataKey={`m${index}`}
                  name={measure.label}
                  stroke={theme.categorical[index]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ),
            )}
            {result.comparison && (
              <Line
                type="monotone"
                dataKey="previous"
                name={result.comparison.label}
                stroke={theme.compare}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
              />
            )}
          </Chart>
        </ResponsiveContainer>
      );
    }

    case "stacked": {
      const { data, splits } = stackedData(result);
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ left: -16, right: 10 }}>
            {common.grid}
            <XAxis dataKey="label" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} width={36} />
            <Tooltip contentStyle={tooltipStyle(theme)} cursor={cursor} />
            {common.legend}
            {splits.map((split, index) => (
              <Bar
                key={split}
                dataKey={split}
                name={split}
                stackId="a"
                fill={theme.categorical[index % theme.categorical.length]}
                maxBarSize={36}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case "hbar": {
      const data = seriesData(result);
      return (
        <ResponsiveContainer width="100%" height={Math.max(height, data.length * 28 + 40)}>
          <BarChart data={data} layout="vertical" margin={{ left: 6, right: 28 }}>
            <CartesianGrid stroke={theme.grid} horizontal={false} />
            <XAxis
              type="number"
              stroke={theme.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatAxis(value, unit)}
            />
            <YAxis
              type="category"
              dataKey="label"
              stroke={theme.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={130}
            />
            {common.tooltip}
            {widget.showTarget && unit === "percent" && (
              <ReferenceLine x={100} stroke={theme.compare} strokeDasharray="4 4" />
            )}
            <Bar
              dataKey="m0"
              name={result.measures[0]!.label}
              fill={theme.categorical[0]}
              radius={[0, 4, 4, 0]}
              maxBarSize={18}
              {...clickHandler}
              {...(widget.showValues
                ? { label: { position: "right", fontSize: 11, fill: theme.axis } }
                : {})}
            />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case "bar":
    default: {
      const data = seriesData(result);
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data} margin={{ left: -16, right: 10 }}>
            {common.grid}
            <XAxis dataKey="label" stroke={theme.axis} fontSize={11} tickLine={false} axisLine={false} />
            <YAxis
              stroke={theme.axis}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(value: number) => formatAxis(value, unit)}
            />
            {common.tooltip}
            {common.legend}
            {widget.showTarget && unit === "percent" && (
              <ReferenceLine y={100} stroke={theme.compare} strokeDasharray="4 4" />
            )}
            {result.measures.map((measure, index) => (
              <Bar
                key={measure.key}
                dataKey={`m${index}`}
                name={measure.label}
                fill={theme.categorical[index]}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                {...clickHandler}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }
  }
}

interface Clicked {
  groupKey?: string;
  payload?: Clicked;
}

function groupKeyOf(entry: unknown): string | undefined {
  const clicked = entry as Clicked | undefined;
  return clicked?.groupKey ?? clicked?.payload?.groupKey ?? clicked?.payload?.payload?.groupKey;
}

// ── Pivotes ───────────────────────────────────────────────────

/** Una fila por grupo, con una columna por medida (`m0`, `m1`…). */
function seriesData(result: ReportQueryResult) {
  return result.rows.map((row, index) => ({
    label: row.label,
    groupKey: row.key ?? "",
    ...Object.fromEntries(row.values.map((value, position) => [`m${position}`, value])),
    // La serie de comparación se alinea por posición, no por etiqueta: "el lunes
    // anterior" se dibuja debajo del lunes de esta semana (spec §7.8.3, paso 8).
    previous: result.comparison?.rows[index]?.values[0] ?? null,
  }));
}

/** Barras apiladas: una fila por grupo y una columna por segmento. */
function stackedData(result: ReportQueryResult): {
  data: Record<string, unknown>[];
  splits: string[];
} {
  const groups = new Map<string, Record<string, unknown>>();
  const splits: string[] = [];

  for (const row of result.rows) {
    const bucket = groups.get(row.label) ?? { label: row.label };
    const split = row.split ?? "Sin valor";
    bucket[split] = row.values[0] ?? 0;
    groups.set(row.label, bucket);
    if (!splits.includes(split)) splits.push(split);
  }

  // Máximo 6 segmentos; el resto se junta, igual que las porciones de una dona.
  const visible = splits.slice(0, 6);
  const rest = splits.slice(6);
  const data = [...groups.values()].map((bucket) => {
    if (!rest.length) return bucket;
    const others = rest.reduce((sum, split) => sum + Number(bucket[split] ?? 0), 0);
    for (const split of rest) delete bucket[split];
    return others ? { ...bucket, Otros: others } : bucket;
  });

  return { data, splits: rest.length ? [...visible, "Otros"] : visible };
}

// ── Tipos que no son de Recharts ──────────────────────────────

function Kpi({ widget, result }: { widget: ReportWidget; result: ReportQueryResult }) {
  const measure = result.measures[0]!;
  const value = result.totals[0] ?? null;
  const trend = trendOf(value, result.comparison?.totals[0] ?? null);

  return (
    <StatTile
      label={widget.title}
      value={formatValue(value, measure.unit, result.currency)}
      icon={<ChartIcon className="h-4 w-4" />}
      {...(trend ? { trend: { ...trend, goodWhenUp: measure.higherIsBetter } } : {})}
      {...(MEASURE_META[measure.key].hint ? { caption: MEASURE_META[measure.key].hint } : {})}
    />
  );
}

function Table({ result }: { result: ReportQueryResult }) {
  const hasSplit = result.rows.some((row) => row.split !== undefined);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--content-border)] text-left text-xs text-[var(--content-ink-dim)]">
            <th className="px-2 py-2 font-medium">Grupo</th>
            {hasSplit && <th className="px-2 py-2 font-medium">Segmento</th>}
            {result.measures.map((measure) => (
              <th key={measure.key} className="px-2 py-2 text-right font-medium">
                {measure.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, index) => (
            <tr
              key={`${row.key ?? row.label}-${row.split ?? index}`}
              className="border-b border-[var(--content-border)] last:border-0"
            >
              <td className="px-2 py-2 text-[var(--content-ink)]">{row.label}</td>
              {hasSplit && <td className="px-2 py-2 text-[var(--content-ink-dim)]">{row.split ?? "—"}</td>}
              {row.values.map((value, position) => (
                <td key={position} className="px-2 py-2 text-right tabular text-[var(--content-ink)]">
                  {formatValue(value, result.measures[position]!.unit, result.currency)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {result.rows.length > 1 && (
          <tfoot>
            <tr className="border-t border-[var(--content-border)] text-xs font-semibold">
              <td className="px-2 py-2 text-[var(--content-ink-dim)]">Total</td>
              {hasSplit && <td />}
              {result.totals.map((value, position) => (
                <td key={position} className="px-2 py-2 text-right tabular text-[var(--content-ink)]">
                  {formatValue(value, result.measures[position]!.unit, result.currency)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Barra segmentada: un total repartido, con su leyenda y sus valores (spec §7.8.6). */
function Segmented({
  result,
  colors,
  showValues,
  onSelect,
}: {
  result: ReportQueryResult;
  colors: string[];
  showValues: boolean;
  onSelect?: (key: string) => void;
}) {
  const total = result.rows.reduce((sum, row) => sum + (row.values[0] ?? 0), 0);
  if (!total) return <Empty />;

  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {result.rows.map((row, index) => (
          <button
            key={row.key ?? row.label}
            title={`${row.label}: ${row.values[0] ?? 0}`}
            onClick={() => row.key && onSelect?.(row.key)}
            style={{
              width: `${((row.values[0] ?? 0) / total) * 100}%`,
              background: colors[index % colors.length],
            }}
          />
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {result.rows.map((row, index) => (
          <li key={row.key ?? row.label} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: colors[index % colors.length] }}
            />
            <span className="flex-1 truncate text-[var(--content-ink)]">{row.label}</span>
            {showValues && (
              <span className="tabular text-[var(--content-ink-dim)]">
                {formatValue(row.values[0], result.measures[0]!.unit, result.currency)} ·{" "}
                {Math.round(((row.values[0] ?? 0) / total) * 100)} %
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * Mapa de calor día × hora. Las claves vienen del servidor como `"3-14"` (miércoles a
 * las dos), así que la cuadrícula se arma con ellas y solo se pintan las horas en las
 * que hubo algo: un día laborable de ocho horas no necesita 24 columnas vacías.
 */
function Heatmap({ result, color }: { result: ReportQueryResult; color: string }) {
  const values = new Map<string, number>();
  let max = 0;
  const hours = new Set<number>();

  for (const row of result.rows) {
    const [day, hour] = (row.key ?? "").split("-").map(Number);
    if (!day || Number.isNaN(hour as number)) continue;
    const value = row.values[0] ?? 0;
    values.set(`${day}-${hour}`, value);
    hours.add(hour as number);
    max = Math.max(max, value);
  }

  if (!max) return <Empty />;
  const columns = [...hours].sort((a, b) => a - b);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-[10px]">
        <thead>
          <tr>
            <th />
            {columns.map((hour) => (
              <th key={hour} className="px-0.5 font-normal text-[var(--content-ink-dim)]">
                {String(hour).padStart(2, "0")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((name, index) => (
            <tr key={name}>
              <th className="pr-1.5 text-right font-normal text-[var(--content-ink-dim)]">{name}</th>
              {columns.map((hour) => {
                const value = values.get(`${index + 1}-${hour}`) ?? 0;
                return (
                  <td key={hour} className="p-0">
                    <div
                      title={`${name} ${String(hour).padStart(2, "0")}:00 — ${value}`}
                      className="h-6 w-6 rounded-sm"
                      style={{
                        background: value ? color : "var(--content-bg)",
                        // La intensidad arranca en 0,15 para que un solo ticket se vea;
                        // con opacidad proporcional pura, el 1 de 40 es invisible.
                        opacity: value ? 0.15 + (value / max) * 0.85 : 1,
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-10 text-center text-sm text-[var(--content-ink-dim)]">
      No hay datos en este período y alcance. Prueba a ampliar el rango.
    </p>
  );
}
