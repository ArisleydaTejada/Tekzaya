import { NOTIFICATION_TONE, type NotificationType, type NotificationView } from "@tekzaya/shared";
import type { ComponentType, SVGProps } from "react";
import { toast, type ExternalToast } from "sonner";
import {
  ActivityIcon,
  AlertIcon,
  ArrowRightIcon,
  BoxIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  MergeIcon,
  MessageIcon,
  PencilIcon,
  ShieldIcon,
  SlaNeedleIcon,
  TicketIcon,
  UserIcon,
  UserPlusIcon,
  WrenchIcon,
} from "../components/icons";
import { notificationLink } from "./notificationLink";

type Tone = "green" | "accent" | "amber" | "red";

const TONE_CLASS: Record<Tone, string> = {
  green: "text-green",
  accent: "text-accent-ink",
  amber: "text-amber",
  red: "text-red",
};

/**
 * Un aviso con el icono de lo que pasó (una cámara para la foto, una llave para la contraseña) en
 * vez del tic genérico: se entiende de un vistazo qué cambió, sin leer.
 */
export function notify(
  message: string,
  Icon: ComponentType<SVGProps<SVGSVGElement>>,
  tone: Tone = "green",
) {
  toast(message, {
    icon: <Icon className={`h-[18px] w-[18px] ${TONE_CLASS[tone]}`} aria-hidden="true" />,
  });
}

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/** Qué dibujo lleva cada aviso. Es exhaustivo: un tipo nuevo sin icono deja de compilar. */
const TYPE_ICON: Record<NotificationType, IconType> = {
  ticket_created_in_area: TicketIcon,
  ticket_created_for_you: TicketIcon,
  ticket_assigned: UserPlusIcon,
  ticket_unassigned: UserIcon,
  ticket_reply: MessageIcon,
  ticket_assignee_reply: MessageIcon,
  ticket_internal_note: PencilIcon,
  ticket_status_changed: ActivityIcon,
  ticket_on_hold: ClockIcon,
  ticket_resolved: CheckIcon,
  ticket_auto_closed: CheckIcon,
  on_hold_reminder: ClockIcon,
  ticket_transferred: ArrowRightIcon,
  ticket_merged: MergeIcon,
  ticket_unmerged: MergeIcon,
  sla_at_risk: SlaNeedleIcon,
  sla_breached: AlertIcon,
  incident_detected: AlertIcon,
  join_request: UserPlusIcon,
  assignee_away: ClockIcon,
  work_order_assigned: WrenchIcon,
  preventive_due: CalendarIcon,
  preventive_overdue: CalendarIcon,
  low_stock: BoxIcon,
  warranty_expiring: ShieldIcon,
  repeated_failures: WrenchIcon,
};

/**
 * El toast de un aviso que llega en vivo: el icono de lo ocurrido, el título, el ticket debajo y un
 * "Ver" que lo abre. Si ya estás en esa pantalla no sale: la conversación se actualiza sola y el
 * aviso sería ruido.
 */
export function notifyEvent(event: NotificationView, open: (path: string) => void) {
  const to = notificationLink(event);

  if (to && window.location.pathname === to) return;

  const Icon = TYPE_ICON[event.type];

  const options: ExternalToast = {
    icon: <Icon className={`h-[18px] w-[18px] ${TONE_CLASS[NOTIFICATION_TONE[event.type]]}`} aria-hidden="true" />,
  };

  if (event.body) options.description = event.body;

  if (to) options.action = { label: "Ver", onClick: () => open(to) };

  toast(event.title, options);
}
