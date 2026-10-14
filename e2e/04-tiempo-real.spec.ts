import { expect, test, type Locator } from "@playwright/test";
import { storageStateOf } from "./accounts";

/**
 * Recorrido 4 · Tiempo real.
 * Con dos sesiones abiertas, lo que hace una aparece en la otra sin recargar
 * (DoD de F6): el empleado crea un ticket para IT y el supervisor ve subir el
 * tablero de su área y le llega el aviso a la campana.
 */

async function tileValue(tile: Locator): Promise<number> {
  // El número es el único párrafo de la tarjeta; el pie ("8 sin asignar") va aparte.
  const text = (await tile.locator("p").first().textContent()) ?? "";
  const value = Number(text.trim());
  if (!Number.isInteger(value)) throw new Error(`La tarjeta no tiene número: «${text}»`);
  return value;
}

test("un ticket nuevo sube el tablero del supervisor y suena la campana, sin recargar", async ({
  browser,
}) => {
  const supervisorContext = await browser.newContext({ storageState: storageStateOf("supervisor") });
  const supervisor = await supervisorContext.newPage();
  await supervisor.goto("/tablero");

  const pending = supervisor.getByRole("link", { name: /^Tickets pendientes/ });
  await expect(pending).toBeVisible();
  const before = await tileValue(pending);
  const bell = supervisor.getByRole("button", { name: /^Notificaciones/ });
  const bellBefore = (await bell.getAttribute("aria-label")) ?? "";

  // ── El empleado, en otra sesión, crea un ticket para IT ──
  const employeeContext = await browser.newContext({ storageState: storageStateOf("employee") });
  const employee = await employeeContext.newPage();
  await employee.goto("/tickets/nuevo");
  await employee.getByLabel("Título / asunto").fill(`El teclado no responde ${Date.now()}`);
  await employee
    .getByLabel("Descripción")
    .fill("Algunas teclas dejaron de funcionar después de derramar café sobre el teclado.");
  await employee.getByLabel("Departamento de destino").selectOption({ label: "IT y Sistemas" });
  await employee.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(employee.getByRole("heading", { name: "¡Ticket creado!" })).toBeVisible();

  // ── Sin recargar, el tablero del supervisor sube en uno ──
  // El umbral del DoD es 1 s; en la prueba se da margen para no ser frágil en CI.
  await expect.poll(() => tileValue(pending), { timeout: 5_000 }).toBe(before + 1);
  await expect(bell).not.toHaveAttribute("aria-label", bellBefore);
  await expect(bell).toHaveAttribute("aria-label", /sin leer/);

  await bell.click();
  await expect(supervisor.getByText("Nuevo ticket en tu área").first()).toBeVisible();

  await employeeContext.close();
  await supervisorContext.close();
});
