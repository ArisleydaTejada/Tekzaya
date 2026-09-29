import type { Priority } from "@tekzaya/shared";

export interface SeedArea {
  name: string;
  description: string;
  color: string;
  categories: string[];
}

/** Áreas y categorías iniciales del spec §5.4. */
export const AREAS: SeedArea[] = [
  {
    name: "IT y Sistemas",
    description: "Equipos, accesos, redes y software corporativo.",
    color: "#6c5ce7",
    categories: [
      "Hardware",
      "Software",
      "Redes y conectividad",
      "Accesos y cuentas",
      "Correo",
      "Impresoras",
    ],
  },
  {
    name: "Mantenimiento",
    description: "Instalaciones, mobiliario y servicios generales.",
    color: "#f5a623",
    categories: ["Eléctrico", "Plomería", "Climatización", "Mobiliario", "Limpieza"],
  },
  {
    name: "Recursos Humanos",
    description: "Nómina, permisos y documentación del personal.",
    color: "#39d98a",
    categories: ["Nómina", "Vacaciones y permisos", "Documentos y constancias", "Beneficios"],
  },
  {
    name: "Ventas",
    description: "Cotizaciones, clientes y comisiones.",
    color: "#2f6fcb",
    categories: ["Cotizaciones", "Clientes", "Comisiones"],
  },
  {
    name: "Marketing",
    description: "Material gráfico, redes sociales y eventos.",
    color: "#e5484d",
    categories: ["Material gráfico", "Redes sociales", "Eventos"],
  },
  {
    name: "Finanzas",
    description: "Reembolsos, pagos a proveedores y facturación.",
    color: "#7c8cae",
    categories: ["Reembolsos", "Pagos a proveedores", "Facturación"],
  },
];

export interface SeedUser {
  name: string;
  email: string;
  areaName: string;
  role: "employee" | "admin";
  isAreaSupervisor?: boolean;
  hasGlobalReadAccess?: boolean;
  away?: { reason: "vacation" | "leave" | "sick" | "other"; days: number };
}

export const USERS: SeedUser[] = [
  // Cuentas reales del equipo.
  {
    name: "Arisleyda Tejada",
    email: "arisleyda.tejada@tekzaya.com",
    areaName: "IT y Sistemas",
    role: "admin",
  },
  {
    name: "Daury Guzman",
    email: "daury.guzman@tekzaya.com",
    areaName: "IT y Sistemas",
    role: "employee",
    isAreaSupervisor: true,
  },

  // Personas de ejemplo.
  { name: "Luis Fernández", email: "luis.fernandez@tekzaya.com", areaName: "IT y Sistemas", role: "employee" },
  { name: "Marta Gómez", email: "marta.gomez@tekzaya.com", areaName: "IT y Sistemas", role: "employee" },
  {
    name: "Carlos Ruiz",
    email: "carlos.ruiz@tekzaya.com",
    areaName: "IT y Sistemas",
    role: "employee",
    away: { reason: "vacation", days: 4 },
  },

  { name: "Pedro Salazar", email: "pedro.salazar@tekzaya.com", areaName: "Mantenimiento", role: "employee", isAreaSupervisor: true },
  { name: "Rosa Medina", email: "rosa.medina@tekzaya.com", areaName: "Mantenimiento", role: "employee" },

  // Supervisora de RRHH: además de su área, lectura global (spec §4.2).
  {
    name: "Elena Paredes",
    email: "elena.paredes@tekzaya.com",
    areaName: "Recursos Humanos",
    role: "employee",
    isAreaSupervisor: true,
    hasGlobalReadAccess: true,
  },
  { name: "Javier Molina", email: "javier.molina@tekzaya.com", areaName: "Recursos Humanos", role: "employee" },

  { name: "Camila Rojas", email: "camila.rojas@tekzaya.com", areaName: "Ventas", role: "employee", isAreaSupervisor: true },
  { name: "Diego Castillo", email: "diego.castillo@tekzaya.com", areaName: "Ventas", role: "employee" },

  { name: "Sofía Reyes", email: "sofia.reyes@tekzaya.com", areaName: "Marketing", role: "employee", isAreaSupervisor: true },
  { name: "Andrés Lira", email: "andres.lira@tekzaya.com", areaName: "Marketing", role: "employee" },

  { name: "Valeria Núñez", email: "valeria.nunez@tekzaya.com", areaName: "Finanzas", role: "employee", isAreaSupervisor: true },
  { name: "Tomás Vega", email: "tomas.vega@tekzaya.com", areaName: "Finanzas", role: "employee" },
];

export interface TicketTemplate {
  areaName: string;
  category: string;
  title: string;
  description: string;
  priority: Priority;
  /** Respuestas típicas del agente, para que la conversación no quede vacía. */
  replies: string[];
  internalNotes?: string[];
}

export const TICKET_TEMPLATES: TicketTemplate[] = [
  {
    areaName: "IT y Sistemas",
    category: "Hardware",
    title: "La laptop no enciende después de la actualización",
    description:
      "Desde ayer la laptop no arranca. Enciende la luz de carga pero la pantalla se queda en negro. Ya probé dejarla cargando toda la noche y no cambió nada.",
    priority: "high",
    replies: [
      "Buenos días. Vamos a revisarla: ¿podrías traerla al piso 2 o prefieres que pasemos por tu puesto?",
      "Ya la revisamos, era la memoria RAM. Quedó cambiada y probada.",
    ],
    internalNotes: ["Equipo con 4 años de uso, candidato a reemplazo en el próximo presupuesto."],
  },
  {
    areaName: "IT y Sistemas",
    category: "Redes y conectividad",
    title: "No hay wifi en el segundo piso",
    description:
      "Ninguno de los equipos del segundo piso se conecta a la red. El cable sí funciona, pero el wifi no aparece en la lista.",
    priority: "urgent",
    replies: ["Confirmado, el punto de acceso del piso 2 está caído. Vamos para allá."],
    internalNotes: ["El AP del piso 2 volvió a reiniciarse solo. Revisar si es la fuente."],
  },
  {
    areaName: "IT y Sistemas",
    category: "Redes y conectividad",
    title: "Wifi intermitente en la sala de juntas",
    description:
      "En la sala de juntas la conexión se cae cada pocos minutos. Tenemos una reunión con cliente el jueves y necesitamos que funcione.",
    priority: "high",
    replies: ["Vamos a medir la señal en la sala esta tarde."],
  },
  {
    areaName: "IT y Sistemas",
    category: "Accesos y cuentas",
    title: "No puedo entrar a mi correo",
    description:
      "Me pide la contraseña una y otra vez aunque la escribo bien. Ya intenté desde el teléfono y pasa lo mismo.",
    priority: "medium",
    replies: ["Te restablecimos la contraseña, revisa tu teléfono para el código temporal."],
  },
  {
    areaName: "IT y Sistemas",
    category: "Accesos y cuentas",
    title: "Solicito acceso a la carpeta compartida de Finanzas",
    description:
      "Necesito entrar a la carpeta de Finanzas para subir los reportes mensuales del área.",
    priority: "low",
    replies: ["Pedimos autorización a Finanzas antes de dar el acceso."],
    internalNotes: ["Valeria autorizó por escrito el acceso de solo lectura."],
  },
  {
    areaName: "IT y Sistemas",
    category: "Impresoras",
    title: "La impresora del piso 3 no imprime a color",
    description:
      "Imprime todo en escala de grises aunque el documento es a color y el cartucho se cambió la semana pasada.",
    priority: "low",
    replies: ["Revisamos la configuración del controlador, estaba en modo borrador."],
  },
  {
    areaName: "IT y Sistemas",
    category: "Software",
    title: "Actualizar licencia de diseño vencida",
    description: "El programa de diseño avisa que la licencia venció y no deja exportar nada.",
    priority: "medium",
    replies: ["Renovamos la licencia, cierra y vuelve a abrir el programa."],
  },
  {
    areaName: "IT y Sistemas",
    category: "Hardware",
    title: "El mouse inalámbrico no conecta",
    description: "Cambié las pilas y sigue sin responder. El receptor USB enciende pero no mueve el cursor.",
    priority: "low",
    replies: ["Te dejamos uno de repuesto en recepción."],
  },
  {
    areaName: "Mantenimiento",
    category: "Climatización",
    title: "El aire acondicionado de recepción gotea",
    description:
      "Está cayendo agua sobre el mostrador de recepción desde la mañana. Pusimos un balde mientras tanto.",
    priority: "high",
    replies: ["Vamos a destapar el drenaje hoy mismo."],
  },
  {
    areaName: "Mantenimiento",
    category: "Eléctrico",
    title: "Tomacorriente sin corriente en el área de ventas",
    description: "Dos tomacorrientes del área de ventas no dan corriente desde el lunes.",
    priority: "medium",
    replies: ["Revisamos el tablero, había un breaker disparado."],
  },
  {
    areaName: "Mantenimiento",
    category: "Plomería",
    title: "Fuga de agua en el baño del primer piso",
    description: "El lavamanos del baño de hombres gotea constantemente y ya se está acumulando agua.",
    priority: "urgent",
    replies: ["Cerramos la llave de paso y cambiamos el empaque."],
  },
  {
    areaName: "Mantenimiento",
    category: "Mobiliario",
    title: "Silla de oficina rota en contabilidad",
    description: "La base de la silla está partida y ya no se puede usar sin riesgo de caerse.",
    priority: "low",
    replies: ["Retiramos la silla y solicitamos el reemplazo."],
  },
  {
    areaName: "Mantenimiento",
    category: "Limpieza",
    title: "Solicito limpieza profunda de la sala de capacitación",
    description: "Después del taller del viernes quedó bastante sucia y hay evento el lunes.",
    priority: "low",
    replies: ["Programado para el sábado por la mañana."],
  },
  {
    areaName: "Recursos Humanos",
    category: "Vacaciones y permisos",
    title: "Solicitud de vacaciones para diciembre",
    description: "Quisiera tomar vacaciones del 15 al 30 de diciembre. Ya coordiné la cobertura con mi equipo.",
    priority: "low",
    replies: ["Recibido, lo pasamos a aprobación de tu supervisor."],
    internalNotes: ["Verificar que no coincida con el cierre contable."],
  },
  {
    areaName: "Recursos Humanos",
    category: "Documentos y constancias",
    title: "Necesito una constancia de trabajo",
    description: "Me la pide el banco para un préstamo. La necesito con sello y firma.",
    priority: "medium",
    replies: ["Tu constancia está lista, pásala a recoger por RRHH."],
  },
  {
    areaName: "Recursos Humanos",
    category: "Nómina",
    title: "Descuento no reconocido en el último pago",
    description:
      "En el pago de este mes aparece un descuento que no reconozco y no viene detallado en el recibo.",
    priority: "high",
    replies: ["Lo revisamos con contabilidad y te confirmamos."],
    internalNotes: ["Corresponde a un adelanto de agosto mal etiquetado."],
  },
  {
    areaName: "Recursos Humanos",
    category: "Beneficios",
    title: "Consulta sobre el seguro médico familiar",
    description: "Quiero saber cómo incluir a mi hija en el seguro y qué documentos hacen falta.",
    priority: "low",
    replies: ["Te enviamos el formulario y la lista de requisitos."],
  },
  {
    areaName: "Ventas",
    category: "Cotizaciones",
    title: "Error en la cotización enviada al cliente",
    description:
      "La cotización salió con el precio anterior. El cliente ya la recibió y pregunta cuál es el correcto.",
    priority: "urgent",
    replies: ["Corregimos y reenviamos la cotización con una nota de disculpa."],
  },
  {
    areaName: "Ventas",
    category: "Clientes",
    title: "Actualizar datos de contacto de un cliente",
    description: "El cliente cambió de correo y de teléfono, hay que actualizarlo en el sistema.",
    priority: "low",
    replies: ["Datos actualizados."],
  },
  {
    areaName: "Ventas",
    category: "Comisiones",
    title: "Comisión del mes no aparece reflejada",
    description: "Cerré tres ventas en septiembre pero la comisión no aparece en el resumen.",
    priority: "medium",
    replies: ["Lo estamos cruzando con el reporte de facturación."],
  },
  {
    areaName: "Marketing",
    category: "Material gráfico",
    title: "Necesito el logo en alta resolución",
    description: "Para el banner del evento necesito el logo en vectorial, el que tengo se pixela.",
    priority: "medium",
    replies: ["Te compartimos la carpeta con los archivos vectoriales."],
  },
  {
    areaName: "Marketing",
    category: "Eventos",
    title: "Material para la feria del próximo mes",
    description: "Hay que preparar brochures y banners para la feria. Somos tres personas en el stand.",
    priority: "medium",
    replies: ["Ya tenemos el diseño, entra a imprenta esta semana."],
  },
  {
    areaName: "Marketing",
    category: "Redes sociales",
    title: "Publicación con dato incorrecto en redes",
    description: "La publicación de ayer tiene mal el horario de atención. Varios clientes ya preguntaron.",
    priority: "high",
    replies: ["Corregido y publicada una aclaración."],
  },
  {
    areaName: "Finanzas",
    category: "Reembolsos",
    title: "Reembolso de viáticos del viaje a la sucursal",
    description: "Adjunto las facturas del viaje de la semana pasada para el reembolso.",
    priority: "medium",
    replies: ["Recibido, entra en el pago del viernes."],
  },
  {
    areaName: "Finanzas",
    category: "Facturación",
    title: "Factura rechazada por datos fiscales",
    description: "El cliente devolvió la factura porque el RNC está mal escrito.",
    priority: "high",
    replies: ["Anulamos y emitimos la factura corregida."],
  },
  {
    areaName: "Finanzas",
    category: "Pagos a proveedores",
    title: "Proveedor reclama pago vencido",
    description: "El proveedor de papelería llamó porque la factura de agosto sigue sin pagarse.",
    priority: "high",
    replies: ["Confirmamos que quedó fuera del lote, se programa para esta semana."],
  },
];

/** Tickets del mismo síntoma que la IA debe agrupar como incidente (spec §6.2, IA-5). */
export const INCIDENT_TICKETS = [
  "Se cayó el wifi en Ventas",
  "No tengo internet en mi computadora",
  "La red se desconecta cada dos minutos",
];
