import { expect, test } from "@playwright/test";
import { ACCOUNTS, DEMO_PASSWORD } from "./accounts";

/**
 * Recorrido 1 · Acceso.
 * Sin sesión no se entra; con una contraseña mal escrita se explica sin decir si
 * la cuenta existe; con la buena se llega al tablero y se puede salir.
 */
test.describe("Recorrido 1 · Acceso", () => {
  test("una ruta privada sin sesión devuelve al inicio de sesión", async ({ page }) => {
    await page.goto("/tickets");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeVisible();
  });

  test("la API rechaza sin sesión", async ({ request }) => {
    const response = await request.get("/api/v1/tickets");
    expect(response.status()).toBe(401);
  });

  test("contraseña incorrecta, luego correcta, y cerrar sesión", async ({ page }) => {
    await page.goto("/");

    await page.getByLabel("Correo electrónico").fill(ACCOUNTS.employee.email);
    await page.getByLabel("Contraseña", { exact: true }).fill("no-es-la-clave");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByText("Correo o contraseña incorrectos")).toBeVisible();

    await page.getByLabel("Contraseña", { exact: true }).fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();

    await expect(page).toHaveURL("/tablero");
    await expect(page.getByText(ACCOUNTS.employee.name).first()).toBeVisible();

    // Con sesión, el login ya no se enseña: lleva directo al tablero.
    await page.goto("/");
    await expect(page).toHaveURL("/tablero");

    await page.getByRole("button", { name: "Cerrar sesión" }).first().click();
    await expect(page).toHaveURL("/");
    await page.goto("/tablero");
    await expect(page).toHaveURL("/");
  });
});
