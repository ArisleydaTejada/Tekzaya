import {
  ASSET_TYPE_LABEL,
  describeEvery,
  formatAssetNumber,
  PLAN_MODE_LABEL,
  type PlanState,
  type PlanView,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listPlans, planKeys, setPlanActive } from "../api/plans";
import { AreaTag } from "../components/badges";
import { PencilIcon, PlusIcon, PowerIcon } from "../components/icons";
import { PageHeader } from "../components/PageHeader";
import { Plate } from "../components/Plate";
import { PlanCalendar } from "../components/PlanCalendar";
import { PlanFormModal } from "../components/plans";
import { formatDay } from "../lib/format";

const coverageOf = (plan: PlanView) =>
  plan.asset
    ? `${formatAssetNumber(plan.asset.number)} · ${plan.asset.name}`
    : `Todos los «${ASSET_TYPE_LABEL[plan.assetType!]}» (${plan.coverage})`;

/**
 * Mantenimiento preventivo (plan A5): el calendario del mes con las órdenes
 * generadas y las rondas que vienen, y la lista de planes. Lo ve el área que
 * mantiene los equipos; los planes los gestiona su supervisor.
 */
export default function PreventivosPage() {
  const [view, setView] = useState<"calendar" | "plans">("calendar");
  const [state, setState] = useState<PlanState>("active");
  const [editing, setEditing] = useState<PlanView | null | undefined>(undefined);
  const queryClient = useQueryClient();

  const plans = useQuery({
    queryKey: planKeys.list({ state }),
    queryFn: () => listPlans({ state }),
  });
  // El menú de las tarjetas del calendario ofrece editar el plan, esté o no en pausa.
  const allPlans = useQuery({
    queryKey: planKeys.list({ state: "all" }),
    queryFn: () => listPlans({ state: "all" }),
    enabled: view === "calendar",
  });
  const toggle = useMutation({
    mutationFn: (plan: PlanView) => setPlanActive(plan.id, !plan.isActive),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });

  const manageable = plans.data?.manageableAreas ?? [];

  return (
    <div>
      <PageHeader
        title="Preventivos"
        subtitle="Mantener antes de que falle: los planes y lo que toca cada mes."
        actions={
          manageable.length > 0 && (
            <button
              onClick={() => setEditing(null)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dim"
            >
              <PlusIcon className="h-3.5 w-3.5" /> Nuevo plan
            </button>
          )
        }
      />

      <div role="tablist" aria-label="Vista" className="mb-4 inline-flex rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] p-0.5">
        {[
          { value: "calendar" as const, label: "Calendario" },
          { value: "plans" as const, label: "Planes" },
        ].map((option) => (
          <button
            key={option.value}
            role="tab"
            aria-selected={view === option.value}
            onClick={() => setView(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              view === option.value ? "bg-accent text-white" : "text-[var(--content-ink-dim)] hover:text-[var(--content-ink)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <PlanCalendar plans={allPlans.data?.items ?? []} onEditPlan={setEditing} />
      ) : (
        <PlanList
          plans={plans.data?.items ?? []}
          loading={plans.isLoading}
          error={plans.error}
          state={state}
          onState={setState}
          onEdit={setEditing}
          onToggle={(plan) => toggle.mutate(plan)}
          toggling={toggle.isPending}
        />
      )}
      {toggle.error && (
        <p role="alert" className="mt-3 text-sm text-red">
          {toggle.error.message}
        </p>
      )}

      <PlanFormModal
        open={editing !== undefined}
        plan={editing ?? null}
        areas={manageable}
        defaultLeadDays={plans.data?.defaultLeadDays ?? 7}
        onClose={() => setEditing(undefined)}
        onSaved={async () => {
          setEditing(undefined);
          await queryClient.invalidateQueries({ queryKey: planKeys.all });
        }}
      />
    </div>
  );
}

// ── Planes ────────────────────────────────────────────────────

function PlanList({
  plans,
  loading,
  error,
  state,
  onState,
  onEdit,
  onToggle,
  toggling,
}: {
  plans: PlanView[];
  loading: boolean;
  error: Error | null;
  state: PlanState;
  onState: (state: PlanState) => void;
  onEdit: (plan: PlanView) => void;
  onToggle: (plan: PlanView) => void;
  toggling: boolean;
}) {
  return (
    <div>
      <div className="mb-3">
        <select
          aria-label="Filtrar por estado"
          value={state}
          onChange={(event) => onState(event.target.value as PlanState)}
          className="rounded-lg border border-[var(--content-border)] bg-[var(--content-surface)] px-2.5 py-2 text-sm text-[var(--content-ink)]"
        >
          <option value="active">Activos</option>
          <option value="paused">En pausa</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {error ? (
        <Plate className="py-16 text-center text-sm text-red">{error.message}</Plate>
      ) : loading ? (
        <Plate className="flex items-center justify-center py-16">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--content-border)] border-t-accent" aria-label="Cargando planes" />
        </Plate>
      ) : plans.length === 0 ? (
        <Plate className="py-16 text-center text-sm text-[var(--content-ink-dim)]">
          {state === "paused" ? "No hay planes en pausa." : "No hay planes que puedas ver. Los planes son del área que mantiene los equipos."}
        </Plate>
      ) : (
        <ul className="space-y-2">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Plate className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-[var(--content-ink)]">{plan.title}</span>
                    {!plan.isActive && (
                      <span className="rounded-md border border-[var(--content-border)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--content-ink-dim)]">
                        En pausa
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-[var(--content-ink-dim)]">
                    {plan.asset ? (
                      <Link to={`/activos/${formatAssetNumber(plan.asset.number)}`} className="hover:text-accent-ink hover:underline">
                        {coverageOf(plan)}
                      </Link>
                    ) : (
                      coverageOf(plan)
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--content-ink-dim)]">
                    <span>
                      {describeEvery(plan.every, plan.unit)} · {PLAN_MODE_LABEL[plan.mode]}
                    </span>
                    <AreaTag area={plan.area} />
                    {plan.openOrders > 0 && (
                      <span>
                        {plan.openOrders} {plan.openOrders === 1 ? "orden abierta" : "órdenes abiertas"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="text-[var(--content-ink)]">
                    Próxima: <span className="font-medium tabular">{formatDay(plan.nextDueAt)}</span>
                  </p>
                  {plan.isActive && (
                    <p className="text-xs text-[var(--content-ink-dim)]">La orden se genera el {formatDay(plan.generatesOn)}</p>
                  )}
                  {plan.permissions.manage && (
                    <div className="mt-2 flex justify-end gap-1.5">
                      <button
                        onClick={() => onEdit(plan)}
                        className="flex items-center gap-1 rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)]"
                      >
                        <PencilIcon className="h-3.5 w-3.5" aria-hidden="true" /> Editar
                      </button>
                      <button
                        onClick={() => onToggle(plan)}
                        disabled={toggling}
                        className="flex items-center gap-1 rounded-lg border border-[var(--content-border)] px-2.5 py-1.5 text-xs font-medium text-[var(--content-ink)] hover:bg-[var(--content-bg)] disabled:opacity-50"
                      >
                        <PowerIcon className="h-3.5 w-3.5" aria-hidden="true" /> {plan.isActive ? "Pausar" : "Reanudar"}
                      </button>
                    </div>
                  )}
                </div>
              </Plate>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
