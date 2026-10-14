import { expect, test, type Page } from "@playwright/test";
import { storageStateOf } from "./accounts";

/**
 * Recorrido 3 · Kanban persistente.
 * Arrastrar una tarjeta guarda el estado en el servidor (sobrevive a recargar),
 * se puede mover también con teclado, y una transición que el ciclo de vida no
 * permite vuelve la tarjeta a su sitio con un aviso.
 */
test.use({ storageState: storageStateOf("supervisor") });

const TITLE = `Revisar el proyector de la sala B ${Date.now().toString(36)}`;

async function openBoard(page: Page) {
  await page.goto("/tickets");
  await page.getByRole("button", { name: "kanban" }).click();
  await page.getByRole("textbox", { name: "Buscar tickets" }).fill(TITLE);
}

const column = (page: Page, name: string) => page.getByRole("region", { name, exact: true });
const card = (page: Page) => page.getByRole("article", { name: TITLE });
/** Con teclado se arrastra desde el número de la tarjeta, que es un botón. */
const handle = (page: Page) => card(page).getByRole("button", { name: /^Mover TK-\d{6}$/ });

async function dragTo(page: Page, target: string) {
  const from = await card(page).boundingBox();
  const to = await column(page, target).boundingBox();
  if (!from || !to) throw new Error("No se ve la tarjeta o la columna");
  await page.mouse.move(from.x + 20, from.y + 12);
  await page.mouse.down();
  // Varios pasos: dnd-kit no empieza a arrastrar hasta moverse 6 px.
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  await page.mouse.up();
}

test.beforeAll(async ({ browser }) => {
  // El ticket de la prueba se prepara por la API: lo que se prueba es el tablero.
  const context = await browser.newContext({ storageState: storageStateOf("supervisor") });
  const { request } = context;
  const { items } = (await (await request.get("/api/v1/areas")).json()) as {
    items: { id: string; name: string }[];
  };
  const it = items.find((area) => area.name === "IT y Sistemas")!;

  const created = await request.post("/api/v1/tickets", {
    data: {
      title: TITLE,
      description: "El proyector parpadea y se apaga a los pocos minutos de encenderlo.",
      areaId: it.id,
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };
  expect((await request.post(`/api/v1/tickets/${id}/take`)).ok()).toBeTruthy();
  await context.close();
});

test("arrastrar persiste, el teclado también mueve, y una transición inválida se revierte", async ({
  page,
}) => {
  await openBoard(page);
  await expect(column(page, "Asignado").getByText(TITLE)).toBeVisible();

  // ── Con el ratón: Asignado → En progreso, y sobrevive a recargar ──
  await dragTo(page, "En progreso");
  await expect(column(page, "En progreso").getByText(TITLE)).toBeVisible();
  await page.reload();
  await openBoard(page);
  await expect(column(page, "En progreso").getByText(TITLE)).toBeVisible();

  // ── Una transición que el ciclo de vida no permite: En progreso → Abierto ──
  await dragTo(page, "Abierto");
  await expect(page.getByRole("alert")).toHaveText(
    "Un ticket «En progreso» no puede pasar a «Abierto»",
  );
  await expect(column(page, "En progreso").getByText(TITLE)).toBeVisible();
  await expect(column(page, "Abierto").getByText(TITLE)).toHaveCount(0);

  // ── Con teclado: Espacio levanta, flecha izquierda cambia de columna ──
  // Desde un tablero recién cargado: si la lista se refresca a mitad de un
  // arrastre (lo hace tras el rechazo de arriba), dnd-kit vuelve a medir las
  // columnas y la flecha se pierde.
  await page.reload();
  await openBoard(page);
  await expect(column(page, "En progreso").getByText(TITLE)).toBeVisible();
  // Cada paso espera a su anuncio: es lo que oye un lector de pantalla, y además
  // marca el momento en que el sensor ya está escuchando la siguiente tecla.
  const announcer = page.getByRole("status").filter({ hasText: /TK-\d{6}/ });
  await handle(page).focus();
  await page.keyboard.press("Space");
  // Al levantarla, dnd-kit anuncia de inmediato la columna en la que está.
  await expect(announcer).toContainText("sobre la columna En progreso");
  await page.keyboard.press("ArrowLeft");
  await expect(announcer).toContainText("sobre la columna Asignado");
  await page.keyboard.press("Space");
  await expect(announcer).toContainText("soltado en Asignado");
  await expect(column(page, "Asignado").getByText(TITLE)).toBeVisible();
  await page.reload();
  await openBoard(page);
  await expect(column(page, "Asignado").getByText(TITLE)).toBeVisible();
});
