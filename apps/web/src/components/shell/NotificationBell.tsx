import {
  formatTicketNumber,
  formatAssetNumber,
  formatSparePartNumber,
  formatWorkOrderNumber,
  NOTIFICATION_TONE,
  type NotificationView,
} from "@tekzaya/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { listNotifications, markNotifications, notificationKeys } from "../../api/notifications";
import { formatWhen } from "../../lib/format";
import { BellIcon } from "../icons";

const PANEL_SIZE = 20;

const TONE_CLASS = {
  red: "bg-red",
  amber: "bg-amber",
  accent: "bg-accent",
} as const;

/**
 * La campana no sondea al servidor: el socket empuja cada aviso nuevo a la caché y
 * el contador reacciona solo (ver `RealtimeContext`). La consulta existe para la
 * carga inicial y para recuperar el historial si la conexión se cayó.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: notificationKeys.list(PANEL_SIZE),
    queryFn: () => listNotifications(PANEL_SIZE),
    staleTime: 60_000,
  });

  const mark = useMutation({
    mutationFn: markNotifications,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="relative">
      {/* La campana se apoya en la barra superior, así que toma sus colores; el
          panel que abre es una superficie elevada y conserva los suyos. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--rail-ink-dim)] hover:bg-[var(--rail-surface-2)]"
        aria-label={unread > 0 ? `Notificaciones: ${unread} sin leer` : "Notificaciones"}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red px-1 font-display text-[10px] font-semibold tabular text-white"
            aria-hidden="true"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
              aria-label="Cerrar notificaciones"
            />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 z-50 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-[var(--content-border)] bg-[var(--content-surface)] p-2 shadow-[var(--content-shadow)]"
            >
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <p className="font-display text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--content-ink-dim)]">
                  Notificaciones
                </p>
                {unread > 0 && (
                  <button
                    onClick={() => mark.mutate({ all: true })}
                    disabled={mark.isPending}
                    className="text-xs font-medium text-accent-ink hover:underline disabled:opacity-60"
                  >
                    Marcar todas como leídas
                  </button>
                )}
              </div>

              {items.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-[var(--content-ink-dim)]">
                  No tienes notificaciones
                </p>
              ) : (
                <ul>
                  {items.map((item) => (
                    <NotificationRow
                      key={item.id}
                      item={item}
                      onNavigate={() => {
                        // Abrirlo es haberlo leído: dejarlo en negrita después de
                        // entrar al ticket solo entrena a ignorar el contador.
                        if (!item.readAt) mark.mutate({ ids: [item.id], all: false });
                        setOpen(false);
                      }}
                    />
                  ))}
                </ul>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationRow({
  item,
  onNavigate,
}: {
  item: NotificationView;
  onNavigate: () => void;
}) {
  const tone = TONE_CLASS[NOTIFICATION_TONE[item.type]];
  const unread = !item.readAt;

  const content = (
    <div
      className={`flex items-start gap-2 rounded-lg px-2 py-2 text-sm ${unread ? "bg-[var(--content-bg)]/60" : ""}`}
    >
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${unread ? tone : "bg-transparent border border-[var(--content-border)]"}`} />
      <div className="min-w-0">
        <p className={`text-[var(--content-ink)] ${unread ? "font-medium" : ""}`}>{item.title}</p>
        {item.body && (
          <p className="truncate text-xs text-[var(--content-ink-dim)]">{item.body}</p>
        )}
        <p className="text-xs text-[var(--content-ink-dim)]">
          {item.ticketNumber ? `${formatTicketNumber(item.ticketNumber)} · ` : ""}
          {item.workOrderNumber ? `${formatWorkOrderNumber(item.workOrderNumber)} · ` : ""}
          {item.sparePartNumber ? `${formatSparePartNumber(item.sparePartNumber)} · ` : ""}
          {item.assetNumber ? `${formatAssetNumber(item.assetNumber)} · ` : ""}
          {formatWhen(item.createdAt)}
        </p>
      </div>
    </div>
  );

  // Un aviso sin ticket (alguien se marcó ausente, por ejemplo) no lleva a ningún
  // sitio: se queda como texto en vez de fingir un enlace que no abre nada.
  const to = item.ticketNumber
    ? `/tickets/${formatTicketNumber(item.ticketNumber)}`
    : item.workOrderNumber
      ? `/ordenes/${formatWorkOrderNumber(item.workOrderNumber)}`
      : item.sparePartNumber
        ? `/repuestos/${formatSparePartNumber(item.sparePartNumber)}`
        : item.assetNumber
          ? `/activos/${formatAssetNumber(item.assetNumber)}`
          : null;
  if (!to) return <li>{content}</li>;

  return (
    <li>
      <Link
        to={to}
        onClick={onNavigate}
        className="block hover:opacity-80"
      >
        {content}
      </Link>
    </li>
  );
}
