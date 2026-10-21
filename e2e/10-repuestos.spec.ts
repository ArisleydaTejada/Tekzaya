import { expect, test, type Browser } from "@playwright/test";
import { storageStateOf, type Role } from "./accounts";

/**
 * Recorrido 10 · Stock bajo (recorrido 3 de la defensa, DoD de A4).
 * La administradora consume rodillos en una orden y el almacén queda bajo
 * mínimo: al supervisor de IT le llega el aviso a la campana, que lo lleva a la
 * ficha del repuesto. Registra una entrada, la marca desaparece y el libro
 * muestra la entrada con su saldo.
 */

const PART = "Kit de rodillos de alimentación";
const PRINTER = "Impresora de Finanzas";

async function sessionAs(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: storageStateOf(role) });
  return { context, page: await context.newPage() };
}

test("consumir deja el repuesto bajo mínimo, avisa al supervisor y una entrada lo repone", async ({ browser }) => {
  const admin = await sessionAs(browser, "admin");
  const supervisor = await sessionAs(browser, "supervisor");

  // ── La administradora abre una orden y consume dos kits ──
  await admin.page.goto("/activos");
  await admin.page.getByRole("textbox", { name: "Buscar activos" }).fill(PRINTER);
  await admin.page.getByRole("link", { name: PRINTER, exact: true }).first().click();
  await admin.page.getByRole("button", { name: "Nueva orden de trabajo" }).click();
  const modal = admin.page.getByRole("dialog", { name: /Nueva orden para ACT-\d{4}/ });
  await modal.getByLabel("Título").fill("Arrastra varias hojas a la vez");
  await modal.getByLabel("No, sigue funcionando").check();
  await modal.getByRole("button", { name: "Abrir orden" }).click();
  await expect(admin.page).toHaveURL(/\/ordenes\/OT-\d{4}$/);
  await admin.page.getByRole("button", { name: "Tomar" }).click();
  await admin.page.getByRole("button", { name: "Iniciar trabajo" }).click();

  const picker = admin.page.getByLabel(/Repuesto del almacén/);
  const rollers = await picker.locator("option", { hasText: PART }).getAttribute("value");
  await picker.selectOption(rollers!);
  await admin.page.getByLabel("Cantidad").fill("2");
  await admin.page.getByRole("button", { name: "Agregar", exact: true }).click();
  await expect(admin.page.getByRole("button", { name: `Devolver ${PART} al almacén` })).toBeVisible();

  // ── Al supervisor le llega el aviso y lo lleva al repuesto ──
  await supervisor.page.goto("/tablero");
  await supervisor.page.getByRole("button", { name: /^Notificaciones/ }).click();
  await supervisor.page.getByRole("link", { name: new RegExp(`Stock bajo: ${PART}`) }).first().click();
  await expect(supervisor.page).toHaveURL(/\/repuestos\/REP-\d{4}$/);
  await expect(supervisor.page.getByRole("heading", { level: 1, name: PART })).toBeVisible();
  await expect(supervisor.page.getByText("Bajo mínimo")).toBeVisible();
  // El consumo está en el libro, enlazado a su orden.
  await expect(supervisor.page.getByRole("row").filter({ hasText: "Consumo" }).first()).toContainText(/OT-\d{4}/);

  // ── Registra una entrada y la marca desaparece ──
  await supervisor.page.getByRole("button", { name: "Registrar entrada" }).click();
  const entry = supervisor.page.getByRole("dialog", { name: "Registrar entrada" });
  await entry.getByLabel(/Cantidad/).fill("6");
  await entry.getByLabel("Proveedor o factura (opcional)").fill("Factura 2231 · Distribuidora Láser");
  await entry.getByRole("button", { name: "Registrar entrada" }).click();
  await expect(entry).toBeHidden();
  await expect(supervisor.page.getByText("Bajo mínimo")).toHaveCount(0);
  const newest = supervisor.page.getByRole("row").nth(1);
  await expect(newest).toContainText("Entrada");
  await expect(newest).toContainText("+6");
  await expect(newest).toContainText("Factura 2231");

  await admin.context.close();
  await supervisor.context.close();
});

test.describe("el almacén", () => {
  test.use({ storageState: storageStateOf("supervisor") });

  test("«Bajo mínimo» filtra lo que hay que reponer", async ({ page }) => {
    await page.goto("/repuestos");
    await expect(page.getByLabel("Cargando repuestos")).toHaveCount(0);
    await page.getByRole("button", { name: /Bajo mínimo/ }).click();
    await expect(page.getByRole("link", { name: "Tóner HP 58A" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Cable DisplayPort 2 m" })).toHaveCount(0);
  });
});
