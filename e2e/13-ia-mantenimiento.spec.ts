import { expect, test, type Page } from "@playwright/test";
import { storageStateOf } from "./accounts";
import { EXPLANATION, mockMaintenanceAi } from "./aiMocks";

/**
 * Recorrido 13 · ¿Reparar o reemplazar? (recorrido 4 de la defensa, DoD de A7).
 * Con IA, la multifuncional de Ventas —la de las fallas repetidas de la semilla—
 * muestra la sugerencia con su explicación y sus números, y una correctiva abierta
 * estima su costo a partir de reparaciones parecidas que se pueden abrir. Sin
 * clave, ninguna de las dos tarjetas se monta y el módulo sigue igual.
 */

test.use({ storageState: storageStateOf("supervisor") });

async function openPrinter(page: Page) {
  await page.goto("/activos");
  await page.getByRole("textbox", { name: "Buscar activos" }).fill("multifuncional");
  await page.getByRole("link", { name: "Impresora multifuncional de Ventas" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Impresora multifuncional de Ventas" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function openCorrectiveInProgress(page: Page) {
  await page.goto("/ordenes");
  await page.getByLabel("Filtrar por estado").selectOption("in_progress");
  await page.getByLabel("Filtrar por tipo").selectOption("corrective");
  await expect(page.getByLabel("Cargando órdenes")).toHaveCount(0);
  await page.getByRole("cell").getByRole("link", { name: /^OT-\d{4}$/ }).first().click();
  await expect(page.getByRole("heading", { name: "Costo de la orden" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test.describe("con IA", () => {
  test.beforeEach(({ page }) => mockMaintenanceAi(page));

  test("la multifuncional sugiere reemplazarla, con su explicación y sus números", async ({ page }) => {
    await openPrinter(page);
    await expect(page.getByRole("heading", { name: "¿Reparar o reemplazar?" })).toBeVisible();
    const reasons = page.getByRole("list", { name: "Por qué es candidato" });
    await expect(reasons.getByText("Fallas repetidas")).toBeVisible();
    await expect(reasons.getByText("Reparaciones caras")).toBeVisible();
    await expect(page.getByText(EXPLANATION)).toBeVisible();
    await expect(page.getByText(/1,314\.00/)).toBeVisible();
    await expect(page.getByText("(110 % de la compra)")).toBeVisible();
    await expect(page.getByText("2 años y 10 meses")).toBeVisible();
  });

  test("una correctiva abierta estima su costo con casos que se pueden abrir", async ({ page }) => {
    await openCorrectiveInProgress(page);
    await page.getByRole("button", { name: "Estimar costo" }).click();
    await expect(page.getByText(/60\.00 – .*120\.00/)).toBeVisible();
    await expect(page.getByText(/la mitad central de 3 reparaciones parecidas, de 18 revisadas/)).toBeVisible();
    await page.getByRole("list", { name: "Reparaciones parecidas" }).getByRole("link", { name: /^OT-0002/ }).click();
    await expect(page).toHaveURL(/\/ordenes\/OT-0002$/);
  });
});

test.describe("sin clave de Gemini", () => {
  test("las tarjetas de IA no se montan y el equipo y la orden se ven enteros", async ({ page }) => {
    await openPrinter(page);
    await expect(page.getByRole("heading", { name: "Estado actual" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "¿Reparar o reemplazar?" })).toHaveCount(0);

    await openCorrectiveInProgress(page);
    await expect(page.getByRole("heading", { name: "Equipo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Estimar costo" })).toHaveCount(0);
  });
});
