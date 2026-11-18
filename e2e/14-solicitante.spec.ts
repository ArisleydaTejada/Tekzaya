import { expect, test, type Browser, type Page } from "@playwright/test";
import { ACCOUNTS, storageStateOf, type Role } from "./accounts";

/**
 * Recorrido 14 · El solicitante (docs/PLAN_ROL_SOLICITANTE.md).
 *
 * Lucía es de Ventas pero no atiende Ventas: solo pide ayuda y sigue lo suyo.
 * Crea un ticket hacia IT, no puede elegir un área que no atiende tickets, ve la
 * respuesta del supervisor y no ve nada de lo que su área trabaja.
 */

const stamp = Date.now().toString(36);
const TITLE = `La impresora de ventas no imprime ${stamp}`;
const PUBLIC_REPLY = `Ya la reiniciamos, prueba de nuevo (${stamp}).`;

async function sessionAs(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: storageStateOf(role) });
  return { context, page: await context.newPage() };
}

/**
 * Área nueva que no atiende tickets. Se crea en vez de apagar una de la semilla:
 * apagar una convierte a sus empleados en solicitantes y movería los demás recorridos.
 */
async function createClosedArea(page: Page, name: string): Promise<string> {
  const created = await page.request.post("/api/v1/admin/areas", {
    data: { name, color: "#7c8cae", receivesTickets: false, categories: [] },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { items } = (await created.json()) as { items: { id: string; name: string }[] };

  return items.find((area) => area.name === name)!.id;
}

test("el solicitante pide, recibe respuesta y no ve su área", async ({ browser }) => {
  const admin = await sessionAs(browser, "admin");
  const requester = await sessionAs(browser, "requester");
  const supervisor = await sessionAs(browser, "supervisor");

  // ── Un área que no atiende tickets, creada aquí para no tocar la semilla ──
  const closedName = `Vigilancia ${stamp}`;
  const closed = await createClosedArea(admin.page, closedName);

  try {
    // ── Su tablero: solo sus solicitudes ──
    await requester.page.goto("/tablero");
    await expect(requester.page.getByText("Necesitan tu respuesta")).toBeVisible();
    await expect(requester.page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible();
    await expect(requester.page.getByRole("heading", { name: "Asignados a mí" })).toHaveCount(0);
    await expect(requester.page.getByRole("link", { name: "Órdenes de trabajo" })).toHaveCount(0);

    // ── Crea un ticket: el área que no atiende tickets no aparece como destino ──
    await requester.page.goto("/tickets/nuevo");
    const destino = requester.page.getByLabel("Área de destino");
    await expect(destino.locator("option", { hasText: closedName })).toHaveCount(0);
    await expect(requester.page.getByRole("button", { name: "¿Es para un compañero?" })).toHaveCount(0);

    await requester.page.getByLabel("Título / asunto").fill(TITLE);
    await requester.page
      .getByLabel("Descripción")
      .fill("La impresora del área de ventas no responde desde esta mañana.");
    await destino.selectOption({ label: "IT y Sistemas" });
    await requester.page.getByLabel(/Categoría/).selectOption({ label: "Hardware" });
    await requester.page.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(requester.page.getByRole("heading", { name: "¡Ticket creado!" })).toBeVisible();
    const number = (await requester.page.getByText(/^TK-\d{6}$/).textContent())!.trim();

    // ── IT responde ──
    await supervisor.page.goto(`/tickets/${number}`);
    await supervisor.page.getByRole("button", { name: "Tomar" }).click();
    await supervisor.page.getByRole("textbox", { name: "Respuesta" }).fill(PUBLIC_REPLY);
    await supervisor.page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(supervisor.page.getByText(PUBLIC_REPLY, { exact: true })).toBeVisible();

    // ── El solicitante ve la respuesta, sin acciones de agente ──
    await requester.page.goto(`/tickets/${number}`);
    await expect(requester.page.getByText(PUBLIC_REPLY, { exact: true })).toBeVisible();
    await expect(requester.page.getByRole("button", { name: "Interna" })).toHaveCount(0);
    await expect(requester.page.getByRole("button", { name: "Tomar" })).toHaveCount(0);

    // ── La lista es solo suya, aunque pida "Mi área" a mano ──
    await requester.page.goto("/tickets?scope=area");
    await expect(requester.page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible();
    await expect(requester.page.getByRole("button", { name: /Mi área/ })).toHaveCount(0);
    await expect(requester.page.getByRole("link", { name: new RegExp(TITLE) }).first()).toBeVisible();

    const area = await requester.page.request.get("/api/v1/tickets?scope=area");
    expect(area.status()).toBe(403);

    const all = (await (await requester.page.request.get("/api/v1/tickets?scope=all&limit=100")).json()) as {
      items: { requester: { name: string }; createdBy?: { name: string } }[];
    };
    for (const ticket of all.items) {
      expect(ticket.requester.name).toBe(ACCOUNTS.requester.name);
    }
  } finally {
    await admin.page.request.patch(`/api/v1/admin/areas/${closed}`, { data: { isActive: false } });
    await admin.context.close();
    await requester.context.close();
    await supervisor.context.close();
  }
});

test("invitar: el error va bajo su campo y un área sin tickets solo admite solicitantes", async ({ browser }) => {
  const admin = await sessionAs(browser, "admin");
  const closed = await createClosedArea(admin.page, `Seguridad ${stamp}`);

  try {
    await admin.page.goto("/administracion/usuarios");
    await admin.page.getByRole("button", { name: "Invitar" }).click();
    const dialog = admin.page.getByRole("dialog");

    await dialog.getByLabel("Nombre completo").fill("Manolo Gómez");
    await dialog.getByLabel("Correo").fill("manolo.gomez@das");
    await dialog.getByLabel("Área").selectOption({ label: `Seguridad ${stamp} (no atiende tickets)` });

    // Al elegir un área sin tickets, el rol pasa solo a Solicitante.
    await expect(dialog.getByLabel("Rol")).toHaveValue("requester");
    await expect(dialog.getByRole("option", { name: "Empleado" })).toBeDisabled();
    await expect(dialog.getByRole("option", { name: /Supervisor de RRHH/ })).toBeDisabled();

    await dialog.getByRole("button", { name: "Generar enlace de invitación" }).click();
    await expect(dialog.getByText("Escribe un correo completo, por ejemplo nombre@empresa.com")).toBeVisible();
    await expect(dialog.getByLabel("Correo")).toHaveAttribute("aria-invalid", "true");
  } finally {
    await admin.page.request.patch(`/api/v1/admin/areas/${closed}`, { data: { isActive: false } });
    await admin.context.close();
  }
});
