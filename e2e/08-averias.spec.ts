import { expect, test, type Browser } from "@playwright/test";
import { storageStateOf, type Role } from "./accounts";

/**
 * Recorrido 8 · De la queja a la orden de trabajo (DoD de A2).
 * Un empleado de Ventas reporta la impresora de su área vinculando el equipo; el
 * formulario le sugiere mandarlo a IT, que es quien la mantiene. El supervisor de
 * IT convierte el ticket en una OT correctiva: la falla aparece en la línea de
 * tiempo del equipo, y la OT y el ticket se enlazan en los dos sentidos.
 */

const stamp = Date.now().toString(36);
const TITLE = `La multifuncional imprime con rayas ${stamp}`;
const PRINTER = "Impresora multifuncional de Ventas";

async function sessionAs(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: storageStateOf(role) });
  return { context, page: await context.newPage() };
}

test("crear ticket con equipo → convertir en OT → la falla queda en la historia del equipo", async ({ browser }) => {
  const employee = await sessionAs(browser, "employee");
  const supervisor = await sessionAs(browser, "supervisor");

  // ── El empleado reporta y vincula la impresora de su área ──
  await employee.page.goto("/tickets/nuevo");
  await employee.page.getByLabel("Título / asunto").fill(TITLE);
  await employee.page.getByLabel("Descripción").fill("Todas las hojas salen con una raya negra vertical.");
  await employee.page.getByLabel("Departamento de destino").selectOption({ label: "Ventas" });

  await employee.page.getByRole("button", { name: "Vincular un equipo" }).click();
  const picker = employee.page.getByRole("dialog", { name: "Vincular un equipo" });
  // Primero lo que tiene a su cargo, después lo que usa su área.
  await expect(picker.getByRole("region", { name: "A tu cargo" })).toContainText("Laptop de Diego Castillo");
  await picker.getByRole("region", { name: "Los que usa tu área" }).getByRole("button", { name: new RegExp(PRINTER) }).click();
  await expect(picker).toBeHidden();

  // El área elegida no es la que mantiene el equipo: se sugiere, no se impone.
  await expect(employee.page.getByText("Este equipo lo mantiene IT y Sistemas.")).toBeVisible();
  await employee.page.getByRole("button", { name: "Enviar el ticket a IT y Sistemas" }).click();
  await expect(employee.page.getByLabel("Departamento de destino")).toHaveValue(/.+/);
  await expect(employee.page.getByText("Este equipo lo mantiene IT y Sistemas.")).toHaveCount(0);

  await employee.page.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(employee.page.getByRole("heading", { name: "¡Ticket creado!" })).toBeVisible();
  await expect(employee.page.getByText(PRINTER, { exact: false })).toBeVisible();
  const number = (await employee.page.getByText(/^TK-\d{6}$/).textContent())!.trim();

  // ── El supervisor de IT lo convierte en orden de trabajo ──
  await supervisor.page.goto(`/tickets/${number}`);
  await expect(supervisor.page.getByRole("region", { name: "Equipo afectado" })).toBeVisible();
  await supervisor.page.getByRole("button", { name: "Convertir en orden de trabajo" }).click();
  const modal = supervisor.page.getByRole("dialog", { name: "Convertir en orden de trabajo" });
  const open = modal.getByRole("button", { name: "Abrir orden correctiva" });
  // Sin responder si el equipo queda fuera de servicio no se abre.
  await expect(open).toBeDisabled();
  await modal.getByLabel(/Sí, no se puede usar/).check();
  await open.click();
  await expect(modal).toBeHidden();

  const card = supervisor.page.getByRole("region", { name: "Equipo afectado" });
  await expect(card.getByText(/^OT-\d{4}$/)).toBeVisible();
  await expect(card.getByText("Pendiente")).toBeVisible();
  await expect(card.getByText("En reparación")).toBeVisible();
  await expect(supervisor.page.getByRole("button", { name: "Convertir en orden de trabajo" })).toHaveCount(0);
  await expect(supervisor.page.getByText(/Se abrió la orden de trabajo OT-\d{4}/)).toBeVisible();

  // ── En la ficha del equipo, la falla enlaza de vuelta al ticket ──
  await supervisor.page.getByRole("link", { name: PRINTER }).click();
  await expect(supervisor.page.getByRole("heading", { level: 1, name: PRINTER })).toBeVisible();
  await supervisor.page.getByRole("tab", { name: "Historial" }).click();
  await expect(supervisor.page.getByRole("heading", { name: "Línea de tiempo" })).toBeVisible();
  const failure = supervisor.page.getByRole("listitem").filter({ hasText: `Falla: ${TITLE}` });
  await expect(failure).toContainText("Quedó fuera de servicio");
  await failure.getByRole("link", { name: number }).click();
  await expect(supervisor.page).toHaveURL(`/tickets/${number}`);

  // ── El solicitante ve el equipo y su estado, no la orden ──
  await employee.page.goto(`/tickets/${number}`);
  await expect(employee.page.getByRole("region", { name: "Equipo afectado" })).toBeVisible();
  await expect(employee.page.getByText("Órdenes de trabajo")).toHaveCount(0);
  await expect(employee.page.getByText("Últimas averías")).toHaveCount(0);

  await employee.context.close();
  await supervisor.context.close();
});

test.describe("desde la ficha del equipo", () => {
  test.use({ storageState: storageStateOf("employee") });

  test("«Reportar una falla» abre el ticket con el equipo y su área ya elegidos", async ({ page }) => {
    await page.goto("/activos");
    await page.getByRole("textbox", { name: "Buscar activos" }).fill("Laptop de Diego");
    await page.getByRole("link", { name: "Laptop de Diego Castillo" }).click();
    await page.getByRole("link", { name: "Reportar una falla" }).click();

    await expect(page).toHaveURL(/\/tickets\/nuevo\?activo=ACT-\d{4}$/);
    await expect(page.getByText("Equipo afectado")).toBeVisible();
    await expect(page.getByText("Laptop de Diego Castillo")).toBeVisible();
    await expect(page.getByLabel("Departamento de destino").locator("option:checked")).toHaveText("IT y Sistemas");

    // Quitarlo deja el formulario de siempre.
    await page.getByRole("button", { name: "Quitar equipo" }).click();
    await expect(page.getByRole("button", { name: "Vincular un equipo" })).toBeVisible();
  });
});
