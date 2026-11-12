import {
  ACTIVE_TICKET_STATUSES,
  SETTLED_TICKET_STATUSES,
  type TicketListItem,
  type TicketListQuery,
  type TicketListResponse,
} from "@tekzaya/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getTicketByNumber, listTickets, ticketKeys } from "../../api/tickets";
import { PriorityBadge, StatusBadge } from "../badges";
import { TicketIcon } from "../icons";
import type { PickerSection } from "./PickerModal";
import type { TabKind } from "./RecordTabs";

/** Los tickets como pestaña del menú superior. */
export const ticketTabKind: TabKind = {
  basePath: "/tickets",
  prefix: "TK-",
  notRecords: ["nuevo"],
  useTitle: useTicketTitle,
  icon: TicketIcon,
};

function useTicketTitle(number: string): string | undefined {
  const { data } = useQuery({
    queryKey: ticketKeys.detail(number),
    queryFn: () => getTicketByNumber(number),
    retry: false,
    staleTime: 5 * 60_000,
  });

  return data?.title;
}

/** Fila del buscador de pestañas: lo que va tras el número. */
export function TicketPickerRow({ item }: { item: TicketListItem }) {
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[var(--content-ink)]">{item.title}</span>
        <span className="block truncate text-xs text-[var(--content-ink-dim)]">
          {item.requester.name} · {item.area.name}
        </span>
      </span>
      <span className="hidden shrink-0 sm:inline-flex">
        <PriorityBadge priority={item.priority} />
      </span>
      <StatusBadge status={item.status} />
    </>
  );
}

/**
 * Primero lo que tiene de responsable a quien busca, luego el resto abierto, por urgencia (orden `sla`).
 * Al buscar, suma al final lo ya terminado. Sin quitar repetidos: eso lo hace quien junta.
 */
export function useTicketSections(search: string, open: boolean) {
  const base: Partial<TicketListQuery> = { limit: 20, sort: "sla", q: search || undefined };
  const mineQuery: Partial<TicketListQuery> = { ...base, scope: "assigned" };
  const openQuery: Partial<TicketListQuery> = { ...base, scope: "all", status: [...ACTIVE_TICKET_STATUSES] };
  const restQuery: Partial<TicketListQuery> = { ...base, scope: "all", status: [...SETTLED_TICKET_STATUSES] };

  const [mine, others, rest] = useQueries({
    queries: [
      { queryKey: ticketKeys.list(mineQuery), queryFn: () => listTickets(mineQuery), enabled: open },
      { queryKey: ticketKeys.list(openQuery), queryFn: () => listTickets(openQuery), enabled: open },
      { queryKey: ticketKeys.list(restQuery), queryFn: () => listTickets(restQuery), enabled: open && !!search },
    ].map((q) => ({ ...q, placeholderData: (previous: TicketListResponse | undefined) => previous })),
  });

  const sections: PickerSection<TicketListItem>[] = [
    { title: "Tickets asignados a ti", items: mine.data?.items ?? [] },
    { title: "Tickets abiertos", items: others.data?.items ?? [] },
    { title: "Tickets ya terminados", items: search ? (rest.data?.items ?? []) : [] },
  ];

  return {
    sections,
    isLoading: mine.isLoading || others.isLoading,
    isError: mine.isError && others.isError,
  };
}
