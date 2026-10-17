/**
 * Números legibles del módulo 2. Comparten el contador atómico de los tickets
 * (`counters`), cada uno con su propia secuencia; el formato de los tickets
 * (`TK-000123`) no cambia.
 */
const pad = (n: number) => String(n).padStart(4, "0");

export const formatAssetNumber = (n: number): string => `ACT-${pad(n)}`;
export const formatWorkOrderNumber = (n: number): string => `OT-${pad(n)}`;
export const formatSparePartNumber = (n: number): string => `REP-${pad(n)}`;

/** Secuencias del contador; el `_id` de cada documento de `counters`. */
export const COUNTER_KINDS = ["ticket", "asset", "work_order", "spare_part"] as const;
export type CounterKind = (typeof COUNTER_KINDS)[number];
