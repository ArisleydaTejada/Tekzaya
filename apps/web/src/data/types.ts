export type AreaId = "it" | "mantenimiento" | "rrhh" | "ventas" | "marketing" | "finanzas";

export interface Area {
  id: AreaId;
  name: string;
  color: string; // hex, used only for small area tags — never overrides the semantic palette
  categories: string[];
}

export type Role = "employee" | "area_supervisor" | "hr_supervisor" | "admin";

export interface User {
  id: string;
  name: string;
  initials: string;
  areaId: AreaId;
  role: Role;
  available: boolean;
  awayUntil?: string;
  awayReason?: string;
}

export type Priority = "urgente" | "alta" | "media" | "baja";

export type TicketStatus =
  | "abierto"
  | "asignado"
  | "en_progreso"
  | "en_espera"
  | "resuelto"
  | "cerrado"
  | "reabierto"
  | "cancelado"
  | "fusionado";

export type SlaState = "en_tiempo" | "en_riesgo" | "vencido";

export interface TicketMessage {
  id: string;
  author: string;
  authorInitials: string;
  body: string;
  createdAt: string;
  internal: boolean;
  system?: boolean;
}

export interface Ticket {
  number: string;
  title: string;
  description: string;
  areaId: AreaId;
  category: string;
  priority: Priority;
  status: TicketStatus;
  requester: string;
  createdBy?: string;
  assignees: string[];
  createdAt: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  slaResponse: SlaState;
  slaResolution: SlaState;
  aiConfidence: number;
  csat?: number;
  hasAttachments?: boolean;
  incident?: string;
  mergedInto?: string;
  messages: TicketMessage[];
}
