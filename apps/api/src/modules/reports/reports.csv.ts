import {
  AGGREGATION_LABEL,
  DEFAULT_REPORT_COLUMNS,
  PRIORITY_LABEL,
  REPORT_COLUMN_LABEL,
  SLA_STATE_LABEL,
  TICKET_STATUS_LABEL,
  formatTicketNumber,
  type ReportColumn,
  type ReportQueryResult,
  type ReportTicketRow,
} from "@tekzaya/shared";
import { csvRow } from "../tickets/ticket.csv";

/**
 * La lista del período en CSV, con **las columnas que el usuario eligió** (spec
 * §7.8.9). Nunca sale de aquí el texto de un mensaje ni de una nota interna: una
 * exportación no es una puerta lateral a la conversación.
 */
export function ticketRowsToCsv(rows: ReportTicketRow[], columns?: ReportColumn[]): string {
  const chosen = columns?.length ? columns : DEFAULT_REPORT_COLUMNS;
  return [
    csvRow(chosen.map((column) => REPORT_COLUMN_LABEL[column])),
    ...rows.map((row) => csvRow(chosen.map((column) => cellOf(row, column)))),
  ].join("\r\n");
}

function cellOf(row: ReportTicketRow, column: ReportColumn): unknown {
  switch (column) {
    case "number":
      return formatTicketNumber(row.number);
    case "title":
      return row.title;
    case "requester":
      return row.requester.name;
    case "createdBy":
      return row.createdBy.name;
    case "area":
      return row.area.name;
    case "category":
      return row.categoryName ?? "";
    case "priority":
      return PRIORITY_LABEL[row.priority];
    case "status":
      return TICKET_STATUS_LABEL[row.status];
    case "assignees":
      return row.assignees.map((user) => user.name).join(" · ");
    case "createdAt":
      return row.createdAt;
    case "firstResponse":
      return row.firstResponseHours === null ? "" : row.firstResponseHours.toFixed(2);
    case "resolvedAt":
      return row.resolvedAt ?? "";
    case "resolutionTime":
      return row.resolutionHours === null ? "" : row.resolutionHours.toFixed(2);
    case "slaState":
      return SLA_STATE_LABEL[row.resolutionState];
    case "csat":
      return row.csat ?? "";
    case "reopened":
      return row.reopened ? "Sí" : "No";
    case "incident":
      return row.incidentLabel ?? "";
    case "mergedWith":
      return row.mergedIntoNumber ? formatTicketNumber(row.mergedIntoNumber) : "";
  }
}

/** La tabla de una gráfica, tal como se ve: cabecera, una fila por grupo y el total. */
export function chartTable(result: ReportQueryResult): { header: string[]; rows: (string | number | null)[][] } {
  const split = result.rows.some((row) => row.split !== undefined);
  const header = [
    "Grupo",
    ...(split ? ["Segmento"] : []),
    ...result.measures.map((measure) =>
      measure.aggregation
        ? `${measure.label} (${AGGREGATION_LABEL[measure.aggregation].toLowerCase()})`
        : measure.label,
    ),
  ];

  const rows: (string | number | null)[][] = result.rows.map((row) => [
    row.label,
    ...(split ? [row.split ?? ""] : []),
    ...row.values,
  ]);

  if (result.rows.length > 1) {
    rows.push(["Total", ...(split ? [""] : []), ...result.totals]);
  }

  return { header, rows };
}

/** Los datos de una gráfica en CSV, desde su menú `⋯` (spec §7.8.8). */
export function chartToCsv(result: ReportQueryResult, title: string): string {
  const { header, rows } = chartTable(result);

  return [
    csvRow([title]),
    csvRow(header),
    ...rows.map((row) => csvRow(row.map((value) => (value === null ? "" : value)))),
  ].join("\r\n");
}
