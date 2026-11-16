import {
  formatAssetNumber,
  formatSparePartNumber,
  formatTicketNumber,
  formatWorkOrderNumber,
  type NotificationView,
} from "@tekzaya/shared";

/** La ruta a la que lleva un aviso, o `null` si no apunta a nada (alguien se marcó ausente, por ejemplo). */
export function notificationLink(item: NotificationView): string | null {
  if (item.ticketNumber) return `/tickets/${formatTicketNumber(item.ticketNumber)}`;

  if (item.workOrderNumber) return `/ordenes/${formatWorkOrderNumber(item.workOrderNumber)}`;

  if (item.sparePartNumber) return `/repuestos/${formatSparePartNumber(item.sparePartNumber)}`;

  if (item.assetNumber) return `/activos/${formatAssetNumber(item.assetNumber)}`;

  return null;
}
