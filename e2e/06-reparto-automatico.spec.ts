import { expect, test } from "@playwright/test";
import { storageStateOf } from "./accounts";

/**
 * Recorrido 6 · Reparto automático.
 * El supervisor marca varios tickets sin responsable, pide el reparto, ve la
 * vista previa con lo que recibe cada persona y, al confirmar, ninguno queda
 * sin asignar. Nada se guarda antes de confirmar.
 */
test.use({ storageState: storageStateOf("supervisor") });

const TAG = `Reparto ${Date.now().toString(36)}`;
const TITLES = [1, 2, 3].map((n) => `${TAG} · equipo ${n}`);

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: storageStateOf("supervisor") });
  const { request } = context;
  const { items } = (await (await request.get("/api/v1/areas")).json()) as {
    items: { id: string; name: string }[];
  };
  const it = items.find((area) => area.name === "IT y Sistemas")!;
  for (const title of TITLES) {
    const created = await request.post("/api/v1/tickets", {
      data: { title, description: "El equipo no arranca desde esta mañana.", areaId: it.id },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
  }
  await context.close();
});

test("reparte los tickets sin responsable tras una vista previa", async ({ page }) => {
  await page.goto("/tickets");
  await page.getByRole("textbox", { name: "Buscar tickets" }).fill(TAG);
  for (const title of TITLES) await expect(page.getByText(title)).toBeVisible();

  await page.getByRole("checkbox", { name: "Seleccionar los tickets de esta página" }).check();
  await page.getByRole("button", { name: "Asignar", exact: true }).click();
  // Quien está ausente aparece, pero no se puede marcar.
  await expect(page.getByRole("checkbox", { name: /Carlos Ruiz/ })).toBeDisabled();
  await page.getByRole("button", { name: /Repartir automáticamente los 3 sin responsable/ }).click();

  const preview = page.getByRole("dialog", { name: "Reparto automático" });
  await expect(preview).toBeVisible();
  await expect(preview.getByRole("combobox")).toHaveCount(3);

  // Volver no guarda nada: los tres siguen sin responsable.
  await preview.getByRole("button", { name: "Volver" }).click();
  await expect(page.getByRole("dialog", { name: "Asignar 3 tickets" })).toBeVisible();
  await page.getByRole("button", { name: /Repartir automáticamente/ }).click();
  await page.getByRole("button", { name: "Confirmar reparto" }).click();
  await expect(preview).toBeHidden();

  await page.getByRole("button", { name: /^Sin asignar/ }).click();
  await page.getByRole("textbox", { name: "Buscar tickets" }).fill(TAG);
  await expect(page.getByText("Ningún ticket coincide con los filtros.")).toBeVisible();
});
