import { expect, test, type Browser, type Locator } from "@playwright/test";
import { storageStateOf, type Role } from "./accounts";

/**
 * Recorrido 9 · Una orden de trabajo de principio a fin (DoD de A3).
 * El supervisor de IT abre una orden sobre la impresora de etiquetas, la toma,
 * consume un repuesto, paga a un técnico externo por hora y la completa: el
 * costo es repuesto + servicio y el equipo vuelve a estar operativo.
 * El empleado de Ventas no ve ni la entrada del menú ni la orden.
 */

const stamp = Date.now().toString(36);
const TITLE = `No reconoce el rollo de etiquetas ${stamp}`;
const PRINTER = "Impresora de etiquetas";

async function sessionAs(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: storageStateOf(role) });
  return { context, page: await context.newPage() };
}

/** "$1,234.50" → 123450 centavos. */
async function cents(locator: Locator): Promise<number> {
  const text = (await locator.textContent()) ?? "";
  return Math.round(Number(text.replace(/[^\d.]/g, "")) * 100);
}

test("abrir, tomar, cargar repuesto y externo, completar: el costo cuadra", async ({ browser }) => {
  const { context, page } = await sessionAs(browser, "supervisor");

  // ── Abrir la orden desde la ficha del equipo ──
  await page.goto("/activos");
  await page.getByRole("textbox", { name: "Buscar activos" }).fill(PRINTER);
  await page.getByRole("link", { name: PRINTER }).first().click();
  await page.getByRole("button", { name: "Nueva orden de trabajo" }).click();
  const modal = page.getByRole("dialog", { name: /Nueva orden para ACT-\d{4}/ });
  await modal.getByLabel("Título").fill(TITLE);
  const create = modal.getByRole("button", { name: "Abrir orden" });
  // Sin responder si queda fuera de servicio no se abre.
  await expect(create).toBeDisabled();
  await modal.getByLabel("Sí, deja de usarse").check();
  await create.click();

  await expect(page).toHaveURL(/\/ordenes\/OT-\d{4}$/);
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByText("Pendiente", { exact: true }).first()).toBeVisible();

  // ── Tomarla y empezar ──
  await page.getByRole("button", { name: "Tomar" }).click();
  await expect(page.getByText("Asignada", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Iniciar trabajo" }).click();
  await expect(page.getByText("En progreso", { exact: true }).first()).toBeVisible();

  // ── Un repuesto y un servicio externo ──

  const partPicker = page.getByLabel(/Repuesto del almacén/);
  // La opción lleva el stock y el costo del momento: se elige por su nombre.
  const rollers = await partPicker.locator("option", { hasText: "Kit de rodillos de alimentación" }).getAttribute("value");
  await partPicker.selectOption(rollers!);
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(page.getByText("Kit de rodillos de alimentación").first()).toBeVisible();

  // El técnico de fuera cobra por hora: 1 h 30 min a 30,00 son 45,00.
  await page.getByLabel("Proveedor", { exact: true }).fill("Etiquetas del Caribe");
  await page.getByLabel("Por hora").check();
  await page.getByLabel("Tarifa por hora").fill("30");
  await page.getByLabel("Horas del proveedor").fill("1");
  await page.getByLabel("Minutos del proveedor").fill("30");
  await expect(page.getByText("Total: USD 45.00")).toBeVisible();
  await page.getByRole("button", { name: "Agregar servicio" }).click();
  await expect(page.getByText("Etiquetas del Caribe")).toBeVisible();

  // ── Completar ──
  await page.getByRole("button", { name: "Completar" }).click();
  const complete = page.getByRole("dialog", { name: /Completar OT-\d{4}/ });
  await complete.getByLabel("Trabajo realizado").fill("Se cambiaron los rodillos y se recalibró el sensor de etiquetas.");
  await complete.getByRole("button", { name: "Completar", exact: true }).click();
  await expect(complete).toBeHidden();
  await expect(page.getByText("Completada", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Trabajo realizado" })).toBeVisible();

  // El costo es repuesto + servicio externo.
  const costCard = page.locator("dl").filter({ hasText: "Servicios externos" });
  const row = (label: string) => costCard.locator("div").filter({ hasText: label }).locator("dd");
  const parts = await cents(row("Repuestos"));
  const external = await cents(row("Servicios externos"));
  expect(parts).toBeGreaterThan(0);
  expect(external).toBe(4500);
  expect(await cents(row("Total"))).toBe(parts + external);

  // ── El equipo vuelve a estar operativo y la reparación queda en su historia ──
  await page.getByRole("link", { name: PRINTER }).click();
  await expect(page.getByRole("heading", { level: 1, name: PRINTER })).toBeVisible();
  const repair = page.getByRole("listitem").filter({ hasText: "Se cambiaron los rodillos" });
  await expect(repair).toContainText("Vuelve a estar operativo");
  await repair.getByRole("link", { name: /^OT-\d{4}$/ }).click();
  await expect(page).toHaveURL(/\/ordenes\/OT-\d{4}$/);

  await context.close();
});

test.describe("fuera del área", () => {
  test.use({ storageState: storageStateOf("employee") });

  test("el empleado de Ventas no ve las órdenes", async ({ page }) => {
    await page.goto("/tablero");
    await expect(page.getByRole("link", { name: "Activos y mantenimiento" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Órdenes de trabajo" })).toHaveCount(0);

    await page.goto("/ordenes/OT-0001");
    await expect(page.getByText("Esa orden de trabajo no existe")).toBeVisible();
  });
});
