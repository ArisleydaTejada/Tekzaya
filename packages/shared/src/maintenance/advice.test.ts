import { describe, expect, it } from "vitest";
import { citesOnlyKnownNumbers, costRange, numbersIn, percentile, replacementReasons } from "./advice";

describe("¿reparar o reemplazar? (plan A7)", () => {
  const rule = { failureThreshold: 3 };

  it("fallas repetidas: el umbral de la configuración, incluido", () => {
    expect(replacementReasons({ ...rule, failuresInWindow: 3, repairCost: 0, purchaseCost: 100_000 })).toEqual(["repeated_failures"]);
    expect(replacementReasons({ ...rule, failuresInWindow: 2, repairCost: 0, purchaseCost: 100_000 })).toEqual([]);
  });

  it("reparaciones caras: la mitad del precio de compra ya cuenta", () => {
    expect(replacementReasons({ ...rule, failuresInWindow: 0, repairCost: 50_000, purchaseCost: 100_000 })).toEqual(["repair_cost"]);
    expect(replacementReasons({ ...rule, failuresInWindow: 0, repairCost: 49_999, purchaseCost: 100_000 })).toEqual([]);
  });

  it("sin precio de compra no se compara el costo", () => {
    expect(replacementReasons({ ...rule, failuresInWindow: 0, repairCost: 999_999, purchaseCost: null })).toEqual([]);
    expect(replacementReasons({ ...rule, failuresInWindow: 0, repairCost: 1, purchaseCost: 0 })).toEqual([]);
  });

  it("las dos razones a la vez", () => {
    expect(replacementReasons({ ...rule, failuresInWindow: 4, repairCost: 130_000, purchaseCost: 120_000 })).toEqual([
      "repeated_failures",
      "repair_cost",
    ]);
  });
});

describe("rango de costo (plan A7)", () => {
  it("percentil interpolado, como una hoja de cálculo", () => {
    // PERCENTIL.INC({10; 20; 30; 40}; 0,25) = 17,5 y la mediana 25.
    expect(percentile([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([10, 20, 30, 40], 0.75)).toBe(32.5);
    expect(percentile([7], 0.75)).toBe(7);
  });

  it("mediana y percentiles 25–75 en centavos, redondeados una vez y sin importar el orden", () => {
    // Cinco reparaciones: 40,00 · 120,00 · 85,50 · 60,00 · 300,00.
    // Ordenadas: 4000 6000 8550 12000 30000 → P25 = 6000, mediana = 8550, P75 = 12000.
    expect(costRange([12_000, 4_000, 8_550, 30_000, 6_000])).toEqual({ low: 6_000, median: 8_550, high: 12_000 });
    // Cuatro: 1001 1002 1003 1004 → P25 = 1001,75 → 1002; mediana 1002,5 → 1003.
    expect(costRange([1_004, 1_001, 1_003, 1_002])).toEqual({ low: 1_002, median: 1_003, high: 1_003 });
  });

  it("con menos de tres casos no hay estimación", () => {
    expect(costRange([5_000, 6_000])).toBeNull();
    expect(costRange([])).toBeNull();
    expect(costRange([0, 0, 0])).toEqual({ low: 0, median: 0, high: 0 });
  });
});

describe("la IA no inventa cifras (plan A7)", () => {
  const data = "Precio de compra: USD 1,200.00\nFallas en los últimos 90 días: 3\nAntigüedad: 34 meses";

  it("normaliza cifras escritas de formas distintas", () => {
    expect(numbersIn("1.250,00 y 1,250.00 y 04")).toEqual(["125000", "125000", "4"]);
  });

  it("acepta una explicación sin cifras o con las de los datos", () => {
    expect(citesOnlyKnownNumbers("Falla cada pocas semanas por el mismo rodillo.", data)).toBe(true);
    expect(citesOnlyKnownNumbers("Ya van 3 fallas en 90 días.", data)).toBe(true);
    expect(citesOnlyKnownNumbers("Costó 1.200 dólares.", data)).toBe(true);
  });

  it("rechaza una cifra que no le dimos", () => {
    expect(citesOnlyKnownNumbers("Uno nuevo cuesta unos 900 USD.", data)).toBe(false);
    expect(citesOnlyKnownNumbers("Ya van 4 fallas.", data)).toBe(false);
  });
});
