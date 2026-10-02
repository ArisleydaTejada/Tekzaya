import {
  canViewTicket,
  REALTIME_COMMANDS,
  REALTIME_EVENTS,
  type NotificationEvent,
  type TicketMessageEvent,
  type TicketUpdatedEvent,
} from "@tekzaya/shared";
import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { env } from "../config/env";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { ACCESS_COOKIE, verifyAccessToken } from "../modules/auth/tokens";
import { refOf, type LeanTicket } from "../modules/tickets/ticket.access";

/**
 * Las salas son las tres del spec §12. Con nombres construidos por estas funciones
 * y nunca a mano: una sala mal escrita no falla, simplemente no entrega nada, y eso
 * es lo más difícil de notar en un sistema de avisos.
 */
const room = {
  user: (userId: string) => `user:${userId}`,
  area: (areaId: string) => `area:${areaId}`,
  ticket: (ticketId: string) => `ticket:${ticketId}`,
};

/**
 * Nulo hasta que el proceso llama a `attachRealtime`. En las pruebas nunca se
 * llama, así que emitir es una operación vacía y los endpoints se prueban sin
 * levantar un servidor de websockets.
 */
let io: Server | null = null;

interface SocketIdentity {
  userId: string;
  areaId: string;
}

/**
 * La sesión del socket es la misma cookie `httpOnly` del navegador: no hay un
 * segundo mecanismo que mantener ni un token que el JavaScript de la página
 * pudiera leer. Se parsea a mano para no arrastrar otra dependencia por una línea.
 */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

function identify(socket: Socket): string | null {
  const token = readCookie(socket.handshake.headers.cookie, ACCESS_COOKIE);
  if (!token) return null;
  try {
    return verifyAccessToken(token).sub;
  } catch {
    return null;
  }
}

export function attachRealtime(server: HttpServer): Server {
  io = new Server(server, {
    path: "/socket.io",
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });

  // El actor se vuelve a leer de la base, igual que en `requireAuth`: una cuenta
  // desactivada no mantiene abierto un canal de avisos por tener la cookie viva.
  io.use((socket, next) => {
    const userId = identify(socket);
    if (!userId) {
      next(new Error("unauthenticated"));
      return;
    }
    void User.findById(userId)
      .select("areaId status")
      .lean()
      .then((user) => {
        if (!user || user.status !== "active") {
          next(new Error("unauthenticated"));
          return;
        }
        socket.data = { userId, areaId: String(user.areaId) } satisfies SocketIdentity;
        next();
      })
      .catch(() => next(new Error("unauthenticated")));
  });

  io.on("connection", (socket) => {
    const identity = socket.data as SocketIdentity;
    void socket.join(room.user(identity.userId));
    void socket.join(room.area(identity.areaId));

    // Entrar en la sala de un ticket se comprueba contra el motor de permisos: si
    // no, cualquiera escucharía la actividad de un ticket ajeno pidiendo su id.
    socket.on(REALTIME_COMMANDS.watchTicket, (ticketId: unknown) => {
      if (typeof ticketId !== "string") return;
      void Ticket.findById(ticketId)
        .select("areaId requesterId createdById assigneeIds status additionalRequesterIds")
        .lean()
        .then(async (ticket) => {
          if (!ticket) return;
          const actor = await User.findById(identity.userId)
            .select("areaId role isAreaSupervisor hasGlobalReadAccess")
            .lean();
          if (!actor) return;
          const allowed = canViewTicket(
            {
              id: identity.userId,
              areaId: String(actor.areaId),
              role: actor.role ?? "employee",
              isAreaSupervisor: actor.isAreaSupervisor ?? false,
              hasGlobalReadAccess: actor.hasGlobalReadAccess ?? false,
            },
            refOf(ticket as LeanTicket),
          );
          if (allowed) await socket.join(room.ticket(ticketId));
        })
        .catch(() => undefined);
    });

    socket.on(REALTIME_COMMANDS.unwatchTicket, (ticketId: unknown) => {
      if (typeof ticketId === "string") void socket.leave(room.ticket(ticketId));
    });
  });

  return io;
}

// ── Emisión ───────────────────────────────────────────────────

export function emitNotification(userId: string, payload: NotificationEvent): void {
  io?.to(room.user(userId)).emit(REALTIME_EVENTS.notification, payload);
}

/**
 * Un cambio en el ticket interesa a quien lo tiene abierto y al área que lo
 * atiende, para que su listado se refresque sin recargar.
 */
export function emitTicketUpdated(payload: TicketUpdatedEvent): void {
  io?.to([room.ticket(payload.ticketId), room.area(payload.areaId)]).emit(
    REALTIME_EVENTS.ticketUpdated,
    payload,
  );
}

/**
 * Una nota interna **no** se anuncia en la sala del ticket, porque ahí está el
 * solicitante: va solo al área. El evento no lleva texto, pero saber que existe
 * una nota ya es más de lo que el solicitante debe ver (spec §10.4).
 */
export function emitTicketMessage(payload: TicketMessageEvent, areaId: string): void {
  const rooms =
    payload.type === "internal"
      ? [room.area(areaId)]
      : [room.ticket(payload.ticketId), room.area(areaId)];
  io?.to(rooms).emit(REALTIME_EVENTS.ticketMessage, payload);
}

/** Para las pruebas y para el cierre ordenado del proceso. */
export function closeRealtime(): void {
  io?.close();
  io = null;
}
