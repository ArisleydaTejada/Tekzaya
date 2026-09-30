import type {
  AreaRef,
  Priority as ContractPriority,
  SlaState as ContractSlaState,
  TicketStatus as ContractTicketStatus,
} from "@tekzaya/shared";
import type { Area, AreaId, Priority, SlaState, Ticket, TicketStatus, User } from "./types";

export { formatWhen } from "../lib/format";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = () => Date.now();
const ago = (ms: number) => new Date(now() - ms).toISOString();

export const AREAS: Area[] = [
  {
    id: "it",
    name: "IT y Sistemas",
    color: "#7C8CAE",
    categories: ["Hardware", "Software", "Redes y conectividad", "Accesos y cuentas", "Correo", "Impresoras"],
  },
  {
    id: "mantenimiento",
    name: "Mantenimiento",
    color: "#A9895C",
    categories: ["Eléctrico", "Plomería", "Climatización", "Mobiliario", "Limpieza"],
  },
  {
    id: "rrhh",
    name: "Recursos Humanos",
    color: "#B98BA0",
    categories: ["Nómina", "Vacaciones y permisos", "Documentos y constancias", "Beneficios"],
  },
  {
    id: "ventas",
    name: "Ventas",
    color: "#5B9BB0",
    categories: ["Cotizaciones", "Clientes", "Comisiones"],
  },
  {
    id: "marketing",
    name: "Marketing",
    color: "#9B7EBD",
    categories: ["Material gráfico", "Redes sociales", "Eventos"],
  },
  {
    id: "finanzas",
    name: "Finanzas",
    color: "#8FA37C",
    categories: ["Reembolsos", "Pagos a proveedores", "Facturación"],
  },
];

export function areaById(id: AreaId): Area {
  return AREAS.find((a) => a.id === id)!;
}

export const USERS: User[] = [
  { id: "ana", name: "Ana Torres", initials: "AT", areaId: "it", role: "admin", available: true },
  { id: "luis", name: "Luis Fernández", initials: "LF", areaId: "it", role: "area_supervisor", available: true },
  { id: "marta", name: "Marta Gómez", initials: "MG", areaId: "it", role: "employee", available: true },
  {
    id: "carlos",
    name: "Carlos Ruiz",
    initials: "CR",
    areaId: "it",
    role: "employee",
    available: false,
    awayUntil: "30 sep",
    awayReason: "Vacaciones",
  },
  { id: "elena", name: "Elena Paredes", initials: "EP", areaId: "rrhh", role: "hr_supervisor", available: true },
  { id: "sofia", name: "Sofía Reyes", initials: "SR", areaId: "rrhh", role: "employee", available: true },
  { id: "diego", name: "Diego Castillo", initials: "DC", areaId: "mantenimiento", role: "area_supervisor", available: true },
  {
    id: "valentina",
    name: "Valentina Cruz",
    initials: "VC",
    areaId: "mantenimiento",
    role: "employee",
    available: false,
    awayUntil: "2 oct",
    awayReason: "Incapacidad",
  },
  { id: "javier", name: "Javier Molina", initials: "JM", areaId: "ventas", role: "employee", available: true },
  { id: "camila", name: "Camila Rojas", initials: "CJ", areaId: "marketing", role: "employee", available: true },
];

export const CURRENT_USER = USERS[0]; // Ana Torres — admin, área IT y Sistemas

export function userById(id: string): User | undefined {
  return USERS.find((u) => u.id === id);
}

export const PRIORITY_META: Record<Priority, { label: string; tone: "red" | "amber" | "amberSoft" | "green" }> = {
  urgente: { label: "Urgente", tone: "red" },
  alta: { label: "Alta", tone: "amber" },
  media: { label: "Media", tone: "amberSoft" },
  baja: { label: "Baja", tone: "green" },
};

export const STATUS_META: Record<TicketStatus, { label: string }> = {
  abierto: { label: "Abierto" },
  asignado: { label: "Asignado" },
  en_progreso: { label: "En progreso" },
  en_espera: { label: "En espera" },
  resuelto: { label: "Resuelto" },
  cerrado: { label: "Cerrado" },
  reabierto: { label: "Reabierto" },
  cancelado: { label: "Cancelado" },
  fusionado: { label: "Fusionado" },
};

export const SLA_META: Record<SlaState, { label: string; tone: "green" | "amber" | "red" }> = {
  en_tiempo: { label: "En tiempo", tone: "green" },
  en_riesgo: { label: "En riesgo", tone: "amber" },
  vencido: { label: "Vencido", tone: "red" },
};

export const TICKETS: Ticket[] = [
  {
    number: "TK-000512",
    title: "Se cayó el wifi en Ventas",
    description:
      "Desde hace 20 minutos nadie en el piso de Ventas tiene conexión wifi. Ya reiniciamos el router de la sala pero sigue sin funcionar.",
    areaId: "it",
    category: "Redes y conectividad",
    priority: "alta",
    status: "en_progreso",
    requester: "Javier Molina",
    assignees: ["luis", "marta"],
    createdAt: ago(35 * 60 * 1000),
    firstResponseAt: ago(28 * 60 * 1000),
    slaResponse: "en_tiempo",
    slaResolution: "en_riesgo",
    aiConfidence: 0.96,
    hasAttachments: true,
    incident: "Caída del wifi en Ventas",
    messages: [
      {
        id: "m1",
        author: "Javier Molina",
        authorInitials: "JM",
        body: "Desde hace 20 minutos nadie en el piso de Ventas tiene conexión wifi. Ya reiniciamos el router de la sala pero sigue sin funcionar.",
        createdAt: ago(35 * 60 * 1000),
        internal: false,
      },
      {
        id: "m2",
        author: "Sistema",
        authorInitials: "IA",
        body: "✨ La IA clasificó este ticket como IT y Sistemas · Redes y conectividad · Prioridad Alta (96% de confianza).",
        createdAt: ago(34 * 60 * 1000),
        internal: false,
        system: true,
      },
      {
        id: "m3",
        author: "Luis Fernández",
        authorInitials: "LF",
        body: "Tomo el ticket. Reviso el switch del piso 2, hay otros 2 reportes parecidos hoy.",
        createdAt: ago(28 * 60 * 1000),
        internal: false,
      },
      {
        id: "m4",
        author: "Luis Fernández",
        authorInitials: "LF",
        body: "Confirmado: el switch del piso 2 está reiniciándose solo cada pocos minutos. Parece falla de firmware, no del router de la sala.",
        createdAt: ago(20 * 60 * 1000),
        internal: true,
      },
      {
        id: "m5",
        author: "Marta Gómez",
        authorInitials: "MG",
        body: "@Luis tengo un switch de repuesto configurado en el clóset de redes, lo puedo llevar ahora.",
        createdAt: ago(12 * 60 * 1000),
        internal: true,
      },
    ],
  },
  {
    number: "TK-000509",
    title: "Wifi intermitente en sala de juntas 2",
    description: "La señal entra y sale cada pocos minutos durante las videollamadas.",
    areaId: "it",
    category: "Redes y conectividad",
    priority: "alta",
    status: "abierto",
    requester: "Camila Rojas",
    assignees: [],
    createdAt: ago(50 * 60 * 1000),
    slaResponse: "en_riesgo",
    slaResolution: "en_riesgo",
    aiConfidence: 0.91,
    incident: "Caída del wifi en Ventas",
    messages: [],
  },
  {
    number: "TK-000505",
    title: "No hay wifi en el segundo piso",
    description: "Todo el equipo de Marketing sin señal desde la mañana.",
    areaId: "it",
    category: "Redes y conectividad",
    priority: "alta",
    status: "abierto",
    requester: "Camila Rojas",
    assignees: [],
    createdAt: ago(70 * 60 * 1000),
    slaResponse: "vencido",
    slaResolution: "en_riesgo",
    aiConfidence: 0.93,
    incident: "Caída del wifi en Ventas",
    messages: [],
  },
  {
    number: "TK-000498",
    title: "No puedo entrar a mi correo",
    description: "Me dice contraseña incorrecta aunque la acabo de cambiar.",
    areaId: "it",
    category: "Correo",
    priority: "media",
    status: "asignado",
    requester: "Sofía Reyes",
    assignees: ["marta"],
    createdAt: ago(3 * HOUR),
    firstResponseAt: ago(2.5 * HOUR),
    slaResponse: "en_tiempo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.88,
    messages: [],
  },
  {
    number: "TK-000491",
    title: "Impresora del piso 3 no imprime a color",
    description: "Saca todo en blanco y negro aunque seleccione color.",
    areaId: "it",
    category: "Impresoras",
    priority: "baja",
    status: "en_espera",
    requester: "Diego Castillo",
    assignees: ["luis", "ana"],
    createdAt: ago(1 * DAY),
    firstResponseAt: ago(20 * HOUR),
    slaResponse: "en_tiempo",
    slaResolution: "en_riesgo",
    aiConfidence: 0.79,
    messages: [],
  },
  {
    number: "TK-000487",
    title: "Solicito acceso a carpeta compartida de Finanzas",
    description: "Necesito acceso de lectura a la carpeta de reportes mensuales.",
    areaId: "it",
    category: "Accesos y cuentas",
    priority: "baja",
    status: "resuelto",
    requester: "Javier Molina",
    assignees: ["marta"],
    createdAt: ago(2 * DAY),
    firstResponseAt: ago(2 * DAY - 40 * 60 * 1000),
    resolvedAt: ago(1.2 * DAY),
    slaResponse: "en_tiempo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.97,
    csat: 5,
    messages: [],
  },
  {
    number: "TK-000480",
    title: "Laptop no enciende",
    description: "Se quedó sin batería y ahora ni carga ni enciende.",
    areaId: "it",
    category: "Hardware",
    priority: "urgente",
    status: "en_progreso",
    requester: "Elena Paredes",
    createdBy: "Sofía Reyes",
    assignees: ["luis", "carlos", "ana"],
    createdAt: ago(45 * 60 * 1000),
    firstResponseAt: ago(12 * 60 * 1000),
    slaResponse: "en_tiempo",
    slaResolution: "en_riesgo",
    aiConfidence: 0.9,
    hasAttachments: true,
    messages: [],
  },
  {
    number: "TK-000476",
    title: "Actualizar licencia de diseño vencida",
    description: "La licencia de la suite de diseño expiró ayer.",
    areaId: "it",
    category: "Software",
    priority: "media",
    status: "cerrado",
    requester: "Camila Rojas",
    assignees: ["marta"],
    createdAt: ago(4 * DAY),
    firstResponseAt: ago(4 * DAY - 60 * 60 * 1000),
    resolvedAt: ago(3.5 * DAY),
    slaResponse: "en_tiempo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.94,
    csat: 4,
    messages: [],
  },
  {
    number: "TK-000471",
    title: "Mouse inalámbrico no conecta",
    description: "Cambié las pilas y sigue sin responder.",
    areaId: "it",
    category: "Hardware",
    priority: "baja",
    status: "cancelado",
    requester: "Diego Castillo",
    assignees: [],
    createdAt: ago(5 * DAY),
    slaResponse: "vencido",
    slaResolution: "vencido",
    aiConfidence: 0.72,
    messages: [],
  },
  {
    number: "TK-000466",
    title: "Duplicado — wifi caído en Ventas (reportado dos veces)",
    description: "Mismo reporte de wifi caído, ya fusionado con TK-000512.",
    areaId: "it",
    category: "Redes y conectividad",
    priority: "alta",
    status: "fusionado",
    requester: "Javier Molina",
    assignees: [],
    createdAt: ago(40 * 60 * 1000),
    slaResponse: "en_tiempo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.95,
    mergedInto: "TK-000512",
    messages: [],
  },
  {
    number: "TK-000459",
    title: "Clima no enfría en sala de servidores",
    description: "El aire acondicionado del cuarto de servidores está tibio.",
    areaId: "mantenimiento",
    category: "Climatización",
    priority: "urgente",
    status: "asignado",
    requester: "Luis Fernández",
    assignees: ["diego"],
    createdAt: ago(90 * 60 * 1000),
    firstResponseAt: ago(80 * 60 * 1000),
    slaResponse: "en_tiempo",
    slaResolution: "vencido",
    aiConfidence: 0.89,
    messages: [],
  },
  {
    number: "TK-000452",
    title: "Fuga de agua en el baño del piso 1",
    description: "Hay agua acumulándose bajo el lavamanos.",
    areaId: "mantenimiento",
    category: "Plomería",
    priority: "alta",
    status: "en_progreso",
    requester: "Sofía Reyes",
    assignees: ["diego", "valentina"],
    createdAt: ago(2 * HOUR),
    firstResponseAt: ago(100 * 60 * 1000),
    slaResponse: "en_tiempo",
    slaResolution: "en_riesgo",
    aiConfidence: 0.92,
    messages: [],
  },
  {
    number: "TK-000445",
    title: "Silla de oficina rota",
    description: "El brazo izquierdo de la silla se desprendió.",
    areaId: "mantenimiento",
    category: "Mobiliario",
    priority: "baja",
    status: "abierto",
    requester: "Camila Rojas",
    assignees: [],
    createdAt: ago(6 * HOUR),
    slaResponse: "en_riesgo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.85,
    messages: [],
  },
  {
    number: "TK-000441",
    title: "Solicitud de constancia laboral",
    description: "Necesito una constancia laboral para un trámite bancario.",
    areaId: "rrhh",
    category: "Documentos y constancias",
    priority: "media",
    status: "resuelto",
    requester: "Javier Molina",
    assignees: ["sofia"],
    createdAt: ago(1.5 * DAY),
    firstResponseAt: ago(1.4 * DAY),
    resolvedAt: ago(1 * DAY),
    slaResponse: "en_tiempo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.98,
    csat: 5,
    messages: [],
  },
  {
    number: "TK-000437",
    title: "Duda sobre días de vacaciones acumulados",
    description: "No me cuadra el saldo de vacaciones que veo en el portal.",
    areaId: "rrhh",
    category: "Vacaciones y permisos",
    priority: "baja",
    status: "en_espera",
    requester: "Marta Gómez",
    assignees: ["elena"],
    createdAt: ago(2 * DAY),
    firstResponseAt: ago(1.8 * DAY),
    slaResponse: "en_tiempo",
    slaResolution: "en_riesgo",
    aiConfidence: 0.81,
    messages: [],
  },
  {
    number: "TK-000430",
    title: "Cotización urgente para cliente Norlinea",
    description: "El cliente pide la cotización antes de las 5 pm de hoy.",
    areaId: "ventas",
    category: "Cotizaciones",
    priority: "urgente",
    status: "abierto",
    requester: "Javier Molina",
    assignees: [],
    createdAt: ago(25 * 60 * 1000),
    slaResponse: "en_riesgo",
    slaResolution: "en_riesgo",
    aiConfidence: 0.9,
    messages: [],
  },
  {
    number: "TK-000424",
    title: "Actualizar material gráfico de la feria",
    description: "Los banners tienen el logo anterior, hay que actualizarlos.",
    areaId: "marketing",
    category: "Material gráfico",
    priority: "media",
    status: "en_progreso",
    requester: "Elena Paredes",
    assignees: ["camila"],
    createdAt: ago(5 * HOUR),
    firstResponseAt: ago(4 * HOUR),
    slaResponse: "en_tiempo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.86,
    messages: [],
  },
  {
    number: "TK-000418",
    title: "Reembolso de viáticos pendiente",
    description: "Envié los comprobantes hace dos semanas y sigue sin procesarse.",
    areaId: "finanzas",
    category: "Reembolsos",
    priority: "media",
    status: "reabierto",
    requester: "Diego Castillo",
    assignees: [],
    createdAt: ago(3 * DAY),
    firstResponseAt: ago(2.8 * DAY),
    slaResponse: "vencido",
    slaResolution: "vencido",
    aiConfidence: 0.83,
    messages: [],
  },
  {
    number: "TK-000410",
    title: "Factura con datos fiscales incorrectos",
    description: "El RFC en la factura no corresponde al cliente.",
    areaId: "finanzas",
    category: "Facturación",
    priority: "alta",
    status: "cerrado",
    requester: "Javier Molina",
    assignees: [],
    createdAt: ago(6 * DAY),
    firstResponseAt: ago(6 * DAY - 30 * 60 * 1000),
    resolvedAt: ago(5 * DAY),
    slaResponse: "en_tiempo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.95,
    csat: 3,
    messages: [],
  },
  {
    number: "TK-000520",
    title: "Reembolso de curso de certificación",
    description: "Adjunto el comprobante del curso de certificación aprobado por mi jefatura en marzo.",
    areaId: "finanzas",
    category: "Reembolsos",
    priority: "baja",
    status: "abierto",
    requester: "Ana Torres",
    assignees: [],
    createdAt: ago(90 * 60 * 1000),
    slaResponse: "en_tiempo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.88,
    hasAttachments: true,
    messages: [],
  },
  {
    number: "TK-000515",
    title: "Acceso al portal de proveedores",
    description: "Necesito acceso para revisar el estado de dos órdenes de compra.",
    areaId: "rrhh",
    category: "Documentos y constancias",
    priority: "media",
    status: "asignado",
    requester: "Ana Torres",
    assignees: ["elena"],
    createdAt: ago(5 * HOUR),
    firstResponseAt: ago(3 * HOUR),
    slaResponse: "en_tiempo",
    slaResolution: "en_tiempo",
    aiConfidence: 0.84,
    messages: [],
  },
];

export function ticketsForArea(areaId: AreaId) {
  return TICKETS.filter((t) => t.areaId === areaId);
}

export function ticketByNumber(number: string) {
  return TICKETS.find((t) => t.number === number);
}

const ACTIVE_STATUSES: TicketStatus[] = ["abierto", "asignado", "en_progreso", "en_espera", "reabierto"];
export function isActive(t: Ticket) {
  return ACTIVE_STATUSES.includes(t.status);
}

export function initialsFor(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ── Puente hacia el contrato ──────────────────────────────────
// Tablero y Reportes siguen leyendo del mock (migran en F6 y F7), pero los
// componentes compartidos ya hablan el contrato en inglés. Estas tablas son el
// único punto de traducción, y desaparecen con el mock.

export const CONTRACT_PRIORITY: Record<Priority, ContractPriority> = {
  urgente: "urgent",
  alta: "high",
  media: "medium",
  baja: "low",
};

export const CONTRACT_STATUS: Record<TicketStatus, ContractTicketStatus> = {
  abierto: "open",
  asignado: "assigned",
  en_progreso: "in_progress",
  en_espera: "on_hold",
  resuelto: "resolved",
  cerrado: "closed",
  reabierto: "reopened",
  cancelado: "cancelled",
  fusionado: "merged",
};

export const CONTRACT_SLA: Record<SlaState, ContractSlaState> = {
  en_tiempo: "on_time",
  en_riesgo: "at_risk",
  vencido: "breached",
};

export function areaRefOf(id: AreaId): AreaRef {
  const area = areaById(id);
  return { id: area.id, name: area.name, color: area.color };
}

export function usersOf(ids: readonly string[]): { id: string; name: string }[] {
  return ids.map((id) => ({ id, name: userById(id)?.name ?? "Desconocido" }));
}
