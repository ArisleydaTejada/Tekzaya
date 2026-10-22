import {
  citesOnlyKnownNumbers,
  costRange,
  formatMoney,
  MIN_ESTIMATE_CASES,
  replacementReasons,
  type RepairEstimateResponse,
  type ReplacementAdvice,
} from "@tekzaya/shared";
import { z } from "zod";
import { Asset, WorkOrder } from "../../models/maintenance.models";
import type { LeanAsset } from "../assets/asset.access";
import { todayKey } from "../assets/asset.view";
import { failureWindowStart } from "../maintenance/alerts";
import { getSettings } from "../settings/settings.service";
import type { LeanWorkOrder } from "../workOrders/workOrder.access";
import { cacheKey, remember } from "./ai.cache";
import { aiProvider } from "./ai.provider";

/**
 * Las dos funciones de IA del módulo 2 (plan A7). Las dos siguen la misma regla:
 * **la IA no inventa cifras**. El código decide quién es candidato a reemplazo y
 * calcula el rango de costo; Gemini solo redacta una explicación o elige qué
 * órdenes pasadas se parecen, por número de lista, como en el módulo 1.
 *
 * Se piden al abrir la ficha o al pulsar un botón, nunca en un trabajo
 * programado, y se guardan en caché: la cuota gratuita son 5 peticiones/min.
 */

const DAY_MS = 86_400_000;
/** La explicación solo cambia si cambia el historial, que entra en la clave. */
const ADVICE_TTL_MS = 6 * 3_600_000;
const ESTIMATE_TTL_MS = 3_600_000;
/** Reparaciones que se le muestran a la IA para elegir; las más recientes. */
const ESTIMATE_POOL = 40;
/** Las reparaciones de hace más de dos años ya no dicen cuánto cuesta hoy. */
const ESTIMATE_HISTORY_DAYS = 730;

async function usable(feature: "replacementAdvice" | "repairEstimate"): Promise<boolean> {
  if (!aiProvider().configured) return false;
  return (await getSettings()).aiEnabled[feature];
}

const clip = (text: string | null | undefined, max: number) =>
  (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Meses enteros entre dos fechas de calendario "YYYY-MM-DD". */
function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.max(0, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0));
}

// ── ¿Reparar o reemplazar? ────────────────────────────────────

/**
 * La regla está en código (`replacementReasons`): fallas repetidas, o
 * reparaciones que ya suman la mitad del precio de compra. Si el equipo no es
 * candidato, no se llama a Gemini. Si lo es, Gemini redacta la explicación a
 * partir del historial; las cifras de la tarjeta salen de aquí.
 *
 * `null` sin IA: la tarjeta es de IA y sin ella no se monta (DoD de A7). La
 * alerta de fallas repetidas del panel no depende de esto.
 */
export async function replacementAdvice(asset: LeanAsset, now = new Date()): Promise<ReplacementAdvice | null> {
  if (asset.status === "retired") return null;
  if (!(await usable("replacementAdvice"))) return null;

  const settings = await getSettings();
  const { maintenance } = settings;
  const orders = (await WorkOrder.find({ assetId: asset._id, type: "corrective", status: { $ne: "cancelled" } })
    .select("number title description completionNotes status costTotal createdAt completedAt")
    .sort({ createdAt: 1 })
    .lean()) as LeanWorkOrder[];

  const windowStart = failureWindowStart(maintenance, now);
  const failuresInWindow = orders.filter((order) => order.createdAt >= windowStart).length;
  const repaired = orders.filter((order) => order.status === "completed");
  const repairCost = repaired.reduce((sum, order) => sum + order.costTotal, 0);
  const purchaseCost = asset.purchaseCost ?? null;

  const reasons = replacementReasons({
    failuresInWindow,
    failureThreshold: maintenance.repeatedFailure.count,
    repairCost,
    purchaseCost,
  });
  if (reasons.length === 0) return null;

  const today = todayKey(settings.businessHours.timezone, now);
  const ageMonths = asset.purchaseDate ? monthsBetween(asset.purchaseDate, today) : null;
  const repairShare = purchaseCost ? repairCost / purchaseCost : null;
  const money = (cents: number) => formatMoney(cents, maintenance.currency);

  // Lo que se le da a la IA es lo mismo que muestra la tarjeta, más el historial
  // en palabras. Cualquier cifra de la explicación tiene que estar aquí.
  const data = [
    `Equipo: ${asset.name}${asset.brand ? ` · ${asset.brand}` : ""}${asset.model ? ` ${asset.model}` : ""}`,
    ageMonths !== null ? `Antigüedad: ${ageMonths} meses` : "Antigüedad: desconocida",
    `Precio de compra: ${purchaseCost !== null ? money(purchaseCost) : "desconocido"}`,
    `Costo acumulado de reparaciones: ${money(repairCost)}` +
      (repairShare !== null ? ` (${Math.round(repairShare * 100)} % del precio de compra)` : ""),
    `Fallas en los últimos ${maintenance.repeatedFailure.windowDays} días: ${failuresInWindow}`,
    `Fallas en total: ${orders.length}`,
    "",
    "Historial de fallas, de la más antigua a la más reciente:",
    ...orders.map(
      (order) =>
        `- ${order.title}: ${clip(order.description, 160) || "sin descripción"}` +
        (order.completionNotes ? ` Trabajo realizado: ${clip(order.completionNotes, 160)}` : " (sin terminar)"),
    ),
  ].join("\n");

  // La clave cambia con cada falla nueva o cada costo cargado: así la explicación
  // se renueva cuando hay algo nuevo que explicar, y no antes.
  const fingerprint = `${orders.length}|${repairCost}|${failuresInWindow}|${purchaseCost ?? ""}`;
  const explanation = await remember(cacheKey("asset-replacement", String(asset._id), fingerprint), ADVICE_TTL_MS, async () => {
    const text = await aiProvider().text({
      instruction:
        "Eres un asesor de mantenimiento de equipos de una empresa. Te doy el historial de un " +
        "equipo que, según las reglas de la empresa, es candidato a reemplazo. Explica en 2 a 4 " +
        "frases, en español, si conviene seguir reparándolo o reemplazarlo y por qué, fijándote en " +
        "los patrones del historial: qué falla, si las reparaciones se repiten, si el problema " +
        "vuelve después de arreglarlo. NO escribas cifras, montos, porcentajes ni fechas: la " +
        "pantalla ya muestra los números junto a tu explicación. No inventes datos que no aparezcan. " +
        "Texto plano, sin viñetas ni encabezados.",
      data,
      maxOutputTokens: 300,
    });
    // Si cita una cifra que no le dimos, se descarta entera: una explicación con
    // un número inventado es peor que ninguna.
    return text && citesOnlyKnownNumbers(text, data) ? text : null;
  });

  return {
    reasons,
    failuresInWindow,
    windowDays: maintenance.repeatedFailure.windowDays,
    failureThreshold: maintenance.repeatedFailure.count,
    failuresTotal: orders.length,
    repairCost,
    purchaseCost,
    repairShare,
    ageMonths,
    explanation,
    currency: maintenance.currency,
  };
}

// ── Estimación del costo de una reparación ────────────────────

/**
 * El rango sale del historial: mediana y percentiles 25–75 del costo de las
 * correctivas completadas que la IA juzga parecidas a la falla descrita. La IA
 * solo responde con números de la lista, así que no puede inventar órdenes, y
 * con menos de tres casos no hay estimación.
 *
 * Los candidatos son reparaciones del mismo tipo de equipo en el área de la
 * orden: quien la mira puede abrir cada caso, y el costo de reparar una impresora
 * no dice nada del de un aire acondicionado.
 */
export async function repairEstimate(order: LeanWorkOrder, now = new Date()): Promise<RepairEstimateResponse> {
  if (!(await usable("repairEstimate"))) return { estimate: null, reason: null };
  const settings = await getSettings();

  const asset = await Asset.findById(order.assetId).select("type").lean();
  if (!asset) return { estimate: null, reason: "not_enough_history" };
  const sameType = await Asset.find({ type: asset.type }).select("_id name").lean();
  const assetName = new Map(sameType.map((item) => [String(item._id), item.name]));

  const pool = (await WorkOrder.find({
    _id: { $ne: order._id },
    areaId: order.areaId,
    assetId: { $in: sameType.map((item) => item._id) },
    type: "corrective",
    status: "completed",
    completedAt: { $gte: new Date(now.getTime() - ESTIMATE_HISTORY_DAYS * DAY_MS) },
  })
    .select("number title description completionNotes assetId costTotal completedAt")
    .sort({ completedAt: -1 })
    .limit(ESTIMATE_POOL)
    .lean()) as LeanWorkOrder[];

  // Sin historial suficiente no hay nada que elegir: no se gasta cuota.
  if (pool.length < MIN_ESTIMATE_CASES) return { estimate: null, reason: "not_enough_history" };

  const list = pool
    .map(
      (item, index) =>
        `${index + 1}. ${item.title} — ${clip(item.description, 160) || "sin descripción"}` +
        (item.completionNotes ? ` — Se hizo: ${clip(item.completionNotes, 160)}` : ""),
    )
    .join("\n");

  const key = cacheKey(
    "repair-estimate",
    String(order._id),
    order.title,
    order.description ?? "",
    pool.map((item) => String(item._id)).join(","),
  );
  const chosen = await remember(key, ESTIMATE_TTL_MS, async () => {
    const result = await aiProvider().json({
      instruction:
        "Ayudas a estimar el costo de reparar un equipo. Te doy una falla nueva y una lista " +
        "numerada de reparaciones ya terminadas de equipos del mismo tipo:\n" +
        `${list}\n\n` +
        "Devuelve JSON con {similar}: la lista de números de las reparaciones que tratan el MISMO " +
        "problema que la falla nueva (misma pieza o mismo síntoma), de la más parecida a la menos. " +
        "No incluyas las que solo comparten el tipo de equipo. Si ninguna se parece, devuelve una lista vacía.",
      data: `Falla nueva: ${order.title}\n${clip(order.description, 1000)}`,
      schema: z.object({ similar: z.array(z.number().int().min(1).max(pool.length)).max(pool.length) }),
      maxOutputTokens: 200,
    });
    return result ? [...new Set(result.similar)] : null;
  });

  if (!chosen) return { estimate: null, reason: "no_answer" };
  const cases = chosen.map((number) => pool[number - 1]!);
  const range = costRange(cases.map((item) => item.costTotal));
  if (!range) return { estimate: null, reason: "not_enough_similar" };

  return {
    estimate: {
      ...range,
      cases: cases.map((item) => ({
        id: String(item._id),
        number: item.number,
        title: item.title,
        assetName: assetName.get(String(item.assetId)) ?? "",
        cost: item.costTotal,
        completedAt: item.completedAt!.toISOString(),
      })),
      poolSize: pool.length,
      currency: settings.maintenance.currency,
    },
    reason: null,
  };
}
