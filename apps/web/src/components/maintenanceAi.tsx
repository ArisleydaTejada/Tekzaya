import {
  formatMoney,
  formatWorkOrderNumber,
  REPLACEMENT_REASON_LABEL,
  type RepairEstimateMiss,
  type WorkOrderDetail,
} from "@tekzaya/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { aiKeys, estimateRepair, getAiStatus, getReplacementAdvice } from "../api/ai";
import { formatWhen } from "../lib/format";
import { SparkleIcon } from "./icons";
import { Plate } from "./Plate";

/**
 * Las dos tarjetas de IA del módulo 2 (plan A7). Comparten la regla del plan: **la
 * IA no inventa cifras**. Los números salen del historial y se pueden rastrear
 * hasta órdenes reales; la IA solo redacta o elige casos parecidos. Sin clave o
 * con la función apagada, ninguna de las dos se monta.
 */

function useAi() {
  return useQuery({ queryKey: aiKeys.status, queryFn: getAiStatus, staleTime: 60_000 }).data;
}

function AiLabel({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wide text-accent-ink">
      <SparkleIcon aria-hidden="true" /> {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-xs text-[var(--content-ink-dim)]">{label}</dt>
      <dd className="text-right font-display text-sm font-semibold tabular text-[var(--content-ink)]">{children}</dd>
    </div>
  );
}

function formatAge(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [
    years ? `${years} ${years === 1 ? "año" : "años"}` : "",
    rest || !years ? `${rest} ${rest === 1 ? "mes" : "meses"}` : "",
  ].filter(Boolean);
  return parts.join(" y ");
}

// ── ¿Reparar o reemplazar? ────────────────────────────────────

/**
 * En la ficha del equipo, solo si la regla lo marca como candidato. Se pide al
 * abrir la ficha; el servidor no llama a la IA si el equipo no es candidato.
 */
export function ReplacementAdviceCard({ assetId }: { assetId: string }) {
  const ai = useAi();
  const enabled = Boolean(ai?.configured && ai.enabled.replacementAdvice);
  const { data: advice } = useQuery({
    queryKey: aiKeys.replacement(assetId),
    queryFn: () => getReplacementAdvice(assetId),
    enabled,
    staleTime: 5 * 60_000,
  });
  if (!enabled || !advice) return null;

  const money = (cents: number) => formatMoney(cents, advice.currency);
  return (
    <Plate className="p-4 text-sm">
      <AiLabel>Sugerencia de IA</AiLabel>
      <h2 className="mt-1 font-display text-sm font-semibold text-[var(--content-ink)]">
        ¿Reparar o reemplazar?
      </h2>
      <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Por qué es candidato">
        {advice.reasons.map((reason) => (
          <li key={reason} className="rounded-full border border-amber/50 bg-amber/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--content-ink)]">
            {REPLACEMENT_REASON_LABEL[reason]}
          </li>
        ))}
      </ul>

      <dl className="mt-3 divide-y divide-[var(--content-border)] border-y border-[var(--content-border)]">
        <Row label={`Fallas en ${advice.windowDays} días`}>
          {advice.failuresInWindow}
          <span className="ml-1 text-xs font-normal text-[var(--content-ink-dim)]">(aviso desde {advice.failureThreshold})</span>
        </Row>
        <Row label="Fallas en total">{advice.failuresTotal}</Row>
        <Row label="Gastado en reparaciones">
          {money(advice.repairCost)}
          {advice.repairShare !== null && (
            <span className="ml-1 text-xs font-normal text-[var(--content-ink-dim)]">
              ({Math.round(advice.repairShare * 100)} % de la compra)
            </span>
          )}
        </Row>
        <Row label="Precio de compra">{advice.purchaseCost !== null ? money(advice.purchaseCost) : "—"}</Row>
        {advice.ageMonths !== null && <Row label="Antigüedad">{formatAge(advice.ageMonths)}</Row>}
      </dl>

      <p className="mt-3 leading-relaxed text-[var(--content-ink)]">
        {advice.explanation ?? (
          <span className="text-[var(--content-ink-dim)]">La IA no devolvió una explicación; los números de arriba son del historial del equipo.</span>
        )}
      </p>
      <p className="mt-2 text-xs text-[var(--content-ink-dim)]">
        Las cifras salen del historial del equipo; la IA solo redacta la explicación.
      </p>
    </Plate>
  );
}

// ── Estimación del costo ──────────────────────────────────────

const MISS_TEXT: Record<RepairEstimateMiss, string> = {
  not_enough_history: "Todavía no hay suficientes reparaciones de este tipo de equipo para estimar.",
  not_enough_similar: "Hay menos de tres reparaciones parecidas a esta falla: no se estima con tan pocos casos.",
  no_answer: "La IA no contestó. Inténtalo de nuevo en un momento.",
};

/**
 * En una correctiva abierta: el rango sale de las reparaciones pasadas que la IA
 * juzga parecidas, y cada una enlaza a su orden. Se pide con un botón, no al
 * abrir la orden: gasta cuota y no siempre hace falta.
 */
export function RepairEstimateCard({ order }: { order: WorkOrderDetail }) {
  const ai = useAi();
  const estimate = useMutation({ mutationFn: () => estimateRepair(order.id) });
  const open = order.status !== "completed" && order.status !== "cancelled";
  if (!ai?.configured || !ai.enabled.repairEstimate || order.type !== "corrective" || !open) return null;

  const result = estimate.data;
  const money = (cents: number) => formatMoney(cents, result?.estimate?.currency ?? order.currency);

  return (
    <Plate className="p-4 text-sm">
      <AiLabel>Estimación con IA</AiLabel>
      <h2 className="mt-1 font-display text-sm font-semibold text-[var(--content-ink)]">
        ¿Cuánto suele costar?
      </h2>

      {!result ? (
        <>
          <p className="mt-1 text-xs text-[var(--content-ink-dim)]">
            Busca reparaciones parecidas ya terminadas y calcula el rango de lo que costaron.
          </p>
          <button
            onClick={() => estimate.mutate()}
            disabled={estimate.isPending}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-3 py-2 text-xs font-medium text-accent-ink hover:bg-[var(--content-bg)] disabled:opacity-60"
          >
            <SparkleIcon className={estimate.isPending ? "animate-pulse" : ""} aria-hidden="true" />
            {estimate.isPending ? "Buscando casos parecidos…" : "Estimar costo"}
          </button>
          {estimate.isError && (
            <p role="alert" className="mt-2 text-xs text-red">
              {estimate.error instanceof Error ? estimate.error.message : "No se pudo estimar."}
            </p>
          )}
        </>
      ) : result.estimate ? (
        <>
          <p className="mt-2 font-display text-xl font-semibold tabular text-[var(--content-ink)]">
            {money(result.estimate.low)} – {money(result.estimate.high)}
          </p>
          <p className="text-xs text-[var(--content-ink-dim)]">
            Mediana <span className="font-semibold tabular text-[var(--content-ink)]">{money(result.estimate.median)}</span>
            {" · "}la mitad central de {result.estimate.cases.length} reparaciones parecidas, de {result.estimate.poolSize} revisadas.
          </p>
          <ul className="mt-3 divide-y divide-[var(--content-border)] border-t border-[var(--content-border)]" aria-label="Reparaciones parecidas">
            {result.estimate.cases.map((item) => (
              <li key={item.id} className="flex items-baseline justify-between gap-2 py-1.5">
                <span className="min-w-0">
                  <Link to={`/ordenes/${formatWorkOrderNumber(item.number)}`} className="block truncate text-accent-ink hover:underline">
                    <span className="font-display tabular">{formatWorkOrderNumber(item.number)}</span> · {item.title}
                  </Link>
                  <span className="block truncate text-[11px] text-[var(--content-ink-dim)]">
                    {item.assetName} · {formatWhen(item.completedAt)}
                  </span>
                </span>
                <span className="shrink-0 tabular text-[var(--content-ink)]">{money(item.cost)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--content-ink-dim)]">
            La IA solo eligió qué reparaciones se parecen; el rango es lo que costaron de verdad.
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs text-[var(--content-ink-dim)]">{MISS_TEXT[result.reason ?? "no_answer"]}</p>
          {result.reason === "no_answer" && (
            <button onClick={() => estimate.mutate()} disabled={estimate.isPending} className="mt-2 text-xs font-medium text-accent-ink hover:underline">
              Reintentar
            </button>
          )}
        </>
      )}
    </Plate>
  );
}
