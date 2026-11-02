import { expect, test, type Browser } from "@playwright/test";
import { storageStateOf, type Role } from "./accounts";

/**
 * Recorrido 8 · De la queja al equipo reparado (DoD de A2 y recorrido 1 de la
 * defensa, A7). Un empleado de Ventas reporta la impresora de su área vinculando
 * el equipo; el formulario le sugiere mandarlo a IT, que es quien la mantiene. El
 * supervisor de IT convierte el ticket en una OT correctiva: la falla aparece en
 * la línea de tiempo del equipo, y la OT y el ticket se enlazan en los dos
 * sentidos. Después la toma, carga un repuesto y la completa resolviendo en el
 * mismo paso el ticket, y la historia del equipo lo muestra todo.
 */

const stamp = Date.now().toString(36);
const TITLE = `La multifuncional imprime con rayas ${stamp}`;
const PRINTER = "Impresora multifuncional de Ventas";

async function sessionAs(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: storageStateOf(role) });
  return { context, page: await context.newPage() };
}

test("crear ticket con equipo → convertir en OT → repararlo → resolver el ticket", async ({ browser }) => {
  const employee = await sessionAs(browser, "employee");
  const supervisor = await sessionAs(browser, "supervisor");

  // ── El empleado reporta y vincula la impresora de su área ──
  await employee.page.goto("/tickets/nuevo");
  await employee.page.getByLabel("Título / asunto").fill(TITLE);
  await employee.page.getByLabel("Descripción").fill("Todas las hojas salen con una raya negra vertical.");

  // "La multifuncional imprime…": la única impresora de su área se elige sola,
  // por coincidencia de palabras, sin IA.
  await expect(employee.page.getByText("Elegido por lo que escribiste.", { exact: false })).toBeVisible();
  await expect(employee.page.getByText(PRINTER)).toBeVisible();

  // El selector ofrece solo impresoras, con la opción de ver todos los equipos.
  await employee.page.getByRole("button", { name: "Cambiar" }).click();
  const picker = employee.page.getByRole("dialog", { name: "Vincular un equipo" });
  await expect(picker.getByText("Solo impresoras, por lo que escribiste.")).toBeVisible();
  await expect(picker.getByRole("region", { name: "A tu cargo" })).toHaveCount(0);
  await picker.getByRole("button", { name: "Ver todos los equipos" }).click();
  // Primero lo que tiene a su cargo, después lo que usa su área.
  // Varias laptops del mismo modelo: cada una dice quién la tiene.
  const mine = picker.getByRole("region", { name: "A tu cargo" });
  await expect(mine).toContainText(/Laptop /);
  await expect(mine).toContainText("Diego Castillo");
  await picker.getByRole("region", { name: "Los que usa tu área" }).getByRole("button", { name: new RegExp(PRINTER) }).click();
  await expect(picker).toBeHidden();
  await employee.page.getByLabel("Departamento de destino").selectOption({ label: "Ventas" });

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
  const order = (await card.getByText(/^OT-\d{4}$/).textContent())!.trim();
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

  // ── El supervisor la toma, carga un repuesto y la completa ──
  await supervisor.page.goto(`/ordenes/${order}`);
  await supervisor.page.getByRole("button", { name: "Tomar" }).click();
  await supervisor.page.getByRole("button", { name: "Iniciar trabajo" }).click();
  await expect(supervisor.page.getByText("En progreso", { exact: true }).first()).toBeVisible();
  const partPicker = supervisor.page.getByLabel(/Repuesto del almacén/);
  const toner = await partPicker.locator("option", { hasText: "Tóner Canon NPG-59" }).getAttribute("value");
  await partPicker.selectOption(toner!);
  await supervisor.page.getByRole("button", { name: "Usar ahora", exact: true }).click();
  await expect(supervisor.page.getByRole("button", { name: "Devolver Tóner Canon NPG-59 al almacén" })).toBeVisible();
  await supervisor.page.getByRole("button", { name: "Completar" }).click();
  const complete = supervisor.page.getByRole("dialog", { name: /Completar OT-\d{4}/ });
  await complete.getByLabel("Trabajo realizado").fill("Se cambió el tóner y se limpió el tambor; la hoja de prueba sale limpia.");

  // ── Y en el mismo paso resuelve el ticket, aunque tomó la orden y no el ticket ──
  const resolveToo = complete.getByLabel(`Resolver también el ticket ${number}`);
  await expect(resolveToo).toBeChecked();
  await expect(complete.getByText("Quedas como responsable del ticket.", { exact: false })).toBeVisible();
  // La nota para el solicitante copia el trabajo realizado hasta que se edita.
  const ticketNote = complete.getByLabel("Nota para el solicitante");
  await expect(ticketNote).toHaveValue(/Se cambió el tóner/);
  await ticketNote.fill("Cambiamos el tóner de la multifuncional; ya imprime sin rayas.");
  await complete.getByRole("button", { name: "Completar", exact: true }).click();
  await expect(complete).toBeHidden();
  await expect(supervisor.page.getByText("Completada", { exact: true }).first()).toBeVisible();
  await expect(supervisor.page.getByText("La orden se completó, pero el ticket sigue abierto.")).toHaveCount(0);

  await supervisor.page.getByRole("link", { name: new RegExp(number) }).click();
  await expect(supervisor.page).toHaveURL(`/tickets/${number}`);
  await expect(supervisor.page.getByText(`La orden de trabajo ${order} se completó`)).toBeVisible();
  await expect(supervisor.page.getByText("Cambiamos el tóner de la multifuncional").first()).toBeVisible();
  await expect(supervisor.page.getByText("Resuelto", { exact: true }).first()).toBeVisible();
  await expect(supervisor.page.getByRole("button", { name: "Resolver el ticket" })).toHaveCount(0);

  // ── La línea de tiempo del equipo cuenta la historia entera ──
  await supervisor.page.getByRole("region", { name: "Equipo afectado" }).getByRole("link", { name: PRINTER }).click();
  await supervisor.page.getByRole("tab", { name: "Historial" }).click();
  await expect(supervisor.page.getByRole("heading", { name: "Línea de tiempo" })).toBeVisible();
  const repair = supervisor.page.getByRole("listitem").filter({ hasText: "Se cambió el tóner" });
  await expect(repair).toContainText("Vuelve a estar operativo");
  await expect(supervisor.page.getByRole("listitem").filter({ hasText: `Falla: ${TITLE}` })).toBeVisible();

  // El solicitante ve que la orden terminó y la solución, sin las notas técnicas.
  await employee.page.reload();
  await expect(employee.page.getByText(`La orden de trabajo ${order} se completó`)).toBeVisible();
  await expect(employee.page.getByText("Cambiamos el tóner de la multifuncional").first()).toBeVisible();
  await expect(employee.page.getByText("se limpió el tambor")).toHaveCount(0);

  await employee.context.close();
  await supervisor.context.close();
});

test.describe("desde la ficha del equipo", () => {
  test.use({ storageState: storageStateOf("employee") });

  test("«Reportar una falla» abre el ticket con el equipo y su área ya elegidos", async ({ page }) => {
    await page.goto("/activos");
    await page.getByRole("textbox", { name: "Buscar activos" }).fill("Diego Castillo");
    // La búsqueda espera a que se deje de escribir: primero hay que ver solo la suya.
    await expect(page.getByRole("link", { name: /^Laptop / })).toHaveCount(1);
    await page.getByRole("link", { name: /^Laptop / }).click();
    const laptop = (await page.getByRole("heading", { level: 1 }).textContent())!.trim();
    await page.getByRole("link", { name: "Reportar una falla" }).click();

    await expect(page).toHaveURL(/\/tickets\/nuevo\?activo=ACT-\d{4}$/);
    await expect(page.getByText("Equipo afectado")).toBeVisible();
    await expect(page.getByText(laptop)).toBeVisible();
    await expect(page.getByLabel("Departamento de destino").locator("option:checked")).toHaveText("IT y Sistemas");

    // Quitarlo deja el formulario de siempre.
    await page.getByRole("button", { name: "Quitar equipo" }).click();
    await expect(page.getByRole("button", { name: "Vincular un equipo" })).toBeVisible();
  });
});
