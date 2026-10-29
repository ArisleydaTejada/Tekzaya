import type { AssetType } from "./enums";

// Al escribir un ticket: ¿de qué equipo habla? Se decide por coincidencia de
// palabras, sin IA, para que sea instantáneo y no gaste cuota del modelo.

/**
 * Palabras que nombran el equipo (pesan 2) y pistas que lo sugieren (pesan 1).
 * Van sin tildes y en minúsculas, como queda el texto al normalizarlo. Una
 * entrada con espacios casa con la frase entera.
 */
const MENTIONS: Partial<Record<AssetType, { names: readonly string[]; hints?: readonly string[] }>> = {
  laptop: { names: ["laptop", "laptops", "portatil", "portatiles", "notebook", "lap"] },
  desktop: {
    names: ["computadora", "computadoras", "pc", "cpu", "ordenador", "computador"],
    hints: ["equipo de escritorio"],
  },
  monitor: { names: ["monitor", "monitores"], hints: ["pantalla", "pantallas"] },
  printer: {
    names: ["impresora", "impresoras", "multifuncional", "fotocopiadora", "copiadora", "plotter"],
    hints: ["imprime", "imprimir", "impresion", "toner", "cartucho", "escaner", "escanear", "atasco"],
  },
  network: {
    names: ["router", "switch", "modem", "access point", "repetidor"],
    hints: ["internet", "wifi", "wi-fi", "red", "conexion"],
  },
  server: { names: ["servidor", "servidores", "server"] },
  phone: {
    names: ["telefono", "telefonos", "celular", "celulares", "movil"],
    hints: ["extension", "llamadas", "tono"],
  },
  ups: { names: ["ups", "no break", "nobreak", "regulador"] },
  air_conditioner: {
    names: ["aire acondicionado", "aires acondicionados", "minisplit", "mini split", "a/c"],
    hints: ["clima", "aire", "calor"],
  },
  generator: { names: ["planta electrica", "generador"] },
  electrical: {
    names: ["tomacorriente", "enchufe", "breaker", "tablero electrico"],
    hints: ["luz", "corriente", "electricidad", "apagon", "lampara"],
  },
  plumbing: {
    names: ["inodoro", "lavamanos", "grifo", "tuberia", "lavaplatos", "fregadero"],
    hints: ["fuga", "agua", "bano", "goteo"],
  },
  appliance: { names: ["microondas", "nevera", "refrigerador", "cafetera", "dispensador", "horno"] },
  furniture: { names: ["silla", "sillas", "escritorio", "mesa", "archivero", "gaveta"] },
  vehicle: { names: ["vehiculo", "carro", "camioneta", "auto", "moto", "camion"] },
};

/** Minúsculas y sin tildes: "Impresión" y "impresion" son la misma palabra. */
export function normalizeMention(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** Cada palabra casa entera: "red" no salta con "redactar" ni "lap" con "lapiz". */
const PATTERNS = Object.entries(MENTIONS).flatMap(([type, { names, hints = [] }]) =>
  [
    ...names.map((word) => ({ word, weight: 2 })),
    ...hints.map((word) => ({ word, weight: 1 })),
  ].map(({ word, weight }) => ({
    type: type as AssetType,
    weight,
    regex: new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, "u"),
  })),
);

/**
 * El tipo de equipo del que habla el ticket, o `null`. Gana la mención más
 * fuerte —"la pantalla de mi laptop" es de la laptop, no de un monitor— y, a
 * igual peso, la que aparece antes; el título va delante de la descripción.
 */
export function detectAssetType(title: string, description = ""): AssetType | null {
  const text = normalizeMention(`${title}\n${description}`);
  let best: { type: AssetType; weight: number; index: number } | null = null;
  for (const { type, weight, regex } of PATTERNS) {
    const index = text.search(regex);
    if (index < 0) continue;
    if (!best || weight > best.weight || (weight === best.weight && index < best.index)) {
      best = { type, weight, index };
    }
  }
  return best?.type ?? null;
}

/** "ACT-0012" escrito en el texto: entonces no hay que adivinar el equipo. */
export function mentionedAssetNumber(text: string): number | null {
  const match = /\bACT-?(\d{1,9})\b/i.exec(text);
  return match ? Number(match[1]) : null;
}
