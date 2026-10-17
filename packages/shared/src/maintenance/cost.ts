/**
 * Costo de una orden de trabajo = repuestos + mano de obra + costos externos
 * (plan A3). Todo en centavos enteros; es una función pura para poder cuadrarla
 * a mano en las pruebas, igual que el motor de SLA del módulo 1.
 */
export interface WorkOrderCostInput {
  /** `rate` es la tarifa por hora del área, en centavos, congelada al registrar. */
  timeEntries: readonly { minutes: number; rate: number }[];
  /** `unitCost` es el costo promedio de la pieza en el momento de consumirla. */
  partsUsed: readonly { qty: number; unitCost: number }[];
  externalCosts: readonly { amount: number }[];
}

export interface WorkOrderCost {
  labor: number;
  parts: number;
  external: number;
  total: number;
}

export function workOrderCost(input: WorkOrderCostInput): WorkOrderCost {
  // Se suma en "centavos × minutos" y se redondea UNA vez: redondear cada
  // entrada por separado acumula hasta medio centavo de error por línea.
  const laborCentMinutes = input.timeEntries.reduce((sum, entry) => sum + entry.minutes * entry.rate, 0);
  const labor = Math.round(laborCentMinutes / 60);
  const parts = input.partsUsed.reduce((sum, part) => sum + part.qty * part.unitCost, 0);
  const external = input.externalCosts.reduce((sum, cost) => sum + cost.amount, 0);
  return { labor, parts, external, total: labor + parts + external };
}

/**
 * Costo unitario promedio tras una entrada de stock (promedio ponderado). Las
 * salidas no lo cambian: sacar piezas no encarece ni abarata las que quedan.
 */
export function weightedAverageCost(
  stock: number,
  avgUnitCost: number,
  qtyIn: number,
  unitCostIn: number,
): number {
  const total = stock + qtyIn;
  if (stock <= 0 || total <= 0) return unitCostIn;
  return Math.round((stock * avgUnitCost + qtyIn * unitCostIn) / total);
}
