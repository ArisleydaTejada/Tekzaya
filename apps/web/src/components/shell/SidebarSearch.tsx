import {
  TICKET_STATUS_LABEL,
  WORK_ORDER_STATUS_LABEL,
  formatAssetNumber,
  formatSparePartNumber,
  formatTicketNumber,
  formatWorkOrderNumber,
} from "@tekzaya/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listTickets, ticketKeys } from "../../api/tickets";
import { listWorkOrders, workOrderKeys } from "../../api/workOrders";
import { ClipboardIcon, SearchIcon, TicketIcon } from "../icons";

/** Un código completo (TK-12, act 3, OT-0005…) lleva directo a su ficha en vez de a una búsqueda. */
function recordRoute(term: string): string | null {
  const match = /^(tk|act|ot|rep)[-\s]?0*(\d+)$/i.exec(term.trim());

  if (!match) return null;
  const n = Number(match[2]);
  const prefix = match[1]!.toLowerCase();

  if (prefix === "tk") return `/tickets/${formatTicketNumber(n)}`;

  if (prefix === "act") return `/activos/${formatAssetNumber(n)}`;

  if (prefix === "ot") return `/ordenes/${formatWorkOrderNumber(n)}`;

  return `/repuestos/${formatSparePartNumber(n)}`;
}

const LIMIT = 5;

interface Match {
  key: string;
  kind: "ticket" | "workOrder";
  code: string;
  title: string;
  status: string;
  to: string;
}

/** Espera a que se deje de escribir antes de preguntar al servidor. */
function useDebounced(value: string, delay = 250): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);

    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Buscador del menú lateral: mientras se escribe abre un menú con los tickets y las
 * órdenes de trabajo que coinciden por número o título. ↑ ↓ para moverse, Enter para
 * abrir la marcada; sin marcar, Enter hace lo de siempre (ficha por código o lista).
 */
export function SidebarSearch({ seesWorkOrders }: { seesWorkOrders: boolean }) {
  const navigate = useNavigate();
  const listId = useId();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const search = useDebounced(term.trim());
  const enabled = open && search.length >= 2;

  const tickets = useQuery({
    queryKey: [...ticketKeys.list({ scope: "all", q: search, limit: LIMIT }), "sidebar"],
    queryFn: () => listTickets({ scope: "all", q: search, limit: LIMIT, sort: "created", dir: "desc" }),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const workOrders = useQuery({
    queryKey: [...workOrderKeys.list({ q: search, limit: LIMIT }), "sidebar"],
    queryFn: () => listWorkOrders({ q: search, limit: LIMIT }),
    enabled: enabled && seesWorkOrders,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const ticketMatches: Match[] = enabled
    ? (tickets.data?.items ?? []).map((ticket) => ({
        key: `tk-${ticket.id}`,
        kind: "ticket",
        code: formatTicketNumber(ticket.number),
        title: ticket.title,
        status: TICKET_STATUS_LABEL[ticket.status],
        to: `/tickets/${formatTicketNumber(ticket.number)}`,
      }))
    : [];

  const orderMatches: Match[] =
    enabled && seesWorkOrders
      ? (workOrders.data?.items ?? []).map((order) => ({
          key: `ot-${order.id}`,
          kind: "workOrder",
          code: formatWorkOrderNumber(order.number),
          title: order.title,
          status: WORK_ORDER_STATUS_LABEL[order.status],
          to: `/ordenes/${formatWorkOrderNumber(order.number)}`,
        }))
      : [];

  const matches = [...ticketMatches, ...orderMatches];
  const loading = enabled && (tickets.isFetching || (seesWorkOrders && workOrders.isFetching));
  const showMenu = enabled && (matches.length > 0 || !loading);

  // Cada búsqueda nueva empieza sin nada marcado.
  useEffect(() => setActive(-1), [search]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const go = (to: string) => {
    close();
    setTerm("");
    navigate(to);
  };

  const submit = () => {
    const picked = matches[active];

    if (picked) return go(picked.to);
    const value = term.trim();
    go(value ? (recordRoute(value) ?? `/tickets?scope=all&q=${encodeURIComponent(value)}`) : "/tickets");
  };

  const optionId = (index: number) => `${listId}-${index}`;

  const section = (title: string, items: Match[], offset: number) =>
    items.length > 0 && (
      <li role="presentation">
        <p className="px-2.5 pb-1 pt-2 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--rail-ink-dim)]">
          {title}
        </p>
        <ul role="group" aria-label={title}>
          {items.map((item, index) => {
            const position = offset + index;
            const Icon = item.kind === "ticket" ? TicketIcon : ClipboardIcon;

            return (
              <li
                key={item.key}
                id={optionId(position)}
                role="option"
                aria-selected={active === position}
                // El clic no debe quitar el foco al campo antes de navegar.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(item.to)}
                onMouseEnter={() => setActive(position)}
                className={`flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-1.5 ${
                  active === position ? "bg-[var(--rail-surface-2)]" : ""
                }`}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--rail-ink-dim)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-[var(--rail-ink)]">{item.title}</span>
                  <span className="block font-display text-[10px] tabular text-[var(--rail-ink-dim)]">
                    {item.code} · {item.status}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </li>
    );

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--rail-ink-dim)]" />
      <input
        type="search"
        name="q"
        id="buscar-global"
        role="combobox"
        aria-label={seesWorkOrders ? "Buscar tickets y órdenes de trabajo" : "Buscar tickets por número o título"}
        aria-autocomplete="list"
        aria-expanded={showMenu}
        aria-controls={listId}
        {...(active >= 0 && showMenu ? { "aria-activedescendant": optionId(active) } : {})}
        autoComplete="off"
        placeholder="Buscar…"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (showMenu) {
              event.preventDefault();
              close();
            }

            return;
          }

          if (!showMenu || matches.length === 0) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => (index + 1) % matches.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => (index <= 0 ? matches.length - 1 : index - 1));
          }
        }}
        className="w-full rounded-lg border border-[var(--rail-bezel)] bg-[var(--rail-surface-2)] py-2 pl-9 pr-8 text-sm text-[var(--rail-ink)] outline-none placeholder:text-[var(--rail-ink-dim)] focus:border-accent [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-[var(--rail-bezel)] px-1 font-display text-[10px] text-[var(--rail-ink-dim)]">
        /
      </kbd>

      {showMenu && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded-lg border border-[var(--rail-bezel)] bg-[var(--rail-bg)] p-1 shadow-[0_12px_24px_-12px_rgba(0,0,0,0.5)]">
          <ul id={listId} role="listbox" aria-label="Coincidencias" className="max-h-80 overflow-y-auto">
            {section("Tickets", ticketMatches, 0)}
            {section("Órdenes de trabajo", orderMatches, ticketMatches.length)}
          </ul>
          {matches.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-[var(--rail-ink-dim)]">Nada coincide con «{search}».</p>
          ) : (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => go(`/tickets?scope=all&q=${encodeURIComponent(search)}`)}
              className="mt-1 block w-full rounded-md border-t border-[var(--rail-bezel)] px-2.5 py-1.5 text-left text-xs font-medium text-[var(--accent-contrast)] hover:bg-[var(--rail-surface-2)]"
            >
              Ver todos los tickets con «{search}»
            </button>
          )}
        </div>
      )}
    </form>
  );
}
