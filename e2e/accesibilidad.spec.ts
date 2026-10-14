import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { storageStateOf, type Role } from "./accounts";

/**
 * Accesibilidad (spec §13): contraste AA, controles con nombre y 360 px.
 *
 * axe revisa cada pantalla principal en los dos temas. No sustituye recorrerla
 * con teclado y lector de pantalla, pero sí impide que vuelva a colarse un
 * contraste insuficiente o un campo sin etiqueta sin que nadie lo note.
 */

const PAGES: { name: string; path: string; role: Role; ready?: (page: Page) => Promise<void> }[] = [
  { name: "tablero (supervisor)", path: "/tablero", role: "supervisor" },
  { name: "tablero (empleado)", path: "/tablero", role: "employee" },
  { name: "tickets · lista", path: "/tickets", role: "supervisor" },
  {
    name: "tickets · kanban",
    path: "/tickets",
    role: "supervisor",
    ready: (page) => page.getByRole("button", { name: "kanban" }).click(),
  },
  { name: "nuevo ticket", path: "/tickets/nuevo", role: "employee" },
  {
    // El principal de la fusión de la semilla: trae duplicados, responsables y
    // conversación, así que es el detalle con más piezas a la vista.
    name: "detalle de ticket",
    path: "/tickets",
    role: "admin",
    ready: async (page) => {
      await page.getByRole("textbox", { name: "Buscar tickets" }).fill("Caída general de red");
      await page.getByRole("link", { name: "Caída general de red en el edificio" }).first().click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText("Cargando la conversación…")).toHaveCount(0);
    },
  },
  {
    name: "reportes",
    path: "/reportes",
    role: "admin",
    ready: (page) => expect(page.getByLabel("Cargando gráfica")).toHaveCount(0, { timeout: 15_000 }),
  },
  { name: "administración · usuarios", path: "/administracion/usuarios", role: "admin" },
  { name: "administración · configuración", path: "/administracion/configuracion", role: "admin" },
  { name: "perfil", path: "/perfil", role: "employee" },
];

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  // Una línea por elemento: así el fallo dice qué arreglar, no solo cuántos hay.
  const report = results.violations.flatMap((violation) =>
    violation.nodes.map(
      (node) => `${violation.id} · ${node.target.join(" ")} · ${node.failureSummary?.split("\n")[1]?.trim() ?? ""}`,
    ),
  );
  expect(report).toEqual([]);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`tema ${theme === "light" ? "claro" : "oscuro"}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        window.localStorage.setItem("tekzaya-theme", value);
      }, theme);
    });

    test("inicio de sesión", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Bienvenido de nuevo" })).toBeVisible();
      await audit(page);
    });

    for (const target of PAGES) {
      test(target.name, async ({ browser }) => {
        const context = await browser.newContext({ storageState: storageStateOf(target.role) });
        await context.addInitScript((value) => {
          window.localStorage.setItem("tekzaya-theme", value);
        }, theme);
        const page = await context.newPage();
        await page.goto(target.path);
        await page.waitForLoadState("networkidle");
        await target.ready?.(page);
        // Las animaciones de entrada pasan por opacidades intermedias que axe
        // mediría como contraste insuficiente; se audita el estado final.
        await page.waitForTimeout(600);
        await audit(page);
        await context.close();
      });
    }
  });
}

test.describe("360 px de ancho", () => {
  test.use({ viewport: { width: 360, height: 740 }, storageState: storageStateOf("supervisor") });

  for (const path of ["/tablero", "/tickets", "/tickets/nuevo", "/reportes"]) {
    test(`${path} no desborda horizontalmente`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "la página entera no debe desplazarse de lado").toBeLessThanOrEqual(0);
    });
  }
});
