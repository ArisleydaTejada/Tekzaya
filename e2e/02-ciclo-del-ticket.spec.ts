import { expect, test, type Browser } from "@playwright/test";
import { ACCOUNTS, storageStateOf, type Role } from "./accounts";

/**
 * Recorrido 2 · El ciclo completo de un ticket, entre dos personas.
 *
 * Un empleado de Ventas pide ayuda a IT; el supervisor de IT lo toma, le contesta,
 * deja una nota interna y lo resuelve. El solicitante lee la respuesta y la
 * solución, NO la nota interna, y califica la atención.
 *
 * Es el recorrido que sostiene el principio más importante del producto: la
 * trastienda del área no se filtra al solicitante (spec §10.4).
 */

const stamp = Date.now().toString(36);
const TITLE = `No arranca el monitor de la sala ${stamp}`;
const PUBLIC_REPLY = `Voy a revisarlo en tu puesto (${stamp}).`;
const INTERNAL_NOTE = `Nota interna: el monitor ya falló el mes pasado (${stamp}).`;
const SOLUTION = `Cambiamos el cable de video (${stamp}).`;

async function sessionAs(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: storageStateOf(role) });
  return { context, page: await context.newPage() };
}

test("crear → tomar → responder → nota interna → resolver → CSAT", async ({ browser }) => {
  const employee = await sessionAs(browser, "employee");
  const supervisor = await sessionAs(browser, "supervisor");

  // ── El empleado crea el ticket, sin IA: área elegida a mano ──
  await employee.page.goto("/tickets/nuevo");
  await employee.page.getByLabel("Título / asunto").fill(TITLE);
  await employee.page
    .getByLabel("Descripción")
    .fill("La pantalla se queda en negro al encender el equipo de la sala de reuniones.");
  // Sin clave de Gemini no se ofrece clasificar con IA: no se promete lo que no ocurrirá.
  await expect(employee.page.getByRole("button", { name: "Clasificar con IA" })).toHaveCount(0);
  await employee.page.getByLabel("Departamento de destino").selectOption({ label: "IT y Sistemas" });
  await employee.page.getByLabel(/Categoría/).selectOption({ label: "Hardware" });
  await employee.page.getByRole("button", { name: "Enviar solicitud" }).click();

  await expect(employee.page.getByRole("heading", { name: "¡Ticket creado!" })).toBeVisible();
  const number = (await employee.page.getByText(/^TK-\d{6}$/).textContent())!.trim();
  // Sin IA, la prioridad por defecto es Media (spec §6.3).
  await expect(employee.page.getByText("Media", { exact: true })).toBeVisible();

  // ── El supervisor de IT lo encuentra en su bandeja y lo toma ──
  await supervisor.page.goto("/tickets");
  await supervisor.page.getByRole("link", { name: new RegExp(TITLE) }).first().click();
  await expect(supervisor.page).toHaveURL(`/tickets/${number}`);
  await supervisor.page.getByRole("button", { name: "Tomar" }).click();
  await expect(supervisor.page.getByRole("button", { name: "Tomar" })).toHaveCount(0);

  // Respuesta pública
  await supervisor.page.getByRole("textbox", { name: "Respuesta" }).fill(PUBLIC_REPLY);
  await supervisor.page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(supervisor.page.getByText(PUBLIC_REPLY, { exact: true })).toBeVisible();

  // Nota interna
  await supervisor.page.getByRole("button", { name: "Interna" }).click();
  await supervisor.page.getByRole("textbox", { name: "Nota interna" }).fill(INTERNAL_NOTE);
  await supervisor.page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(supervisor.page.getByText(INTERNAL_NOTE)).toBeVisible();

  // Resolver exige nota de solución
  await supervisor.page.getByLabel("Estado del ticket").selectOption({ label: "Resuelto" });
  const resolveButton = supervisor.page.getByRole("button", { name: "Marcar como resuelto" });
  await expect(resolveButton).toBeDisabled();
  await supervisor.page.getByLabel("Nota de solución (obligatoria)").fill(SOLUTION);
  await resolveButton.click();
  await expect(supervisor.page.getByLabel("Estado del ticket")).toHaveValue("resolved");

  // ── El solicitante ve la respuesta y la solución, nunca la nota interna ──
  await employee.page.goto(`/tickets/${number}`);
  await expect(employee.page.getByText(PUBLIC_REPLY, { exact: true })).toBeVisible();
  await expect(employee.page.getByText(SOLUTION, { exact: true })).toBeVisible();
  await expect(employee.page.getByText(INTERNAL_NOTE)).toHaveCount(0);
  await expect(employee.page.getByRole("button", { name: "Interna" })).toHaveCount(0);

  // Tampoco por la API: el filtro está en la consulta, no en la pantalla.
  const detail = await employee.page.request.get(`/api/v1/tickets/by-number/${number.slice(3)}`);
  expect(detail.ok()).toBeTruthy();
  const { id } = (await detail.json()) as { id: string };
  const messages = await employee.page.request.get(`/api/v1/tickets/${id}/messages`);
  expect(await messages.text()).not.toContain(INTERNAL_NOTE);

  // ── Encuesta de satisfacción: una sola vez ──
  await employee.page.getByRole("button", { name: "5 de 5" }).click();
  await employee.page.getByRole("button", { name: "Enviar calificación" }).click();
  await expect(employee.page.getByRole("button", { name: "Enviar calificación" })).toHaveCount(0);

  await employee.context.close();
  await supervisor.context.close();
});

test("el empleado no puede abrir un ticket de otra área ajeno a él", async ({ browser }) => {
  // Un ticket de Mantenimiento que Diego (Ventas) no pidió: no debe poder leerlo.
  const admin = await sessionAs(browser, "admin");
  const list = await admin.page.request.get("/api/v1/tickets?scope=all&limit=100");
  const { items } = (await list.json()) as {
    items: { number: number; area: { name: string }; requester: { name: string } }[];
  };
  const foreign = items.find(
    (t) => t.area.name === "Mantenimiento" && t.requester.name !== ACCOUNTS.employee.name,
  );
  expect(foreign, "la semilla trae tickets de Mantenimiento").toBeTruthy();
  await admin.context.close();

  const employee = await sessionAs(browser, "employee");
  const response = await employee.page.request.get(`/api/v1/tickets/by-number/${foreign!.number}`);
  expect([403, 404]).toContain(response.status());
  await employee.context.close();
});
