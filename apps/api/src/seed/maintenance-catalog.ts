import type { AssetType, PartUnit, PlanMode, PlanUnit } from "@tekzaya/shared";

/**
 * Catálogo de la semilla del módulo 2 (plan A0). Los montos van en centavos de
 * dólar, la moneda por defecto. Las áreas se nombran como en `catalog.ts`.
 */

export const IT_AREA = "IT y Sistemas";
export const MAINT_AREA = "Mantenimiento";

/** Dónde vive cada área en el edificio; la ubicación de sus equipos sale de aquí. */
export const AREA_LOCATION: Record<string, string> = {
  "IT y Sistemas": "Piso 3 · IT y Sistemas",
  Mantenimiento: "Sótano · Taller de mantenimiento",
  "Recursos Humanos": "Piso 2 · Recursos Humanos",
  Ventas: "Piso 1 · Ventas",
  Marketing: "Piso 2 · Marketing",
  Finanzas: "Piso 3 · Finanzas",
};

export interface AssetModel {
  type: AssetType;
  name: string;
  brand: string;
  model: string;
  /** Precio de compra, en centavos. */
  cost: number;
  /** Meses de garantía desde la compra. */
  warrantyMonths: number;
}

/** Una laptop por persona: se reparten estos modelos por turnos. */
export const LAPTOP_MODELS: AssetModel[] = [
  { type: "laptop", name: "Laptop", brand: "Dell", model: "Latitude 5440", cost: 112_900, warrantyMonths: 36 },
  { type: "laptop", name: "Laptop", brand: "Lenovo", model: "ThinkPad T14 Gen 4", cost: 124_500, warrantyMonths: 36 },
  { type: "laptop", name: "Laptop", brand: "HP", model: "EliteBook 840 G10", cost: 118_000, warrantyMonths: 24 },
];

export interface FixedAsset extends AssetModel {
  /** Área responsable: la que lo mantiene. */
  areaName: string;
  /** Área que lo usa; si falta, la misma responsable. */
  usedBy?: string;
  location: string;
  /** Antigüedad de la compra, en meses. */
  ageMonths: number;
}

/** Equipos compartidos: no tienen persona a cargo, sí un área que los usa. */
export const FIXED_ASSETS: FixedAsset[] = [
  // ── IT y Sistemas ──
  { type: "desktop", name: "PC de recepción", brand: "Dell", model: "OptiPlex 7010", cost: 78_000, warrantyMonths: 36, areaName: IT_AREA, usedBy: "Recursos Humanos", location: "Piso 1 · Recepción", ageMonths: 30 },
  { type: "desktop", name: "PC de facturación", brand: "HP", model: "ProDesk 400 G9", cost: 72_500, warrantyMonths: 24, areaName: IT_AREA, usedBy: "Finanzas", location: "Piso 3 · Finanzas", ageMonths: 22 },
  { type: "desktop", name: "PC de contabilidad", brand: "HP", model: "ProDesk 400 G9", cost: 72_500, warrantyMonths: 24, areaName: IT_AREA, usedBy: "Finanzas", location: "Piso 3 · Finanzas", ageMonths: 22 },
  { type: "desktop", name: "PC de la sala de capacitación", brand: "Lenovo", model: "ThinkCentre M70q", cost: 64_000, warrantyMonths: 36, areaName: IT_AREA, location: "Piso 2 · Sala de capacitación", ageMonths: 14 },
  { type: "monitor", name: "Monitor de diseño", brand: "Dell", model: "UltraSharp U2723QE", cost: 58_900, warrantyMonths: 36, areaName: IT_AREA, usedBy: "Marketing", location: "Piso 2 · Marketing", ageMonths: 18 },
  { type: "monitor", name: "Monitor de diseño", brand: "Dell", model: "UltraSharp U2723QE", cost: 58_900, warrantyMonths: 36, areaName: IT_AREA, usedBy: "Marketing", location: "Piso 2 · Marketing", ageMonths: 18 },
  { type: "monitor", name: "Monitor", brand: "LG", model: "24MP400", cost: 13_900, warrantyMonths: 12, areaName: IT_AREA, usedBy: "Finanzas", location: "Piso 3 · Finanzas", ageMonths: 26 },
  { type: "monitor", name: "Monitor", brand: "LG", model: "24MP400", cost: 13_900, warrantyMonths: 12, areaName: IT_AREA, usedBy: "Ventas", location: "Piso 1 · Ventas", ageMonths: 26 },
  { type: "monitor", name: "Pantalla de la sala de juntas", brand: "Samsung", model: "QM55C", cost: 98_000, warrantyMonths: 24, areaName: IT_AREA, location: "Piso 2 · Sala de juntas", ageMonths: 11 },
  { type: "monitor", name: "Monitor de monitoreo", brand: "Samsung", model: "S24C310", cost: 12_500, warrantyMonths: 12, areaName: IT_AREA, location: "Piso 3 · Cuarto de servidores", ageMonths: 40 },
  { type: "printer", name: "Impresora multifuncional de Ventas", brand: "Canon", model: "imageRUNNER 2425", cost: 120_000, warrantyMonths: 12, areaName: IT_AREA, usedBy: "Ventas", location: "Piso 1 · Ventas", ageMonths: 34 },
  { type: "printer", name: "Impresora de Finanzas", brand: "HP", model: "LaserJet Pro M404dn", cost: 38_900, warrantyMonths: 12, areaName: IT_AREA, usedBy: "Finanzas", location: "Piso 3 · Finanzas", ageMonths: 28 },
  { type: "printer", name: "Impresora de RRHH", brand: "Brother", model: "HL-L2350DW", cost: 16_900, warrantyMonths: 12, areaName: IT_AREA, usedBy: "Recursos Humanos", location: "Piso 2 · Recursos Humanos", ageMonths: 20 },
  { type: "printer", name: "Impresora a color de Marketing", brand: "Epson", model: "EcoTank L6270", cost: 42_000, warrantyMonths: 24, areaName: IT_AREA, usedBy: "Marketing", location: "Piso 2 · Marketing", ageMonths: 13 },
  { type: "printer", name: "Impresora de etiquetas", brand: "Zebra", model: "ZD421", cost: 45_500, warrantyMonths: 12, areaName: IT_AREA, location: "Sótano · Almacén", ageMonths: 16 },
  { type: "network", name: "Switch principal", brand: "Cisco", model: "CBS250-48T-4G", cost: 89_000, warrantyMonths: 60, areaName: IT_AREA, location: "Piso 3 · Cuarto de servidores", ageMonths: 38 },
  { type: "network", name: "Punto de acceso wifi · Piso 1", brand: "Ubiquiti", model: "U6 Pro", cost: 18_900, warrantyMonths: 12, areaName: IT_AREA, location: "Piso 1 · Pasillo", ageMonths: 15 },
  { type: "network", name: "Punto de acceso wifi · Piso 2", brand: "Ubiquiti", model: "U6 Pro", cost: 18_900, warrantyMonths: 12, areaName: IT_AREA, location: "Piso 2 · Pasillo", ageMonths: 15 },
  { type: "network", name: "Router de borde", brand: "MikroTik", model: "RB5009UG+S+IN", cost: 27_900, warrantyMonths: 12, areaName: IT_AREA, location: "Piso 3 · Cuarto de servidores", ageMonths: 25 },
  { type: "server", name: "Servidor de archivos", brand: "Dell", model: "PowerEdge T150", cost: 245_000, warrantyMonths: 36, areaName: IT_AREA, location: "Piso 3 · Cuarto de servidores", ageMonths: 33 },
  { type: "ups", name: "UPS del cuarto de servidores", brand: "APC", model: "Smart-UPS SMT1500", cost: 78_500, warrantyMonths: 24, areaName: IT_AREA, location: "Piso 3 · Cuarto de servidores", ageMonths: 33 },
  { type: "ups", name: "UPS de recepción", brand: "APC", model: "Back-UPS BX1500M", cost: 21_900, warrantyMonths: 24, areaName: IT_AREA, location: "Piso 1 · Recepción", ageMonths: 23 },
  { type: "phone", name: "Teléfono IP de recepción", brand: "Yealink", model: "T46U", cost: 15_900, warrantyMonths: 12, areaName: IT_AREA, usedBy: "Recursos Humanos", location: "Piso 1 · Recepción", ageMonths: 27 },
  { type: "phone", name: "Teléfono de conferencias", brand: "Yealink", model: "CP925", cost: 54_000, warrantyMonths: 12, areaName: IT_AREA, location: "Piso 2 · Sala de juntas", ageMonths: 19 },
  { type: "phone", name: "Teléfono IP de Ventas", brand: "Yealink", model: "T46U", cost: 15_900, warrantyMonths: 12, areaName: IT_AREA, usedBy: "Ventas", location: "Piso 1 · Ventas", ageMonths: 27 },

  // ── Mantenimiento ──
  { type: "air_conditioner", name: "Aire acondicionado · Sala de juntas", brand: "Carrier", model: "Split XPower 24 000 BTU", cost: 98_000, warrantyMonths: 24, areaName: MAINT_AREA, location: "Piso 2 · Sala de juntas", ageMonths: 36 },
  { type: "air_conditioner", name: "Aire acondicionado · Ventas", brand: "LG", model: "Dual Inverter 18 000 BTU", cost: 76_000, warrantyMonths: 24, areaName: MAINT_AREA, usedBy: "Ventas", location: "Piso 1 · Ventas", ageMonths: 30 },
  { type: "air_conditioner", name: "Aire acondicionado · Finanzas", brand: "LG", model: "Dual Inverter 18 000 BTU", cost: 76_000, warrantyMonths: 24, areaName: MAINT_AREA, usedBy: "Finanzas", location: "Piso 3 · Finanzas", ageMonths: 30 },
  { type: "air_conditioner", name: "Aire acondicionado · Cuarto de servidores", brand: "Daikin", model: "FTKF 12 000 BTU", cost: 64_000, warrantyMonths: 36, areaName: MAINT_AREA, usedBy: IT_AREA, location: "Piso 3 · Cuarto de servidores", ageMonths: 20 },
  { type: "air_conditioner", name: "Aire acondicionado · Recepción", brand: "Carrier", model: "Split XPower 18 000 BTU", cost: 79_000, warrantyMonths: 24, areaName: MAINT_AREA, location: "Piso 1 · Recepción", ageMonths: 44 },
  { type: "air_conditioner", name: "Aire acondicionado · Comedor", brand: "Midea", model: "Xtreme Save 24 000 BTU", cost: 69_000, warrantyMonths: 12, areaName: MAINT_AREA, location: "Piso 1 · Comedor", ageMonths: 26 },
  { type: "generator", name: "Planta eléctrica", brand: "Cummins", model: "C60D6", cost: 1_850_000, warrantyMonths: 24, areaName: MAINT_AREA, location: "Exterior · Patio de servicio", ageMonths: 48 },
  { type: "plumbing", name: "Bomba de agua", brand: "Pedrollo", model: "CPm 620", cost: 42_000, warrantyMonths: 12, areaName: MAINT_AREA, location: "Sótano · Cisterna", ageMonths: 38 },
  { type: "electrical", name: "Tablero eléctrico principal", brand: "Schneider", model: "QO 42 circuitos", cost: 135_000, warrantyMonths: 24, areaName: MAINT_AREA, location: "Sótano · Cuarto eléctrico", ageMonths: 60 },
  { type: "electrical", name: "Tablero eléctrico · Piso 2", brand: "Schneider", model: "QO 24 circuitos", cost: 68_000, warrantyMonths: 24, areaName: MAINT_AREA, location: "Piso 2 · Cuarto eléctrico", ageMonths: 60 },
  { type: "appliance", name: "Refrigerador del comedor", brand: "Samsung", model: "RT38K5930S8", cost: 89_000, warrantyMonths: 12, areaName: MAINT_AREA, location: "Piso 1 · Comedor", ageMonths: 29 },
  { type: "appliance", name: "Microondas del comedor", brand: "Panasonic", model: "NN-ST65JM", cost: 18_500, warrantyMonths: 12, areaName: MAINT_AREA, location: "Piso 1 · Comedor", ageMonths: 29 },
  { type: "appliance", name: "Dispensador de agua", brand: "Whirlpool", model: "WK5004Q", cost: 24_900, warrantyMonths: 12, areaName: MAINT_AREA, location: "Piso 2 · Pasillo", ageMonths: 17 },
  { type: "furniture", name: "Mesa de juntas eléctrica", brand: "Steelcase", model: "Ology", cost: 210_000, warrantyMonths: 60, areaName: MAINT_AREA, location: "Piso 2 · Sala de juntas", ageMonths: 24 },
  { type: "furniture", name: "Persianas motorizadas de la sala de juntas", brand: "Somfy", model: "Sonesse 30", cost: 64_000, warrantyMonths: 24, areaName: MAINT_AREA, location: "Piso 2 · Sala de juntas", ageMonths: 24 },
  { type: "vehicle", name: "Camioneta de reparto", brand: "Toyota", model: "Hilux 2.4 4x2", cost: 3_250_000, warrantyMonths: 36, areaName: MAINT_AREA, usedBy: "Ventas", location: "Exterior · Estacionamiento", ageMonths: 27 },
];

/** Equipos que ya se dieron de baja: el inventario los conserva (nada se borra). */
export const RETIRED_ASSETS: (FixedAsset & { retiredMonthsAgo: number; reason: string })[] = [
  { type: "laptop", name: "Laptop", brand: "Dell", model: "Latitude 5490", cost: 98_000, warrantyMonths: 36, areaName: IT_AREA, usedBy: "Ventas", location: "Sótano · Almacén", ageMonths: 62, retiredMonthsAgo: 5, reason: "Placa madre dañada; la reparación costaba más que un equipo nuevo." },
  { type: "printer", name: "Impresora de Finanzas (anterior)", brand: "HP", model: "LaserJet P2055dn", cost: 31_000, warrantyMonths: 12, areaName: IT_AREA, usedBy: "Finanzas", location: "Sótano · Almacén", ageMonths: 84, retiredMonthsAgo: 9, reason: "Fin de vida útil: el fabricante ya no vende repuestos." },
];

/**
 * El activo de las fallas repetidas, para la demo de IA (plan A0, A7): tres
 * correctivas en los últimos 90 días y reparaciones que ya suman más de la mitad
 * de su precio. Es la multifuncional de Ventas.
 */
export const REPEATED_FAILURE_ASSET = "Impresora multifuncional de Ventas";

/** Fallas por año, según el tipo de equipo. */
export const FAILURE_RATE: Record<AssetType, number> = {
  laptop: 1,
  desktop: 0.8,
  monitor: 0.3,
  printer: 3,
  network: 0.9,
  server: 0.6,
  phone: 0.5,
  ups: 0.6,
  air_conditioner: 2,
  generator: 0.8,
  electrical: 0.8,
  plumbing: 1.6,
  appliance: 1,
  furniture: 0.5,
  vehicle: 2,
  other: 0.5,
};

/** Probabilidad de que una falla deje el equipo fuera de servicio. */
export const OUT_OF_SERVICE_RATE: Record<AssetType, number> = {
  laptop: 0.7,
  desktop: 0.7,
  monitor: 0.8,
  printer: 0.8,
  network: 0.9,
  server: 0.9,
  phone: 0.5,
  ups: 0.6,
  air_conditioner: 0.7,
  generator: 0.9,
  electrical: 0.5,
  plumbing: 0.6,
  appliance: 0.6,
  furniture: 0.3,
  vehicle: 0.9,
  other: 0.5,
};

export interface FailureTemplate {
  title: string;
  description: string;
  notes: string;
}

export const FAILURES: Partial<Record<AssetType, FailureTemplate[]>> = {
  laptop: [
    { title: "No enciende", description: "El equipo no da señal al pulsar el botón de encendido.", notes: "Se reemplazó el cargador defectuoso; el equipo enciende y carga con normalidad." },
    { title: "Batería no retiene carga", description: "Se apaga a los 20 minutos de desconectarla.", notes: "Batería reemplazada. Ciclos de carga verificados." },
    { title: "Teclado con teclas que no responden", description: "Varias teclas de la fila superior no escriben.", notes: "Se reemplazó el teclado completo." },
    { title: "Pantalla con parpadeo", description: "La pantalla parpadea al mover la tapa.", notes: "Cable flex de pantalla reasentado y asegurado." },
  ],
  desktop: [
    { title: "Se reinicia sola", description: "La computadora se reinicia varias veces al día.", notes: "Fuente de poder reemplazada; pruebas de estrés sin reinicios." },
    { title: "Disco lleno y lento", description: "Tarda varios minutos en arrancar.", notes: "Se migró a SSD y se reinstaló el sistema." },
  ],
  monitor: [
    { title: "Sin imagen", description: "El monitor enciende pero no muestra imagen.", notes: "Cable DisplayPort reemplazado." },
  ],
  printer: [
    { title: "Atasco de papel constante", description: "Se atasca casi en cada impresión.", notes: "Rodillos de alimentación reemplazados y limpieza interna." },
    { title: "Impresión con manchas", description: "Las hojas salen con rayas negras.", notes: "Se reemplazó la unidad de imagen; impresión de prueba limpia." },
    { title: "No imprime desde la red", description: "Aparece en cola pero no imprime.", notes: "Se reconfiguró la IP fija y se actualizó el firmware." },
    { title: "Error de fusor", description: "La pantalla muestra error de unidad fusora.", notes: "Unidad fusora reemplazada por el proveedor autorizado." },
  ],
  network: [
    { title: "Caída intermitente de la red", description: "Los equipos del piso pierden conexión varias veces al día.", notes: "Se reemplazó el módulo de alimentación y se actualizó el firmware." },
    { title: "Puerto sin enlace", description: "Varios puertos no levantan enlace.", notes: "Se reemplazaron los patch cords dañados." },
  ],
  server: [
    { title: "Alerta de disco degradado", description: "El RAID reporta un disco degradado.", notes: "Disco reemplazado; reconstrucción del RAID completada." },
  ],
  phone: [
    { title: "Sin tono", description: "El teléfono no registra en la central.", notes: "Se restableció la cuenta SIP y se cambió el cable de red." },
  ],
  ups: [
    { title: "Alarma de batería", description: "La UPS emite alarma de reemplazo de batería.", notes: "Banco de baterías reemplazado; autonomía verificada." },
  ],
  air_conditioner: [
    { title: "No enfría", description: "El equipo enciende pero sale aire caliente.", notes: "Recarga de gas refrigerante y limpieza de condensadora." },
    { title: "Gotea agua", description: "Cae agua de la unidad interior.", notes: "Se destapó la línea de drenaje y se limpió la bandeja." },
    { title: "Ruido fuerte en la unidad exterior", description: "La condensadora hace un ruido metálico.", notes: "Se reemplazó el capacitor del ventilador." },
  ],
  generator: [
    { title: "No arranca en la prueba semanal", description: "La planta no arrancó en la prueba programada.", notes: "Batería de arranque reemplazada; arranque automático verificado." },
  ],
  electrical: [
    { title: "Breaker que se dispara", description: "El circuito de las oficinas se corta varias veces al día.", notes: "Se redistribuyó la carga y se reemplazó el breaker." },
  ],
  plumbing: [
    { title: "La bomba no levanta presión", description: "No llega agua al segundo piso.", notes: "Se reemplazó el sello mecánico de la bomba." },
    { title: "Fuga en la tubería de succión", description: "Hay agua acumulada junto a la cisterna.", notes: "Tramo de tubería reemplazado." },
  ],
  appliance: [
    { title: "No enfría", description: "La comida se descompone en el refrigerador.", notes: "Termostato reemplazado." },
    { title: "No calienta", description: "El equipo enciende pero no calienta.", notes: "Se reemplazó el fusible interno." },
  ],
  furniture: [
    { title: "Motor que no responde", description: "El mecanismo eléctrico no se mueve.", notes: "Motor y control reemplazados." },
  ],
  vehicle: [
    { title: "Testigo de motor encendido", description: "Se encendió el testigo de check engine.", notes: "Sensor de oxígeno reemplazado en taller externo." },
    { title: "Frenos con ruido", description: "Chirrido fuerte al frenar.", notes: "Pastillas de freno reemplazadas." },
  ],
};

export interface PartTemplate {
  name: string;
  areaName: string;
  unit: PartUnit;
  /** Costo de compra inicial, en centavos. */
  cost: number;
  minStock: number;
  /** Existencias al final de la semilla. Por debajo de `minStock` = bajo mínimo. */
  finalStock: number;
  /** Tipos de equipo en los que se usa. */
  fits: AssetType[];
}

export const PARTS: PartTemplate[] = [
  // ── IT ──
  { name: "Cargador USB-C 65 W", areaName: IT_AREA, unit: "unit", cost: 3_900, minStock: 3, finalStock: 6, fits: ["laptop"] },
  { name: "Batería para laptop", areaName: IT_AREA, unit: "unit", cost: 8_900, minStock: 2, finalStock: 4, fits: ["laptop"] },
  { name: "Teclado de reemplazo para laptop", areaName: IT_AREA, unit: "unit", cost: 5_500, minStock: 2, finalStock: 3, fits: ["laptop"] },
  { name: "SSD NVMe 512 GB", areaName: IT_AREA, unit: "unit", cost: 4_900, minStock: 3, finalStock: 5, fits: ["laptop", "desktop", "server"] },
  { name: "Memoria RAM DDR4 16 GB", areaName: IT_AREA, unit: "unit", cost: 4_200, minStock: 2, finalStock: 5, fits: ["laptop", "desktop"] },
  { name: "Fuente de poder ATX 500 W", areaName: IT_AREA, unit: "unit", cost: 5_900, minStock: 1, finalStock: 2, fits: ["desktop"] },
  { name: "Cable DisplayPort 2 m", areaName: IT_AREA, unit: "unit", cost: 1_200, minStock: 4, finalStock: 9, fits: ["monitor"] },
  { name: "Tóner HP 58A", areaName: IT_AREA, unit: "unit", cost: 11_500, minStock: 4, finalStock: 1, fits: ["printer"] },
  { name: "Tóner Canon NPG-59", areaName: IT_AREA, unit: "unit", cost: 4_800, minStock: 3, finalStock: 4, fits: ["printer"] },
  { name: "Kit de rodillos de alimentación", areaName: IT_AREA, unit: "kit", cost: 3_500, minStock: 2, finalStock: 3, fits: ["printer"] },
  { name: "Unidad de imagen", areaName: IT_AREA, unit: "unit", cost: 9_800, minStock: 1, finalStock: 2, fits: ["printer"] },
  { name: "Patch cord Cat 6 · 1 m", areaName: IT_AREA, unit: "unit", cost: 350, minStock: 20, finalStock: 34, fits: ["network", "phone"] },
  { name: "Disco duro SAS 2 TB", areaName: IT_AREA, unit: "unit", cost: 21_000, minStock: 1, finalStock: 1, fits: ["server"] },
  { name: "Batería de UPS RBC7", areaName: IT_AREA, unit: "unit", cost: 23_000, minStock: 1, finalStock: 2, fits: ["ups"] },

  // ── Mantenimiento ──
  { name: "Filtro de aire acondicionado", areaName: MAINT_AREA, unit: "unit", cost: 1_500, minStock: 6, finalStock: 2, fits: ["air_conditioner"] },
  { name: "Gas refrigerante R410A", areaName: MAINT_AREA, unit: "kit", cost: 7_500, minStock: 2, finalStock: 3, fits: ["air_conditioner"] },
  { name: "Capacitor de ventilador 35 µF", areaName: MAINT_AREA, unit: "unit", cost: 1_800, minStock: 3, finalStock: 5, fits: ["air_conditioner"] },
  { name: "Aceite de motor 15W-40", areaName: MAINT_AREA, unit: "liter", cost: 900, minStock: 10, finalStock: 18, fits: ["generator", "vehicle"] },
  { name: "Filtro de aceite", areaName: MAINT_AREA, unit: "unit", cost: 1_400, minStock: 3, finalStock: 5, fits: ["generator", "vehicle"] },
  { name: "Batería de arranque 12 V", areaName: MAINT_AREA, unit: "unit", cost: 13_500, minStock: 1, finalStock: 1, fits: ["generator", "vehicle"] },
  { name: "Pastillas de freno", areaName: MAINT_AREA, unit: "kit", cost: 6_500, minStock: 1, finalStock: 2, fits: ["vehicle"] },
  { name: "Sello mecánico para bomba", areaName: MAINT_AREA, unit: "unit", cost: 3_200, minStock: 1, finalStock: 2, fits: ["plumbing"] },
  { name: "Tubo PVC 1\" · 3 m", areaName: MAINT_AREA, unit: "unit", cost: 650, minStock: 4, finalStock: 7, fits: ["plumbing"] },
  { name: "Breaker 1 polo 20 A", areaName: MAINT_AREA, unit: "unit", cost: 1_100, minStock: 4, finalStock: 6, fits: ["electrical"] },
  { name: "Termostato universal", areaName: MAINT_AREA, unit: "unit", cost: 2_400, minStock: 1, finalStock: 2, fits: ["appliance"] },
];

export interface PlanTemplate {
  title: string;
  areaName: string;
  /** Plan de un activo concreto (por nombre)… */
  assetName?: string;
  /** …o de todos los de un tipo en el área. */
  assetType?: AssetType;
  every: number;
  unit: PlanUnit;
  mode: PlanMode;
  leadDays: number;
  checklist: string[];
  /** Repuestos que suele gastar cada visita, por nombre. */
  parts?: { name: string; qty: number }[];
  /** El plan vencido de la demo: su última OT sigue pendiente pasada la fecha. */
  overdue?: boolean;
}

export const PLANS: PlanTemplate[] = [
  {
    title: "Limpieza de aires acondicionados",
    areaName: MAINT_AREA,
    assetType: "air_conditioner",
    every: 3,
    unit: "month",
    mode: "fixed",
    leadDays: 7,
    checklist: ["Lavar filtros", "Limpiar serpentín evaporador", "Revisar drenaje", "Medir temperatura de salida"],
    parts: [{ name: "Filtro de aire acondicionado", qty: 1 }],
  },
  {
    title: "Mantenimiento de impresoras",
    areaName: IT_AREA,
    assetType: "printer",
    every: 6,
    unit: "month",
    mode: "from_last",
    leadDays: 7,
    checklist: ["Limpiar rodillos", "Aspirar polvo de tóner", "Actualizar firmware", "Imprimir página de prueba"],
  },
  {
    title: "Prueba de carga de la planta eléctrica",
    areaName: MAINT_AREA,
    assetName: "Planta eléctrica",
    every: 1,
    unit: "month",
    mode: "fixed",
    leadDays: 3,
    checklist: ["Revisar nivel de aceite y refrigerante", "Arranque y 30 min con carga", "Revisar batería de arranque"],
  },
  {
    title: "Cambio de aceite de la planta eléctrica",
    areaName: MAINT_AREA,
    assetName: "Planta eléctrica",
    every: 6,
    unit: "month",
    mode: "from_last",
    leadDays: 7,
    checklist: ["Cambiar aceite", "Cambiar filtro de aceite", "Registrar horas de motor"],
    parts: [
      { name: "Aceite de motor 15W-40", qty: 8 },
      { name: "Filtro de aceite", qty: 1 },
    ],
  },
  {
    title: "Revisión de baterías de UPS",
    areaName: IT_AREA,
    assetType: "ups",
    every: 6,
    unit: "month",
    mode: "fixed",
    leadDays: 7,
    checklist: ["Prueba de autonomía", "Revisar temperatura", "Registrar estado de baterías"],
  },
  {
    title: "Mantenimiento del servidor de archivos",
    areaName: IT_AREA,
    assetName: "Servidor de archivos",
    every: 3,
    unit: "month",
    mode: "from_last",
    leadDays: 7,
    checklist: ["Revisar estado del RAID", "Aplicar actualizaciones", "Limpiar filtros de aire", "Verificar respaldo"],
  },
  {
    title: "Servicio de la camioneta de reparto",
    areaName: MAINT_AREA,
    assetName: "Camioneta de reparto",
    every: 3,
    unit: "month",
    mode: "from_last",
    leadDays: 7,
    checklist: ["Cambio de aceite", "Revisar frenos", "Presión de llantas", "Niveles de fluidos"],
    parts: [
      { name: "Aceite de motor 15W-40", qty: 6 },
      { name: "Filtro de aceite", qty: 1 },
    ],
  },
  {
    title: "Revisión de la bomba de agua",
    areaName: MAINT_AREA,
    assetName: "Bomba de agua",
    every: 2,
    unit: "month",
    mode: "fixed",
    leadDays: 5,
    checklist: ["Revisar presión de salida", "Revisar sello y fugas", "Limpiar filtro de succión"],
    overdue: true,
  },
];
