import type { Page } from "@playwright/test";

/**
 * La API de los E2E arranca sin clave de Gemini (`playwright.config.ts`), así que
 * para ver las tarjetas de IA del módulo 2 se simulan, en el navegador, las tres
 * respuestas que dependen de ella: el estado de la IA, la sugerencia de
 * reemplazo y la estimación. Lo que aquí se prueba es la pantalla —que monta la
 * tarjeta, muestra los números y enlaza los casos—; que las cifras salgan del
 * historial lo prueban `ai.maintenance.test.ts` y la prueba de la semilla.
 */

export const EXPLANATION =
  "La multifuncional vuelve a atascarse poco después de cada reparación y ya se le cambiaron " +
  "las piezas que suelen fallar: seguir reparándola cuesta más de lo que vale.";

export async function mockMaintenanceAi(page: Page): Promise<void> {
  await page.route("**/api/v1/ai/status", (route) =>
    route.fulfill({
      json: {
        configured: true,
        enabled: {
          suggestArea: true,
          classify: true,
          summary: true,
          autocomplete: true,
          detectIncidents: true,
          replacementAdvice: true,
          repairEstimate: true,
        },
      },
    }),
  );

  await page.route("**/api/v1/ai/assets/*/replacement", (route) =>
    route.fulfill({
      json: {
        advice: {
          reasons: ["repeated_failures", "repair_cost"],
          failuresInWindow: 3,
          windowDays: 90,
          failureThreshold: 3,
          failuresTotal: 6,
          repairCost: 131_400,
          purchaseCost: 120_000,
          repairShare: 1.095,
          ageMonths: 34,
          explanation: EXPLANATION,
          currency: "USD",
        },
      },
    }),
  );

  await page.route("**/api/v1/ai/work-orders/*/estimate", (route) =>
    route.fulfill({
      json: {
        estimate: {
          low: 6_000,
          median: 8_550,
          high: 12_000,
          poolSize: 18,
          currency: "USD",
          cases: [1, 2, 3].map((number, index) => ({
            id: `65f0000000000000000000a${index}`,
            number,
            title: ["Atasco de papel constante", "Rodillos gastados", "Se atasca el papel"][index]!,
            assetName: "Impresora de Finanzas",
            cost: [12_000, 8_550, 6_000][index]!,
            completedAt: new Date(Date.now() - (index + 1) * 20 * 86_400_000).toISOString(),
          })),
        },
        reason: null,
      },
    }),
  );
}
