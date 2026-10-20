/**
 * Costo de una orden de trabajo = repuestos + servicios externos. El trabajo de
 * los técnicos de la empresa no se cobra: su sueldo no es un costo de la
 * reparación. Lo que sí cuesta es el proveedor de fuera, que cobra un precio
 * total o por hora. Todo en centavos enteros; es una función pura para
 * poder cuadrarla a mano en las pruebas, igual que el motor de SLA del módulo 1.
 */
export interface WorkOrderCostInput {
  /** `unitCost` es el costo promedio de la pieza en el momento de consumirla. */
  partsUsed: readonly { qty: number; unitCost: number }[];
  /** `amount` ya es el total del servicio, aunque se haya cobrado por hora. */
  externalCosts: readonly { amount: number }[];
}

export interface WorkOrderCost {
  parts: number;
  external: number;
  total: number;
}

export function workOrderCost(input: WorkOrderCostInput): WorkOrderCost {
  const parts = input.partsUsed.reduce((sum, part) => sum + part.qty * part.unitCost, 0);
  const external = input.externalCosts.reduce((sum, cost) => sum + cost.amount, 0);
  return { parts, external, total: parts + external };
}

/**
 * Lo que cobra un proveedor por hora: tarifa × horas, redondeado una sola vez
 * ("centavos × minutos" ÷ 60). 1 h 20 min a 30,00/h son 40,00.
 */
export function hourlyServiceAmount(hourlyRate: number, minutes: number): number {
  return Math.round((hourlyRate * minutes) / 60);
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
