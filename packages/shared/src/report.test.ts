import { describe, expect, it } from "vitest";
import {
  CHART_TYPES,
  dimensionsForScope,
  MEASURE_KEYS,
  MEASURE_META,
  measuresForScope,
  validateWidget,
  type ChartType,
  type DimensionKey,
  type MeasureKey,
  reportWidget,
  type ReportWidget,
} from "./report";

/**
 * `validateWidget` es la única definición de "qué combinación tiene sentido": el panel
 * de configuración la usa para deshabilitar opciones y el servidor para rechazar con
 * 422. Por eso se prueba aquí, como función pura, y no a través de un endpoint.
 */
function widget(partial: Partial<ReportWidget> = {}): ReportWidget {
  return {
    id: "w1",
    title: "Prueba",
    source: "tickets",
    chart: "kpi",
    measures: [{ key: "created" }],
    filters: {},
    sort: "value_desc",
    showValues: true,
    showLegend: true,
    showTarget: false,
    layout: { w: 1 },
    ...partial,
  };
}

describe("definición de una gráfica", () => {
  it("una tarjeta KPI es una medida y ninguna dimensión", () => {
    expect(validateWidget(widget())).toBeNull();
    expect(validateWidget(widget({ groupBy: "category" }))).toMatch(/no se agrupa/i);
    expect(validateWidget(widget({ measures: [{ key: "created" }, { key: "resolved" }] }))).toMatch(
      /exactamente 1 medida/i,
    );
  });

  it("la línea y el área exigen una dimensión de tiempo", () => {
    expect(validateWidget(widget({ chart: "line", groupBy: "time" }))).toBeNull();
    expect(validateWidget(widget({ chart: "area", groupBy: "category" }))).toMatch(/por tiempo/i);
  });

  it("la dona no admite el tiempo: para eso está la línea", () => {
    expect(validateWidget(widget({ chart: "donut", groupBy: "category" }))).toBeNull();
    expect(validateWidget(widget({ chart: "donut", groupBy: "time" }))).toMatch(
      /no puede agrupar por tiempo/i,
    );
  });

  it("las barras apiladas necesitan dos dimensiones distintas", () => {
    expect(validateWidget(widget({ chart: "stacked", groupBy: "category" }))).toMatch(/2 dimensi/i);
    expect(
      validateWidget(widget({ chart: "stacked", groupBy: "category", splitBy: "priority" })),
    ).toBeNull();
    expect(
      validateWidget(widget({ chart: "stacked", groupBy: "category", splitBy: "category" })),
    ).toMatch(/distinta/i);
  });

  it("el mapa de calor solo se agrupa por día × hora, y esa dimensión solo vive ahí", () => {
    expect(validateWidget(widget({ chart: "heatmap", groupBy: "weekday_hour" }))).toBeNull();
    expect(validateWidget(widget({ chart: "heatmap", groupBy: "time" }))).toMatch(/día de la semana/i);
    expect(validateWidget(widget({ chart: "bar", groupBy: "weekday_hour" }))).toMatch(/mapa de calor/i);
  });

  it("varias medidas en una misma barra tienen que compartir unidad", () => {
    expect(
      validateWidget(
        widget({ chart: "bar", groupBy: "category", measures: [{ key: "created" }, { key: "resolved" }] }),
      ),
    ).toBeNull();
    expect(
      validateWidget(
        widget({
          chart: "bar",
          groupBy: "category",
          measures: [{ key: "created" }, { key: "csat_average" }],
        }),
      ),
    ).toMatch(/unidad/i);
  });

  it("la tabla sí mezcla unidades, porque cada medida lleva su columna", () => {
    expect(
      validateWidget(
        widget({
          chart: "table",
          groupBy: "assignee",
          measures: [{ key: "resolved" }, { key: "csat_average" }, { key: "sla_resolution_rate" }],
        }),
      ),
    ).toBeNull();
  });

  it("el radar solo admite lo que se puede normalizar a 0–100", () => {
    expect(
      validateWidget(
        widget({
          chart: "radar",
          measures: [
            { key: "sla_response_rate" },
            { key: "sla_resolution_rate" },
            { key: "csat_average" },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      validateWidget(
        widget({
          chart: "radar",
          measures: [{ key: "created" }, { key: "resolved" }, { key: "closed" }],
        }),
      ),
    ).toMatch(/normalizar/i);
  });

  it("solo los tiempos admiten mediana y percentil 90", () => {
    expect(
      validateWidget(widget({ measures: [{ key: "resolution_time", aggregation: "p90" }] })),
    ).toBeNull();
    expect(validateWidget(widget({ measures: [{ key: "created", aggregation: "p90" }] }))).toMatch(
      /no admite/i,
    );
  });

  it("los días de ausencia solo se agrupan por responsable", () => {
    expect(validateWidget(widget({ measures: [{ key: "away_days" }] }))).toBeNull();
    expect(
      validateWidget(widget({ chart: "hbar", groupBy: "assignee", measures: [{ key: "away_days" }] })),
    ).toBeNull();
    expect(
      validateWidget(widget({ chart: "hbar", groupBy: "category", measures: [{ key: "away_days" }] })),
    ).toMatch(/solo se agrupa/i);
  });

  it("cada tipo de gráfica tiene al menos una combinación válida", () => {
    // Red de seguridad del catálogo: si alguien añade un tipo con límites imposibles de
    // satisfacer, el panel lo ofrecería deshabilitado para siempre.
    const combos: Record<ChartType, Partial<ReportWidget>> = {
      kpi: {},
      bar: { groupBy: "category" },
      hbar: { groupBy: "category" },
      stacked: { groupBy: "category", splitBy: "priority" },
      line: { groupBy: "time" },
      area: { groupBy: "time" },
      donut: { groupBy: "category" },
      semidonut: { groupBy: "category" },
      segmented: { groupBy: "category" },
      radar: {
        measures: [{ key: "sla_response_rate" }, { key: "csat_average" }, { key: "reopen_rate" }],
      },
      heatmap: { groupBy: "weekday_hour" },
      table: { groupBy: "category" },
    };

    for (const chart of CHART_TYPES) {
      expect(validateWidget(widget({ chart, ...combos[chart] })), chart).toBeNull();
    }
  });
});

describe("catálogo por alcance", () => {
  it("el alcance personal no ofrece lo que habla del área", () => {
    const mine = measuresForScope("me");
    expect(mine).not.toContain<MeasureKey>("unassigned");
    expect(mine).not.toContain<MeasureKey>("incidents_detected");
    expect(mine).not.toContain<MeasureKey>("away_days");
    expect(mine).toContain<MeasureKey>("resolved");
  });

  it("el alcance de área lo ofrece todo", () => {
    expect(measuresForScope("area")).toHaveLength(MEASURE_KEYS.length);
  });

  it("quien no supervisa no reporta sobre otras personas", () => {
    const employee = dimensionsForScope("me", false);
    expect(employee).not.toContain<DimensionKey>("assignee");
    expect(employee).not.toContain<DimensionKey>("requester");
    expect(employee).not.toContain<DimensionKey>("availability");
    expect(employee).toContain<DimensionKey>("category");
  });

  it("en el alcance de un área, agrupar por área daría una sola barra", () => {
    expect(dimensionsForScope("area", true)).not.toContain<DimensionKey>("area");
    expect(dimensionsForScope("global", true)).toContain<DimensionKey>("area");
  });

  it("cada medida declara una unidad y al menos una perspectiva", () => {
    for (const key of MEASURE_KEYS) {
      const meta = MEASURE_META[key];
      expect(meta.perspectives.length, key).toBeGreaterThan(0);
      expect(meta.label.length, key).toBeGreaterThan(2);
    }
  });
});

describe("fuente de mantenimiento (plan A6)", () => {
  const maintenance = (partial: Partial<ReportWidget> = {}) =>
    widget({ source: "maintenance", measures: [{ key: "availability" }], ...partial });

  it("un widget guardado sin fuente es de tickets", () => {
    const { source: _source, ...old } = widget();
    expect(reportWidget.parse(old).source).toBe("tickets");
  });

  it("no mezcla medidas ni dimensiones de las dos fuentes", () => {
    expect(validateWidget(maintenance())).toBeNull();
    expect(validateWidget(maintenance({ measures: [{ key: "created" }] }))).toMatch(/es de tickets/);
    expect(validateWidget(widget({ measures: [{ key: "mtbf" }] }))).toMatch(/es de mantenimiento/);
    expect(validateWidget(maintenance({ chart: "bar", groupBy: "category" }))).toMatch(/no existe en mantenimiento/);
    expect(validateWidget(widget({ chart: "bar", groupBy: "asset" }))).toMatch(/no existe en tickets/);
    // Tiempo y área son de las dos.
    expect(validateWidget(maintenance({ chart: "line", groupBy: "time" }))).toBeNull();
  });

  it("cada medida se agrupa solo por lo que sabe", () => {
    expect(validateWidget(maintenance({ chart: "bar", groupBy: "technician" }))).toMatch(/solo se agrupa/);
    expect(
      validateWidget(maintenance({ chart: "bar", measures: [{ key: "parts_consumed" }], groupBy: "spare_part" })),
    ).toBeNull();
    expect(
      validateWidget(maintenance({ chart: "line", measures: [{ key: "wo_open" }], groupBy: "time" })),
    ).toMatch(/solo se agrupa/);
  });

  it("los filtros no cruzan de fuente", () => {
    expect(validateWidget(maintenance({ filters: { priorities: ["high"] } }))).toMatch(/filtros son de tickets/);
    expect(validateWidget(maintenance({ filters: { assetTypes: ["printer"], workOrderType: "corrective" } }))).toBeNull();
    expect(validateWidget(widget({ filters: { assetTypes: ["printer"] } }))).toMatch(/son de mantenimiento/);
  });
});
