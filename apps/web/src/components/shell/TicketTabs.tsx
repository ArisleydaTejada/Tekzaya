import {
  ACTIVE_TICKET_STATUSES,
  formatTicketNumber,
  SETTLED_TICKET_STATUSES,
  type TicketListItem,
  type TicketListQuery,
  type TicketListResponse,
} from "@tekzaya/shared";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getTicketByNumber, listTickets, ticketKeys } from "../../api/tickets";
import { PriorityBadge, StatusBadge } from "../badges";
import { dedupeSections, PickerModal, type PickerResult } from "./PickerModal";
import { RecordTabs } from "./RecordTabs";

/** Pestañas de tickets, en la sección de tickets. */
export function TicketTabs() {
  return (
    <RecordTabs
      basePath="/tickets"
      notRecords={["nuevo"]}
      storageName="ticketTabs"
      navLabel="Tickets abiertos"
      addLabel="Abrir otro ticket"
      useTitle={useTicketTitle}
      renderPicker={(props) => (
        <PickerModal
          {...props}
          title="Abrir ticket en una pestaña"
          placeholder="Buscar por número o título…"
          searchLabel="Buscar ticket para abrir"
          useSections={useTicketSections}
          keyOf={(item) => item.id}
          numberOf={(item) => formatTicketNumber(item.number)}
          renderRow={(item) => (
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
          )}
        />
      )}
    />
  );
}

function useTicketTitle(number: string): string | undefined {
  const { data } = useQuery({
    queryKey: ticketKeys.detail(number),
    queryFn: () => getTicketByNumber(number),
    retry: false,
    staleTime: 5 * 60_000,
  });
  return data?.title;
}

/**
 * Primero lo que tiene de responsable a quien busca, luego lo demás abierto,
 * cada grupo por urgencia (el orden `sla` del servidor); al buscar suma al final
 * lo ya terminado.
 */
function useTicketSections(search: string, open: boolean): PickerResult<TicketListItem> {
  const base: Partial<TicketListQuery> = { limit: 20, sort: "sla", ...(search ? { q: search } : {}) };
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

  return {
    sections: dedupeSections((item) => item.id, [
      { title: "Asignados a ti", items: mine.data?.items ?? [] },
      { title: "Abiertos", items: others.data?.items ?? [] },
      { title: "Ya terminados", items: search ? (rest.data?.items ?? []) : [] },
    ]),
    isLoading: mine.isLoading || others.isLoading,
    isError: mine.isError && others.isError,
  };
}
