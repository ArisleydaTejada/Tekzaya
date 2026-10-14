import { expect, test, type Browser, type Page } from "@playwright/test";
import { storageStateOf, type Role } from "./accounts";

/**
 * Recorrido 5 · Reportes y alcance por rol.
 * Cada rol ve solo los alcances que su permiso concede, las plantillas pintan
 * gráficas con datos reales, y pedir a mano un alcance mayor en el payload
 * responde 403 (DoD de F7): ocultar el botón no es la defensa, el servidor sí.
 */

async function openReports(browser: Browser, role: Role) {
  const context = await browser.newContext({ storageState: storageStateOf(role) });
  const page = await context.newPage();
  await page.goto("/reportes");
  return { context, page };
}

const scopeButtons = (page: Page) => page.getByRole("group", { name: "Alcance" }).getByRole("button");

const KPI_WIDGET = {
  id: "w1",
  title: "Creados",
  chart: "kpi",
  measures: [{ key: "created" }],
  filters: {},
  sort: "value_desc",
  showValues: true,
  showLegend: true,
  showTarget: false,
  layout: { w: 1 },
};

async function expectChartsRendered(page: Page) {
  await page.getByRole("tab", { name: /^Plantillas/ }).click();
  await page.getByRole("tabpanel").getByRole("button").first().click();
  await expect(page.getByRole("button", { name: /^Opciones de / }).first()).toBeVisible();
  await expect(page.getByLabel("Cargando gráfica")).toHaveCount(0, { timeout: 15_000 });
}

test("el empleado solo reporta sobre sí mismo, y forzar el payload da 403", async ({ browser }) => {
  const { context, page } = await openReports(browser, "employee");

  // Con un único alcance posible no hay selector que enseñar.
  await expect(page.getByRole("group", { name: "Alcance" })).toHaveCount(0);
  await expectChartsRendered(page);

  const ok = await page.request.post("/api/v1/reports/query", {
    data: { scope: "me", widget: KPI_WIDGET },
  });
  expect(ok.status()).toBe(200);

  for (const scope of ["area", "global"]) {
    const forced = await page.request.post("/api/v1/reports/query", {
      data: { scope, widget: KPI_WIDGET },
    });
    expect(forced.status(), `alcance ${scope}`).toBe(403);
  }
  await context.close();
});

test("el supervisor ve su área, una persona de su área o a sí mismo", async ({ browser }) => {
  const { context, page } = await openReports(browser, "supervisor");
  await expect(scopeButtons(page)).toHaveText(["Mi área", "Una persona de mi área", "Yo"]);
  await expectChartsRendered(page);

  const forced = await page.request.post("/api/v1/reports/query", {
    data: { scope: "global", widget: KPI_WIDGET },
  });
  expect(forced.status()).toBe(403);
  await context.close();
});

for (const role of ["admin", "rrhh"] as const) {
  test(`${role === "admin" ? "la administradora" : "RRHH"} ve las cuatro opciones de alcance`, async ({
    browser,
  }) => {
    const { context, page } = await openReports(browser, role);
    await expect(scopeButtons(page)).toHaveText(["Todas las áreas", "Un área", "Una persona", "Yo"]);
    await scopeButtons(page).filter({ hasText: "Todas las áreas" }).click();
    await expect(scopeButtons(page).filter({ hasText: "Todas las áreas" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expectChartsRendered(page);
    await context.close();
  });
}
