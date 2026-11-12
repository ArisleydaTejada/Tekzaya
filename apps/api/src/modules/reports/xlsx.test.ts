import { describe, expect, it } from "vitest";
import { readZip } from "../../test/zip";
import { buildXlsx } from "./xlsx";

describe("libro de Excel", () => {
  it("una hoja por tabla, con texto escapado y números como números", () => {
    const files = readZip(
      buildXlsx([
        { name: "Volumen por área", rows: [["Volumen"], ["Grupo", "Tickets"], ["I+D <nuevo> & más", 21]], boldRows: [0, 1] },
        { name: "SLA", rows: [["SLA"], ["Total", 100]] },
      ]),
    );

    expect([...files.keys()]).toContain("xl/worksheets/sheet2.xml");
    expect(files.get("xl/workbook.xml")).toContain('name="Volumen por área"');
    expect(files.get("xl/workbook.xml")).toContain('name="SLA"');

    const first = files.get("xl/worksheets/sheet1.xml")!;
    expect(first).toContain("I+D &lt;nuevo&gt; &amp; más");
    expect(first).toContain('<c r="B3"><v>21</v></c>');
    expect(first).toContain('<c r="A2" s="1" t="inlineStr">');
  });

  it("los nombres de hoja respetan las reglas de Excel y no se repiten", () => {
    const workbook = readZip(
      buildXlsx([
        { name: "Costo / equipo: [mes]", rows: [] },
        { name: "Una gráfica con un título larguísimo que no cabe", rows: [] },
        { name: "Una gráfica con un título larguísimo que tampoco", rows: [] },
        { name: "", rows: [] },
      ]),
    ).get("xl/workbook.xml")!;

    const names = [...workbook.matchAll(/<sheet name="([^"]*)"/g)].map((match) => match[1]!);
    expect(names[0]).toBe("Costo   equipo   mes");
    expect(names.every((name) => name.length <= 31)).toBe(true);
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length);
    expect(names[3]).toBe("Gráfica 4");
  });
});
