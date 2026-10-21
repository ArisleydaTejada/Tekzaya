import { expect, test } from "@playwright/test";
import { storageStateOf } from "./accounts";

/**
 * Recorrido 7 · Inventario de activos (DoD de A1).
 * El supervisor de IT da de alta un equipo con foto, lo mueve de ubicación y lo
 * da de baja: los tres pasos quedan en la línea de tiempo. Un empleado de Ventas
 * solo ve los equipos que usa su área o tiene a su cargo, y nunca un precio.
 */

const NAME = `Proyector de la sala B ${Date.now().toString(36)}`;
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

test.describe("supervisor de IT", () => {
  test.use({ storageState: storageStateOf("supervisor") });

  test("alta con foto, mudanza y baja quedan en la línea de tiempo", async ({ page }) => {
    await page.goto("/activos");
    await page.getByRole("button", { name: "Nuevo activo" }).click();

    const form = page.getByRole("dialog", { name: "Nuevo activo" });
    await form.getByLabel("Nombre").fill(NAME);
    await form.getByLabel("Tipo").selectOption({ label: "Otro" });
    await form.getByLabel("Ubicación").fill("Piso 2 · Sala de juntas");
    // El costo solo admite cifras, agrupa los miles al escribir y muestra la moneda.
    const cost = form.getByLabel(/^Costo de compra/);
    await cost.pressSequentially("abc1234x567.891");
    await expect(cost).toHaveValue("1,234,567.89");
    await expect(form.getByText("USD", { exact: true })).toBeVisible();
    // Escribir en medio no manda el cursor al final: "1,234,567.89" → "12,234,567.89".
    await cost.press("Home");
    await cost.press("ArrowRight");
    await cost.pressSequentially("2");
    await expect(cost).toHaveValue("12,234,567.89");
    await form.getByLabel(/^Foto/).setInputFiles({ name: "proyector.png", mimeType: "image/png", buffer: PNG });
    await expect(form.locator("img")).toBeVisible();
    await form.getByRole("button", { name: "Dar de alta" }).click();

    await expect(page.getByRole("heading", { level: 1, name: NAME })).toBeVisible();
    await expect(page).toHaveURL(/\/activos\/ACT-\d{4}$/);
    await expect(page.getByRole("img", { name: `Foto de ${NAME}` })).toBeVisible();
    await expect(page.getByText("USD 12,234,567.89")).toBeVisible();

    await page.getByRole("button", { name: "Editar o mover" }).click();
    const edit = page.getByRole("dialog", { name: `Editar ${NAME}` });
    await edit.getByLabel("Ubicación").fill("Piso 3 · Finanzas");
    await edit.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByText("Cambio de ubicación")).toBeVisible();

    await page.getByRole("button", { name: "Dar de baja" }).click();
    const retire = page.getByRole("dialog", { name: /^Dar de baja ACT-/ });
    await retire.getByLabel("Motivo").fill("Se reemplazó por una pantalla en la sala.");
    await retire.getByRole("button", { name: "Dar de baja" }).click();
    await expect(retire).toBeHidden();

    await expect(page.getByText("Dado de baja", { exact: true })).toBeVisible();
    // La historia completa vive en su pestaña; el resumen solo trae lo último.
    await page.getByRole("tab", { name: "Historial" }).click();
    await expect(page.getByRole("heading", { name: "Línea de tiempo" })).toBeVisible();
    const timeline = page.getByRole("list").filter({ hasText: "Alta en el inventario" });
    await expect(timeline.getByRole("listitem")).toHaveCount(4);
    await expect(timeline).toContainText("Baja");
    await expect(timeline).toContainText("Piso 2 · Sala de juntas");
    await expect(timeline).toContainText("Piso 3 · Finanzas");
    // Ya no se edita.
    await expect(page.getByRole("button", { name: "Editar o mover" })).toHaveCount(0);
  });
});

test.describe("empleado de Ventas", () => {
  test.use({ storageState: storageStateOf("employee") });

  test("ve su laptop y la impresora de su área, sin precios ni historial", async ({ page }) => {
    await page.goto("/activos");
    await expect(page.getByRole("link", { name: "Laptop de Diego Castillo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Impresora multifuncional de Ventas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nuevo activo" })).toHaveCount(0);

    // Lo que mantiene IT para otras áreas no aparece.
    await page.getByRole("textbox", { name: "Buscar activos" }).fill("Servidor de archivos");
    await expect(page.getByText("Ningún activo coincide con los filtros.")).toBeVisible();

    await page.getByRole("textbox", { name: "Buscar activos" }).fill("Laptop de Diego");
    await page.getByRole("link", { name: "Laptop de Diego Castillo" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Laptop de Diego Castillo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reportar una falla" })).toBeVisible();
    await expect(page.getByText("Costo de compra")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Línea de tiempo" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Historial" })).toHaveCount(0);
  });
});
