import {
  formatTicketNumber,
  formatWorkOrderNumber,
  type TicketListItem,
  type WorkOrderListItem,
} from "@tekzaya/shared";
import { dedupeSections, PickerModal, type PickerResult, type PickerSection } from "./PickerModal";
import { RecordTabs } from "./RecordTabs";
import { TicketPickerRow, ticketTabKind, useTicketSections } from "./ticketTab";
import { useWorkOrderSections, WorkOrderPickerRow, workOrderTabKind } from "./workOrderTab";

type OpenItem = { kind: "ticket"; item: TicketListItem } | { kind: "order"; item: WorkOrderListItem };

const keyOf = (entry: OpenItem) => `${entry.kind}:${entry.item.id}`;

const numberOf = (entry: OpenItem) =>
  entry.kind === "ticket" ? formatTicketNumber(entry.item.number) : formatWorkOrderNumber(entry.item.number);

/**
 * Tickets y órdenes abiertos en una sola tira del menú superior, con un solo "+".
 * Las órdenes solo para quien las puede abrir (mismo criterio que la barra lateral).
 */
export function OpenTabs({ seesWorkOrders }: { seesWorkOrders: boolean }) {
  const kinds = seesWorkOrders ? [ticketTabKind, workOrderTabKind] : [ticketTabKind];

  /** Primero los grupos de tickets y luego los de órdenes, sin repetir ninguno. */
  function useSections(search: string, open: boolean): PickerResult<OpenItem> {
    const tickets = useTicketSections(search, open);
    const orders = useWorkOrderSections(search, open && seesWorkOrders);

    const sections: PickerSection<OpenItem>[] = [
      ...tickets.sections.map((section) => ({
        title: section.title,
        items: section.items.map((item): OpenItem => ({ kind: "ticket", item })),
      })),
      ...(seesWorkOrders ? orders.sections : []).map((section) => ({
        title: section.title,
        items: section.items.map((item): OpenItem => ({ kind: "order", item })),
      })),
    ];

    return {
      sections: dedupeSections(keyOf, sections),
      isLoading: tickets.isLoading || (seesWorkOrders && orders.isLoading),
      isError: tickets.isError && (!seesWorkOrders || orders.isError),
    };
  }

  return (
    <RecordTabs
      kinds={kinds}
      navLabel="Pestañas abiertas"
      addLabel="Abrir otra pestaña"
      renderPicker={(props) => (
        <PickerModal
          {...props}
          title="Abrir en una pestaña"
          placeholder={seesWorkOrders ? "Buscar ticket u orden por número o título…" : "Buscar ticket por número o título…"}
          searchLabel={seesWorkOrders ? "Buscar ticket u orden para abrir" : "Buscar ticket para abrir"}
          useSections={useSections}
          keyOf={keyOf}
          numberOf={numberOf}
          renderRow={(entry) =>
            entry.kind === "ticket" ? <TicketPickerRow item={entry.item} /> : <WorkOrderPickerRow item={entry.item} />
          }
        />
      )}
    />
  );
}
