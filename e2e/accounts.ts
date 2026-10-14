/** Cuentas de la semilla (`apps/api/src/seed/catalog.ts`); todas comparten contraseña. */
export const DEMO_PASSWORD = "Tekzaya2026!";

export const ACCOUNTS = {
  /** Administradora, área IT y Sistemas. */
  admin: { email: "arisleyda.tejada@tekzaya.com", name: "Arisleyda Tejada" },
  /** Supervisor del área IT y Sistemas. */
  supervisor: { email: "daury.guzman@tekzaya.com", name: "Daury Guzman" },
  /** Supervisora de RRHH con lectura global. */
  rrhh: { email: "elena.paredes@tekzaya.com", name: "Elena Paredes" },
  /** Empleado de Ventas: pide ayuda a IT desde fuera del área. */
  employee: { email: "diego.castillo@tekzaya.com", name: "Diego Castillo" },
} as const;

export type Role = keyof typeof ACCOUNTS;

export const storageStateOf = (role: Role) => `e2e/.auth/${role}.json`;
