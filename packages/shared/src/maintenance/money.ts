import { z } from "zod";

/**
 * Un monto en **centavos enteros**. Nunca decimales: `0.1 + 0.2` no da `0.3` en
 * JavaScript, y un costo acumulado que se desvía un centavo es la clase de error
 * que nadie ve hasta que alguien cuadra una factura (plan §2.3).
 */
export const money = z.number().int().min(0);
export type Money = z.infer<typeof money>;

/** Código ISO 4217 de tres letras: "USD", "DOP", "BOB". */
export const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/, "Usa el código de tres letras de la moneda (USD, DOP…)")
  .refine((code) => {
    try {
      new Intl.NumberFormat("es", { style: "currency", currency: code });
      return true;
    } catch {
      return false;
    }
  }, "Moneda desconocida");

/** Convierte lo que escribe una persona ("12.50") a centavos, sin pasar por coma flotante. */
export function toCents(amount: string | number): number {
  const text = typeof amount === "number" ? amount.toFixed(2) : amount.trim().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new Error(`Monto inválido: ${String(amount)}`);
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

/** Cifras enteras como máximo: diez dan para mil millones, de sobra para un equipo. */
const MAX_INTEGER_DIGITS = 10;

/**
 * Normaliza lo que se teclea en un campo de monto: solo cifras y un punto
 * decimal con dos decimales como mucho, agrupando los miles con comas
 * ("1129.5" → "1,129.5"). Las letras, los símbolos y un segundo punto se
 * descartan, así que pegar "$1,200.50" también funciona.
 */
export function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  let integer = (dot === -1 ? cleaned : cleaned.slice(0, dot)).slice(0, MAX_INTEGER_DIGITS);
  const decimals = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  integer = integer.replace(/^0+(?=\d)/, "");
  if (integer === "" && decimals !== null) integer = "0";
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decimals === null ? grouped : `${grouped}.${decimals}`;
}

/** Centavos guardados → texto del campo de monto ("112900" → "1,129.00"). */
export function amountInputFromCents(cents: number): string {
  return formatAmountInput((cents / 100).toFixed(2));
}

/** Texto del campo de monto → centavos. Las comas de los miles se ignoran. */
export function centsFromAmountInput(text: string): number {
  return toCents(text.replace(/,/g, ""));
}

/**
 * Muestra centavos en la moneda configurada. Cambiar la moneda no convierte
 * nada: los montos guardados solo cambian de etiqueta (plan §2.3).
 */
export function formatMoney(cents: number, currency: string, locale = "es-MX"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}
