import { createHash } from "node:crypto";

/**
 * Caché en memoria y límite por persona. Los dos existen por la misma razón: la
 * cuota gratuita de Gemini es pequeña y se agota antes de lo que parece (spec
 * §6.3). En memoria basta —si la API se reinicia, lo peor que pasa es que la
 * primera petición vuelva a pagar el viaje.
 */

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;

export function cacheKey(...parts: (string | number)[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex");
}

/**
 * Devuelve lo guardado o ejecuta la función. Un `null` **también se guarda**,
 * pero muy poco tiempo: si Gemini no supo contestar hace un segundo, repetir la
 * llamada con el mismo texto gasta cuota para nada.
 */
export async function remember<T>(
  key: string,
  ttlMs: number,
  produce: () => Promise<T>,
  nullTtlMs = 10_000,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await produce();

  if (store.size >= MAX_ENTRIES) {
    // Sin librería de LRU: se tira lo más viejo, que para este volumen sobra.
    const oldest = [...store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
    if (oldest) store.delete(oldest[0]);
  }
  store.set(key, { value, expiresAt: now + (value === null ? nullTtlMs : ttlMs) });
  return value;
}

export function forget(key: string): void {
  store.delete(key);
}

export function clearCache(): void {
  store.clear();
}

// ── Límite por persona ────────────────────────────────────────

const lastCall = new Map<string, number>();

/**
 * ¿Puede esta persona gastar otra llamada ya? El autocompletado se dispara con
 * cada pausa al teclear, así que sin esto una sola persona escribiendo agotaría
 * la cuota del día.
 */
export function allowCall(userId: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const previous = lastCall.get(userId) ?? 0;
  if (now - previous < minIntervalMs) return false;
  lastCall.set(userId, now);
  return true;
}

export function resetRateLimits(): void {
  lastCall.clear();
}
