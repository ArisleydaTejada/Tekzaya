import activoDark from "../../assets/landing/activo-dark.jpg";
import activoLight from "../../assets/landing/activo-light.jpg";
import cropCostoDark from "../../assets/landing/crop-costo-dark.png";
import cropCostoLight from "../../assets/landing/crop-costo-light.png";
import cropTicketDark from "../../assets/landing/crop-ticket-dark.png";
import cropTicketLight from "../../assets/landing/crop-ticket-light.png";
import detailDisponibilidadDark from "../../assets/landing/detail-disponibilidad-dark.webp";
import detailDisponibilidadLight from "../../assets/landing/detail-disponibilidad-light.webp";
import detailDuplicadosDark from "../../assets/landing/detail-duplicados-dark.webp";
import detailDuplicadosLight from "../../assets/landing/detail-duplicados-light.webp";
import detailLlegadaDark from "../../assets/landing/detail-llegada-dark.webp";
import detailLlegadaLight from "../../assets/landing/detail-llegada-light.webp";
import detailPreventivosDark from "../../assets/landing/detail-preventivos-dark.webp";
import detailPreventivosLight from "../../assets/landing/detail-preventivos-light.webp";
import detailRepuestosDark from "../../assets/landing/detail-repuestos-dark.webp";
import detailRepuestosLight from "../../assets/landing/detail-repuestos-light.webp";
import detailSlaDark from "../../assets/landing/detail-sla-dark.webp";
import detailSlaLight from "../../assets/landing/detail-sla-light.webp";
import kanbanDark from "../../assets/landing/kanban-dark.jpg";
import kanbanLight from "../../assets/landing/kanban-light.jpg";
import ordenDark from "../../assets/landing/orden-dark.jpg";
import ordenLight from "../../assets/landing/orden-light.jpg";
import preventivosDark from "../../assets/landing/preventivos-dark.jpg";
import preventivosLight from "../../assets/landing/preventivos-light.jpg";
import reportesDark from "../../assets/landing/reportes-dark.jpg";
import reportesLight from "../../assets/landing/reportes-light.jpg";
import repuestosDark from "../../assets/landing/repuestos-dark.jpg";
import repuestosLight from "../../assets/landing/repuestos-light.jpg";
import tableroDark from "../../assets/landing/tablero-dark.jpg";
import tableroLight from "../../assets/landing/tablero-light.jpg";
import ticketFusionDark from "../../assets/landing/ticket-fusion-dark.jpg";
import ticketFusionLight from "../../assets/landing/ticket-fusion-light.jpg";
import ticketOtDark from "../../assets/landing/ticket-ot-dark.jpg";
import ticketOtLight from "../../assets/landing/ticket-ot-light.jpg";
import ticketsDark from "../../assets/landing/tickets-dark.jpg";
import ticketsLight from "../../assets/landing/tickets-light.jpg";

/**
 * Capturas reales de la aplicación con los datos de demostración, sacadas a
 * 1440 × 900 con densidad 1,5. Cada una existe en los dos temas: la página
 * enseña la del tema que se está viendo.
 */
export const SHOTS = {
  tickets: { light: ticketsLight, dark: ticketsDark },
  tablero: { light: tableroLight, dark: tableroDark },
  kanban: { light: kanbanLight, dark: kanbanDark },
  ticketFusion: { light: ticketFusionLight, dark: ticketFusionDark },
  reportes: { light: reportesLight, dark: reportesDark },
  activo: { light: activoLight, dark: activoDark },
  orden: { light: ordenLight, dark: ordenDark },
  preventivos: { light: preventivosLight, dark: preventivosDark },
  repuestos: { light: repuestosLight, dark: repuestosDark },
  ticketOt: { light: ticketOtLight, dark: ticketOtDark },
};

export type ShotKey = keyof typeof SHOTS;

/**
 * Piezas sueltas de la interfaz, recortadas del elemento real a densidad 2: la
 * tarjeta de TK-000096 en el tablero por columnas y el costo de la OT-0146.
 */
export const CROPS = {
  ticket: { light: cropTicketLight, dark: cropTicketDark, width: 532, height: 312 },
  costo: { light: cropCostoLight, dark: cropCostoDark, width: 640, height: 370 },
};

export const SHOT_WIDTH = 2160;

export const SHOT_HEIGHT = 1350;

/**
 * Detalles de la sección de cada módulo, capturados a densidad 4 de la zona
 * exacta de la pantalla: se ven de cerca, así que no salen de las capturas
 * completas (a 1,5 se veían borrosos al ampliarlos).
 */
export const DETAILS = {
  sla: { light: detailSlaLight, dark: detailSlaDark, width: 908, height: 1100 },
  llegada: { light: detailLlegadaLight, dark: detailLlegadaDark, width: 1400, height: 465 },
  duplicados: { light: detailDuplicadosLight, dark: detailDuplicadosDark, width: 1400, height: 546 },
  repuestos: { light: detailRepuestosLight, dark: detailRepuestosDark, width: 1400, height: 1092 },
  preventivos: { light: detailPreventivosLight, dark: detailPreventivosDark, width: 644, height: 1352 },
  disponibilidad: { light: detailDisponibilidadLight, dark: detailDisponibilidadDark, width: 1400, height: 1408 },
};

export type DetailKey = keyof typeof DETAILS;
