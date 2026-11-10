import {
  FINAL_WORK_ORDER_STATUSES,
  formatWorkOrderNumber,
  WORK_ORDER_STATUSES,
  type WorkOrderListItem,
  type WorkOrderListQuery,
  type WorkOrderListResponse,
} from "@tekzaya/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getWorkOrder, listWorkOrders, workOrderKeys } from "../../api/workOrders";
import { OverdueTag, WorkOrderStatusBadge } from "../workOrders";
import { dedupeSections, PickerModal, type PickerResult } from "./PickerModal";
import { RecordTabs } from "./RecordTabs";

const OPEN_WORK_ORDER_STATUSES = WORK_ORDER_STATUSES.filter(
  (status) => !(FINAL_WORK_ORDER_STATUSES as readonly string[]).includes(status),
);

/** Pestañas de órdenes de trabajo, en la sección de órdenes. */
export function WorkOrderTabs() {
  return (
    <RecordTabs
      basePath="/ordenes"
      storageName="workOrderTabs"
      navLabel="Órdenes abiertas"
      addLabel="Abrir otra orden"
      useTitle={useWorkOrderTitle}
      renderPicker={(props) => (
        <PickerModal
          {...props}
          title="Abrir orden en una pestaña"
          placeholder="Buscar por número, título o equipo…"
          searchLabel="Buscar orden para abrir"
          useSections={useWorkOrderSections}
          keyOf={(item) => item.id}
          numberOf={(item) => formatWorkOrderNumber(item.number)}
          renderRow={(item) => (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[var(--content-ink)]">{item.title}</span>
                <span className="block truncate text-xs text-[var(--content-ink-dim)]">
                  {item.asset.name} · {item.area.name}
                </span>
              </span>
              {item.overdue && (
                <span className="hidden shrink-0 sm:inline-flex">
                  <OverdueTag />
                </span>
              )}
              <WorkOrderStatusBadge status={item.status} holdReason={item.holdReason} />
            </>
          )}
        />
      )}
    />
  );
}

function useWorkOrderTitle(number: string): string | undefined {
  const { data } = useQuery({
    queryKey: workOrderKeys.detail(number),
    queryFn: () => getWorkOrder(number),
    retry: false,
    staleTime: 5 * 60_000,
  });

  return data?.title;
}

/**
 * Las OT no tienen SLA (plan A3), así que la urgencia sale de lo que sí dicen:
 * primero las vencidas, luego las de equipos fuera de servicio y después las
 * demás, de la más reciente a la más antigua.
 */
function byUrgency(items: readonly WorkOrderListItem[]): WorkOrderListItem[] {
  const weight = (item: WorkOrderListItem) => (item.overdue ? 0 : item.outOfService ? 1 : 2);

  return [...items].sort((a, b) => weight(a) - weight(b));
}

/**
 * Primero las que tienen de responsable a quien busca, luego las demás abiertas,
 * cada grupo por urgencia; al buscar suma al final las ya terminadas.
 */
function useWorkOrderSections(search: string, open: boolean): PickerResult<WorkOrderListItem> {
  const base: Partial<WorkOrderListQuery> = {
    limit: 30,
    sort: "updatedAt",
    dir: "desc",
    ...(search ? { q: search } : {}),
  };

  const mineQuery: Partial<WorkOrderListQuery> = { ...base, scope: "mine" };
  const openQuery: Partial<WorkOrderListQuery> = { ...base, scope: "all", status: OPEN_WORK_ORDER_STATUSES };
  const restQuery: Partial<WorkOrderListQuery> = { ...base, scope: "all", status: [...FINAL_WORK_ORDER_STATUSES] };

  const [mine, others, rest] = useQueries({
    queries: [
      { queryKey: workOrderKeys.list(mineQuery), queryFn: () => listWorkOrders(mineQuery), enabled: open },
      { queryKey: workOrderKeys.list(openQuery), queryFn: () => listWorkOrders(openQuery), enabled: open },
      { queryKey: workOrderKeys.list(restQuery), queryFn: () => listWorkOrders(restQuery), enabled: open && !!search },
    ].map((q) => ({ ...q, placeholderData: (previous: WorkOrderListResponse | undefined) => previous })),
  });

  return {
    sections: dedupeSections((item) => item.id, [
      { title: "Asignadas a ti", items: byUrgency(mine.data?.items ?? []) },
      { title: "Abiertas", items: byUrgency(others.data?.items ?? []) },
      { title: "Ya terminadas", items: search ? (rest.data?.items ?? []) : [] },
    ]),
    isLoading: mine.isLoading || others.isLoading,
    isError: mine.isError && others.isError,
  };
}
