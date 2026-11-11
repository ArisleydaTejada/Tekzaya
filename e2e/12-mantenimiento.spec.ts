import { expect, test, type Page } from "@playwright/test";
import { storageStateOf } from "./accounts";

/**
 * Plan A6: el panel de mantenimiento y la fuente de mantenimiento de los reportes.
 * La semilla deja la multifuncional de Ventas con fallas repetidas: es lo que
 * el supervisor de IT tiene que ver primero.
 */

test.describe("supervisor de IT", () => {
  test.use({ storageState: storageStateOf("supervisor") });

  test("el panel muestra KPI y alertas, y la falla repetida lleva al equipo", async ({ page }) => {
    await page.goto("/tablero");
    await page.getByRole("link", { name: "Panel", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Panel de mantenimiento" })).toBeVisible();
    await expect(page.getByLabel("Cargando panel")).toHaveCount(0);
    await expect(page.getByText("Órdenes abiertas")).toBeVisible();
    await expect(page.getByText("Costo del mes")).toBeVisible();

    const repeated = page.getByRole("heading", { name: /^Fallas repetidas/ }).locator("xpath=ancestor::div[2]");
    await repeated.getByRole("link", { name: /Impresora multifuncional de Ventas/ }).click();
    await expect(page).toHaveURL(/\/activos\/ACT-\d{4}$/);
    await expect(page.getByRole("heading", { level: 1, name: "Impresora multifuncional de Ventas" })).toBeVisible();
  });

  test("la plantilla de disponibilidad pinta MTBF y MTTR en horas laborables", async ({ page }) => {
    await page.goto("/reportes");
    await openReportsRail(page);
    await page.getByRole("tab", { name: /^Plantillas/ }).click();
    await page.getByRole("group", { name: "Módulo" }).getByRole("button", { name: /^Mantenimiento/ }).click();
    await page.getByRole("tabpanel").getByRole("button", { name: /Disponibilidad por tipo de equipo/ }).click();
    await expect(page.getByLabel("Cargando gráfica")).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("MTBF", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/\d+(,\d)? h$/).first()).toBeVisible();
  });
});

test.describe("empleado de Ventas", () => {
  test.use({ storageState: storageStateOf("employee") });

  test("no tiene panel de mantenimiento", async ({ page }) => {
    await page.goto("/tablero");
    await expect(page.getByRole("link", { name: "Panel", exact: true })).toHaveCount(0);
    await page.goto("/mantenimiento");
    await expect(page.getByText("Tu área no mantiene equipos")).toBeVisible();
  });
});

/** El panel de reportes arranca plegado: se abre con su botón si hace falta. */
async function openReportsRail(page: Page) {
  const toggle = page.getByRole("button", { name: "Reportes", exact: true });
  await expect(toggle).toBeVisible();

  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
}
