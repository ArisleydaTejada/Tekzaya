import { crc32, deflateRawSync } from "node:zlib";

/**
 * Un libro de Excel mínimo: hojas con texto y números, la primera fila de cada tabla
 * en negrita y el ancho de columna ajustado al contenido. Lo bastante para exportar
 * las gráficas de un reporte sin traer una librería de hojas de cálculo entera: un
 * `.xlsx` es un `.zip` de XML, y `node:zlib` ya trae la compresión y el CRC.
 */

export type XlsxCell = string | number | null;

export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
  /** Filas (desde 0) que van en negrita: el título y la cabecera de la tabla. */
  boldRows?: number[];
}

export function buildXlsx(sheets: XlsxSheet[]): Buffer {
  const names = uniqueSheetNames(sheets.map((sheet) => sheet.name));

  const files: [string, string][] = [
    ["[Content_Types].xml", contentTypes(sheets.length)],
    ["_rels/.rels", ROOT_RELS],
    ["xl/workbook.xml", workbook(names)],
    ["xl/_rels/workbook.xml.rels", workbookRels(sheets.length)],
    ["xl/styles.xml", STYLES],
    ...sheets.map((sheet, index): [string, string] => [`xl/worksheets/sheet${index + 1}.xml`, worksheet(sheet)]),
  ];

  return zip(files.map(([path, xml]) => ({ path, data: Buffer.from(xml, "utf8") })));
}

// ── Nombres de hoja ─────────────────────────────────────────────

/** Excel exige nombres de hasta 31 caracteres, sin `[]:*?/\` y distintos entre sí. */
function uniqueSheetNames(names: string[]): string[] {
  const used = new Set<string>();

  return names.map((raw, index) => {
    const base = raw.replace(/[[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || `Gráfica ${index + 1}`;
    let name = base;

    for (let copy = 2; used.has(name.toLowerCase()); copy++) {
      const suffix = ` (${copy})`;
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    }

    used.add(name.toLowerCase());

    return name;
  });
}

// ── XML del libro ───────────────────────────────────────────────

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

function escapeXml(text: string): string {
  return (
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // Los caracteres de control que XML no admite romperían el archivo.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  );
}

function contentTypes(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");

  return (
    XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    sheets +
    "</Types>"
  );
}

const ROOT_RELS =
  XML_HEAD +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  "</Relationships>";

function workbook(names: string[]): string {
  const sheets = names
    .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");

  return `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRels(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  const styles = `<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;

  return `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}${styles}</Relationships>`;
}

/** Estilo 0: normal. Estilo 1: negrita. */
const STYLES =
  XML_HEAD +
  `<styleSheet xmlns="${MAIN_NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  "</styleSheet>";

function columnName(index: number): string {
  let name = "";

  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }

  return name;
}

function worksheet(sheet: XlsxSheet): string {
  const bold = new Set(sheet.boldRows ?? []);
  const widths: number[] = [];

  const rows = sheet.rows
    .map((row, rowIndex) => {
      const style = bold.has(rowIndex) ? ' s="1"' : "";
      const cells = row
        .map((value, colIndex) => {
          if (value === null || value === "") return "";
          const ref = `${columnName(colIndex)}${rowIndex + 1}`;
          const text = String(value);
          widths[colIndex] = Math.max(widths[colIndex] ?? 0, text.length);

          if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;

          return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  // El título de la hoja va en A1 y no debe ensanchar la columna de los grupos.
  const cols = widths
    .map((width, index) => {
      const chars = index === 0 ? Math.min(width, 40) : width;
      return `<col min="${index + 1}" max="${index + 1}" width="${Math.max(10, Math.min(chars + 2, 60))}" customWidth="1"/>`;
    })
    .join("");

  return `${XML_HEAD}<worksheet xmlns="${MAIN_NS}">${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData></worksheet>`;
}

// ── Zip ─────────────────────────────────────────────────────────

/** Un `.zip` con compresión `deflate`, sin cifrado ni zip64: los libros son pequeños. */
function zip(entries: { path: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.path, "utf8");
    const compressed = deflateRawSync(entry.data);
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versión necesaria
    local.writeUInt16LE(0x0800, 6); // nombres en UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(0, 10); // hora y fecha
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(local, name, compressed);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}
