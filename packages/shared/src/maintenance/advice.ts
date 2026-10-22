/**
 * Las dos funciones de IA del módulo 2 (plan A7) comparten una regla: **la IA no
 * inventa cifras**. Lo que aquí se calcula —si un equipo es candidato a
 * reemplazo y cuánto suele costar una reparación parecida— es código, y se puede
 * rastrear hasta órdenes reales. El modelo solo redacta la explicación o elige
 * qué órdenes pasadas se parecen; nunca pone un número.
 */

/** Costo acumulado de reparaciones a partir del cual conviene pensar en reemplazar. */
export const REPAIR_COST_SHARE_THRESHOLD = 0.5;

/** Con menos casos parecidos no hay estimación: un rango de dos órdenes no es un rango. */
export const MIN_ESTIMATE_CASES = 3;

export const REPLACEMENT_REASONS = ["repeated_failures", "repair_cost"] as const;
export type ReplacementReason = (typeof REPLACEMENT_REASONS)[number];

export interface ReplacementInput {
  /** Correctivas no canceladas dentro de la ventana de "fallas repetidas". */
  failuresInWindow: number;
  /** El `count` de `settings.maintenance.repeatedFailure`. */
  failureThreshold: number;
  /** Costo de las correctivas completadas de toda la vida del equipo, en centavos. */
  repairCost: number;
  /** Precio de compra en centavos; sin él no se puede comparar. */
  purchaseCost?: number | null;
}

/**
 * ¿Por qué este equipo es candidato a reemplazo? Vacío si no lo es. Las dos
 * razones del plan: fallas repetidas, o reparaciones que ya suman la mitad de lo
 * que costó (un equipo de 0 no se compara: no hay mitad de nada).
 */
export function replacementReasons(input: ReplacementInput): ReplacementReason[] {
  const reasons: ReplacementReason[] = [];
  if (input.failuresInWindow >= input.failureThreshold) reasons.push("repeated_failures");
  if (input.purchaseCost && input.repairCost >= input.purchaseCost * REPAIR_COST_SHARE_THRESHOLD) {
    reasons.push("repair_cost");
  }
  return reasons;
}

/**
 * Percentil `p` (0–1) de una lista **ordenada**, interpolando entre los dos
 * vecinos (el método de una hoja de cálculo). Sin redondear: quien lo usa
 * redondea una sola vez.
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) throw new Error("percentile de una lista vacía");
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const low = sorted[below]!;
  return low + (sorted[above]! - low) * (position - below);
}

export interface CostRange {
  /** Percentil 25. */
  low: number;
  median: number;
  /** Percentil 75. */
  high: number;
}

/**
 * Rango de costo de unas reparaciones parecidas: mediana y percentiles 25–75,
 * en centavos redondeados una vez. `null` con menos de `MIN_ESTIMATE_CASES`.
 */
export function costRange(costs: readonly number[]): CostRange | null {
  if (costs.length < MIN_ESTIMATE_CASES) return null;
  const sorted = [...costs].sort((a, b) => a - b);
  return {
    low: Math.round(percentile(sorted, 0.25)),
    median: Math.round(percentile(sorted, 0.5)),
    high: Math.round(percentile(sorted, 0.75)),
  };
}

/**
 * Las cifras de un texto, sin separadores ni ceros a la izquierda: "1.250,00",
 * "1,250.00" y "125000" dan lo mismo ("125000"), y "04" es "4". Así se comparan
 * cifras escritas de formas distintas.
 */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,\s]\d+)*/g) ?? []).map(
    (token) => token.replace(/[.,\s]/g, "").replace(/^0+(?=\d)/, ""),
  );
}

/**
 * ¿Cita el texto solo cifras que estaban en los datos? Es la segunda defensa de
 * "la IA no inventa cifras": la instrucción le pide no escribirlas, y si aun así
 * escribe una que no le dimos, la explicación se descarta entera.
 */
export function citesOnlyKnownNumbers(text: string, source: string): boolean {
  // "1.250,00 USD" en los datos también deja citar "1.250 USD": quitar los
  // centavos de un monto no es inventar una cifra.
  const withoutCents = source.replace(/[.,]\d{2}\b/g, "");
  const known = new Set([...numbersIn(source), ...numbersIn(withoutCents)]);
  return numbersIn(text).every((value) => known.has(value));
}
