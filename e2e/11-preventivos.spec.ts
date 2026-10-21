import { expect, test } from "@playwright/test";
import { storageStateOf } from "./accounts";

/**
 * Recorrido 11 · Mantenimiento preventivo (plan A5).
 * El supervisor de IT crea un plan para todas las impresoras de su área: el
 * calendario del mes muestra la ronda que viene, aún sin orden, y al pausarlo
 * deja de aparecer. Las OT las abre el trabajo diario, que tiene sus pruebas
 * con la hora inyectada (`plans.test.ts`).
 */

const TITLE = "Limpieza de cabezales (E2E)";

test.use({ storageState: storageStateOf("supervisor") });

test("crear un plan por tipo, verlo en el calendario y pausarlo", async ({ page }) => {
  await page.goto("/preventivos");
  await expect(page.getByLabel("Cargando calendario")).toHaveCount(0);

  await page.getByRole("button", { name: "Nuevo plan" }).click();
  const modal = page.getByRole("dialog", { name: "Nuevo plan preventivo" });
  await modal.getByLabel("Título").fill(TITLE);
  await modal.getByLabel("Todos los de un tipo en un área").check();
  await modal.getByLabel("Tipo de equipo").selectOption({ label: "Impresora" });
  await modal.getByLabel("Cada").fill("6");
  await modal.getByLabel("Unidad").selectOption("month");
  await modal.getByRole("radio", { name: /^Calendario fijo/ }).check();
  // La primera fecha es hoy por defecto: la ronda cae en el mes a la vista.
  await modal.getByRole("button", { name: "Guardar" }).click();
  await expect(modal).toBeHidden();

  await expect(page.getByText(TITLE).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/^\d+ equipos · sin orden todavía$/).filter({ visible: true }).first()).toBeVisible();

  // El filtro de estado esconde las rondas que aún no tienen orden.
  await page.getByRole("button", { name: /Filtro/ }).click();
  await page.getByRole("dialog", { name: "Filtros del calendario" }).getByLabel("Programadas").uncheck();
  await expect(page.getByText(TITLE).filter({ visible: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar todo" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText(TITLE).filter({ visible: true }).first()).toBeVisible();

  await page.getByRole("tab", { name: "Planes" }).click();
  const card = page.getByRole("listitem").filter({ hasText: TITLE });
  await expect(card).toContainText("Cada 6 meses · Calendario fijo");
  await expect(card).toContainText(/Todos los «Impresora» \(\d+\)/);

  await card.getByRole("button", { name: "Pausar" }).click();
  await expect(card).toHaveCount(0);
  await page.getByLabel("Filtrar por estado").selectOption("paused");
  await expect(page.getByRole("listitem").filter({ hasText: TITLE })).toContainText("En pausa");

  await page.getByRole("tab", { name: "Calendario" }).click();
  await expect(page.getByText(TITLE).filter({ visible: true })).toHaveCount(0);
});
