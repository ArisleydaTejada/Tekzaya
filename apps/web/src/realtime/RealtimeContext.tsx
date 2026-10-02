import {
  formatTicketNumber,
  REALTIME_COMMANDS,
  REALTIME_EVENTS,
  notificationEvent,
  ticketMessageEvent,
  ticketUpdatedEvent,
  type NotificationListResponse,
} from "@tekzaya/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { notificationKeys } from "../api/notifications";
import { statsKeys } from "../api/stats";
import { ticketKeys } from "../api/tickets";
import { useAuth } from "../auth/AuthContext";

interface RealtimeValue {
  connected: boolean;
  /** Entra en la sala de un ticket mientras su detalle está abierto. */
  watchTicket: (ticketId: string) => void;
  unwatchTicket: (ticketId: string) => void;
}

const RealtimeContext = createContext<RealtimeValue | null>(null);

/**
 * El socket se abre una vez por sesión y vive en la raíz de la aplicación. Lo que
 * llega por él **no se pinta**: se usa para invalidar la caché de TanStack Query y
 * que la pantalla vuelva a pedir los datos por la API, que es la que filtra por
 * permisos. Así un evento mal dirigido no puede mostrar nada que la API no daría.
 *
 * La única excepción son las notificaciones: el evento ya trae la notificación
 * entera, dirigida a la sala privada de esa persona, y añadirla a la caché evita un
 * viaje de ida y vuelta justo cuando lo que importa es que la campana reaccione ya.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  /** Salas pedidas antes de que el socket estuviera listo, o perdidas al reconectar. */
  const watched = useRef(new Set<string>());

  useEffect(() => {
    if (!me) return;

    // Mismo origen: la cookie httpOnly de la sesión viaja en el handshake y no hay
    // un segundo token que mantener (ver `realtime.ts` en la API).
    const socket = io({ path: "/socket.io", withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      for (const ticketId of watched.current) {
        socket.emit(REALTIME_COMMANDS.watchTicket, ticketId);
      }
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on(REALTIME_EVENTS.notification, (payload: unknown) => {
      const parsed = notificationEvent.safeParse(payload);
      if (!parsed.success) return;

      queryClient.setQueriesData<NotificationListResponse>(
        { queryKey: notificationKeys.all },
        (current) =>
          current
            ? {
                ...current,
                items: [parsed.data, ...current.items].slice(0, current.limit),
                total: current.total + 1,
                unread: current.unread + 1,
              }
            : current,
      );
      // Un aviso casi siempre significa que algo cambió en una lista; refrescarla
      // es más barato que adivinar qué fila tocar.
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
    });

    socket.on(REALTIME_EVENTS.ticketUpdated, (payload: unknown) => {
      const parsed = ticketUpdatedEvent.safeParse(payload);
      if (!parsed.success) return;
      void queryClient.invalidateQueries({ queryKey: ticketKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: ticketKeys.detail(formatTicketNumber(parsed.data.number)),
      });
      void queryClient.invalidateQueries({ queryKey: statsKeys.all });
    });

    socket.on(REALTIME_EVENTS.ticketMessage, (payload: unknown) => {
      const parsed = ticketMessageEvent.safeParse(payload);
      if (!parsed.success) return;
      void queryClient.invalidateQueries({ queryKey: ticketKeys.messages(parsed.data.ticketId) });
    });

    return () => {
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [me, queryClient]);

  const value = useMemo<RealtimeValue>(
    () => ({
      connected,
      watchTicket: (ticketId) => {
        watched.current.add(ticketId);
        socketRef.current?.emit(REALTIME_COMMANDS.watchTicket, ticketId);
      },
      unwatchTicket: (ticketId) => {
        watched.current.delete(ticketId);
        socketRef.current?.emit(REALTIME_COMMANDS.unwatchTicket, ticketId);
      },
    }),
    [connected],
  );

  return <RealtimeContext value={value}>{children}</RealtimeContext>;
}

/** Fuera del proveedor devuelve un objeto inerte: ninguna pantalla depende del socket. */
export function useRealtime(): RealtimeValue {
  return use(RealtimeContext) ?? OFFLINE;
}

const OFFLINE: RealtimeValue = {
  connected: false,
  watchTicket: () => undefined,
  unwatchTicket: () => undefined,
};

/** Suscribe el detalle abierto a la actividad de su ticket y se da de baja al salir. */
export function useWatchTicket(ticketId: string | undefined): void {
  const { watchTicket, unwatchTicket, connected } = useRealtime();
  useEffect(() => {
    if (!ticketId) return;
    watchTicket(ticketId);
    return () => unwatchTicket(ticketId);
  }, [ticketId, watchTicket, unwatchTicket, connected]);
}
