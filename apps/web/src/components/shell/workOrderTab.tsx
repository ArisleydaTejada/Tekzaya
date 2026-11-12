import {
  FINAL_WORK_ORDER_STATUSES,
  WORK_ORDER_STATUSES,
  type WorkOrderListItem,
  type WorkOrderListQuery,
  type WorkOrderListResponse,
} from "@tekzaya/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getWorkOrder, listWorkOrders, workOrderKeys } from "../../api/workOrders";
import { ClipboardIcon } from "../icons";
import { OverdueTag, WorkOrderStatusBadge } from "../workOrders";
import type { PickerSection } from "./PickerModal";
import type { TabKind } from "./RecordTabs";
import { oneOf } from "../../lib/oneOf";

const OPEN_WORK_ORDER_STATUSES = WORK_ORDER_STATUSES.filter(
  (status) => !oneOf(FINAL_WORK_ORDER_STATUSES, status),
);

/** Las órdenes de trabajo como pestaña del menú superior. */
export const workOrderTabKind: TabKind = {
  basePath: "/ordenes",
  prefix: "OT-",
  useTitle: useWorkOrderTitle,
  icon: ClipboardIcon,
};

function useWorkOrderTitle(number: string): string | undefined {
  const { data } = useQuery({
    queryKey: workOrderKeys.detail(number),
    queryFn: () => getWorkOrder(number),
    retry: false,
    staleTime: 5 * 60_000,
  });

  return data?.title;
}

/** Fila del buscador de pestañas: lo que va tras el número. */
export function WorkOrderPickerRow({ item }: { item: WorkOrderListItem }) {
  return (
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
  );
}

/** Las OT no tienen SLA (plan A3): primero vencidas, luego equipos fuera de servicio y el resto por fecha. */
function byUrgency(items: readonly WorkOrderListItem[]): WorkOrderListItem[] {
  const weight = (item: WorkOrderListItem) => (item.overdue ? 0 : item.outOfService ? 1 : 2);

  return [...items].sort((a, b) => weight(a) - weight(b));
}

/**
 * Primero las que tienen de responsable a quien busca, luego las demás abiertas,
 * cada grupo por urgencia; al buscar suma al final las ya terminadas.
 * `enabled` en falso no pide nada: quien no ve órdenes recibiría un 404.
 */
export function useWorkOrderSections(search: string, enabled: boolean) {
  const base: Partial<WorkOrderListQuery> = {
    limit: 30,
    sort: "updatedAt",
    dir: "desc",
    q: search || undefined,
  };

  const mineQuery: Partial<WorkOrderListQuery> = { ...base, scope: "mine" };
  const openQuery: Partial<WorkOrderListQuery> = { ...base, scope: "all", status: OPEN_WORK_ORDER_STATUSES };
  const restQuery: Partial<WorkOrderListQuery> = { ...base, scope: "all", status: [...FINAL_WORK_ORDER_STATUSES] };

  const [mine, others, rest] = useQueries({
    queries: [
      { queryKey: workOrderKeys.list(mineQuery), queryFn: () => listWorkOrders(mineQuery), enabled },
      { queryKey: workOrderKeys.list(openQuery), queryFn: () => listWorkOrders(openQuery), enabled },
      { queryKey: workOrderKeys.list(restQuery), queryFn: () => listWorkOrders(restQuery), enabled: enabled && !!search },
    ].map((q) => ({ ...q, placeholderData: (previous: WorkOrderListResponse | undefined) => previous })),
  });

  const sections: PickerSection<WorkOrderListItem>[] = [
    { title: "Órdenes asignadas a ti", items: byUrgency(mine.data?.items ?? []) },
    { title: "Órdenes abiertas", items: byUrgency(others.data?.items ?? []) },
    { title: "Órdenes ya terminadas", items: search ? (rest.data?.items ?? []) : [] },
  ];

  return {
    sections,
    isLoading: mine.isLoading || others.isLoading,
    isError: mine.isError && others.isError,
  };
}
