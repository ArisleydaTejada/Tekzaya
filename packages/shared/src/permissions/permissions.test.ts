import { describe, expect, it } from "vitest";
import {
  canCancel,
  canChangeCategory,
  canChangePriority,
  canChangeStatus,
  canCreateOnBehalfOf,
  canManageAssignees,
  canManageSystem,
  canMerge,
  canRequestJoin,
  canReadInternalNotes,
  canReplyPublicly,
  canSelfAssign,
  canSetAvailabilityOf,
  canTransfer,
  canUnmerge,
  canViewTicket,
  canWriteInternalNote,
  isScopeAllowed,
  maxReportScope,
  type Actor,
  type TicketRef,
} from "./permissions";

const IT = "area-it";
const RRHH = "area-rrhh";
const VENTAS = "area-ventas";

const empleadoIT: Actor = {
  id: "u-empleado-it",
  areaId: IT,
  role: "employee",
  isAreaSupervisor: false,
  hasGlobalReadAccess: false,
};
const otroEmpleadoIT: Actor = { ...empleadoIT, id: "u-otro-it" };
const supervisorIT: Actor = { ...empleadoIT, id: "u-sup-it", isAreaSupervisor: true };
const empleadoVentas: Actor = { ...empleadoIT, id: "u-empleado-ventas", areaId: VENTAS };
const supervisorRRHH: Actor = {
  id: "u-sup-rrhh",
  areaId: RRHH,
  role: "employee",
  isAreaSupervisor: true,
  hasGlobalReadAccess: true,
};
const admin: Actor = {
  id: "u-admin",
  areaId: IT,
  role: "admin",
  isAreaSupervisor: false,
  hasGlobalReadAccess: false,
};

/** Ticket de Ventas dirigido a IT, atendido por `empleadoIT`. */
const ticketIT: TicketRef = {
  areaId: IT,
  requesterId: empleadoVentas.id,
  createdById: empleadoVentas.id,
  assigneeIds: [empleadoIT.id],
  status: "in_progress",
};

const ticketITSinAsignar: TicketRef = { ...ticketIT, assigneeIds: [] };

/** Caso límite: alguien de IT pide ayuda a su propia área. Actúa como solicitante. */
const ticketPropioEnSuArea: TicketRef = {
  areaId: IT,
  requesterId: empleadoIT.id,
  createdById: empleadoIT.id,
  assigneeIds: [otroEmpleadoIT.id],
  status: "in_progress",
};

const ticketRRHH: TicketRef = {
  areaId: RRHH,
  requesterId: empleadoVentas.id,
  createdById: empleadoVentas.id,
  assigneeIds: [],
  status: "open",
};

describe("§4.3 · Ver y responder sus propios tickets", () => {
  it("el solicitante ve y responde su ticket aunque sea de otra área", () => {
    expect(canViewTicket(empleadoVentas, ticketIT)).toBe(true);
    expect(canReplyPublicly(empleadoVentas, ticketIT)).toBe(true);
  });
});

describe("§4.3 · Ver los tickets dirigidos a su área", () => {
  it("cualquier miembro del área destino lo ve, sea responsable o no", () => {
    expect(canViewTicket(otroEmpleadoIT, ticketIT)).toBe(true);
    expect(canViewTicket(empleadoIT, ticketIT)).toBe(true);
  });

  it("alguien ajeno al área y al ticket no lo ve", () => {
    const ajeno: Actor = { ...empleadoIT, id: "u-ajeno", areaId: VENTAS };
    expect(canViewTicket(ajeno, ticketRRHH)).toBe(false);
  });

  it("el supervisor de RRHH no ve los tickets de otras áreas", () => {
    expect(canViewTicket(supervisorRRHH, ticketIT)).toBe(false);
  });

  it("el admin ve todos", () => {
    expect(canViewTicket(admin, ticketRRHH)).toBe(true);
  });
});

describe("§4.3 · Leer la conversación completa (notas internas)", () => {
  it("un compañero del área las lee aunque no sea responsable", () => {
    expect(canReadInternalNotes(otroEmpleadoIT, ticketIT)).toBe(true);
  });

  it("el solicitante NUNCA las ve, ni siendo del área destino", () => {
    // Regla de privacidad del spec §4.3: la fuga de notas internas es riesgo alto.
    expect(canReadInternalNotes(empleadoIT, ticketPropioEnSuArea)).toBe(false);
    expect(canReadInternalNotes(empleadoVentas, ticketIT)).toBe(false);
  });

  it("tampoco las ve el admin cuando el ticket es suyo", () => {
    const ticketDelAdmin: TicketRef = { ...ticketIT, requesterId: admin.id, createdById: admin.id };
    expect(canReadInternalNotes(admin, ticketDelAdmin)).toBe(false);
    expect(canReadInternalNotes(admin, ticketIT)).toBe(true);
  });

  it("quien no es del área no las ve", () => {
    expect(canReadInternalNotes(supervisorRRHH, ticketIT)).toBe(false);
  });
});

describe("§4.3 · Responder públicamente al solicitante", () => {
  it("el empleado solo si es responsable", () => {
    expect(canReplyPublicly(empleadoIT, ticketIT)).toBe(true);
    expect(canReplyPublicly(otroEmpleadoIT, ticketIT)).toBe(false);
  });

  it("el supervisor del área siempre", () => {
    expect(canReplyPublicly(supervisorIT, ticketIT)).toBe(true);
  });

  it("el supervisor de RRHH no responde en otras áreas si no es responsable", () => {
    expect(canReplyPublicly(supervisorRRHH, ticketIT)).toBe(false);
  });
});

describe("§4.3 · Escribir notas internas", () => {
  it("cualquier miembro del área puede, aunque no sea responsable", () => {
    expect(canWriteInternalNote(otroEmpleadoIT, ticketIT)).toBe(true);
  });

  it("el solicitante no puede en su propio ticket", () => {
    expect(canWriteInternalNote(empleadoIT, ticketPropioEnSuArea)).toBe(false);
  });
});

describe("§4.3 · Autoasignarse un ticket de su área", () => {
  it("lo puede hacer un miembro del área", () => {
    expect(canSelfAssign(otroEmpleadoIT, ticketITSinAsignar)).toBe(true);
  });

  it("no lo puede hacer alguien de fuera", () => {
    expect(canSelfAssign(empleadoVentas, ticketITSinAsignar)).toBe(false);
  });
});

describe("§4.3 · Asignar, añadir o quitar responsables", () => {
  it("el empleado no puede", () => {
    expect(canManageAssignees(empleadoIT, ticketIT)).toBe(false);
  });

  it("el supervisor del área sí, y el de otra área no", () => {
    expect(canManageAssignees(supervisorIT, ticketIT)).toBe(true);
    expect(canManageAssignees(supervisorRRHH, ticketIT)).toBe(false);
  });

  it("el admin siempre", () => {
    expect(canManageAssignees(admin, ticketRRHH)).toBe(true);
  });
});

describe("§4.3 · Cambiar la prioridad sugerida por la IA", () => {
  it("solo supervisor del área o admin", () => {
    expect(canChangePriority(empleadoIT, ticketIT)).toBe(false);
    expect(canChangePriority(supervisorIT, ticketIT)).toBe(true);
    expect(canChangePriority(admin, ticketIT)).toBe(true);
    expect(canChangePriority(supervisorRRHH, ticketIT)).toBe(false);
  });
});

describe("§4.3 · Cambiar la categoría", () => {
  it("el solicitante puede mientras el ticket siga abierto", () => {
    expect(canChangeCategory(empleadoVentas, ticketIT)).toBe(true);
  });

  it("ya no puede si está resuelto, cerrado o cancelado", () => {
    for (const status of ["resolved", "closed", "cancelled"] as const) {
      expect(canChangeCategory(empleadoVentas, { ...ticketIT, status })).toBe(false);
      expect(canChangeCategory(supervisorIT, { ...ticketIT, status })).toBe(false);
    }
  });

  it("un empleado del área que no es el solicitante no puede", () => {
    expect(canChangeCategory(otroEmpleadoIT, ticketIT)).toBe(false);
  });
});

describe("§4.3 · Cambiar el estado", () => {
  it("puede el responsable y el supervisor, no un tercero", () => {
    expect(canChangeStatus(empleadoIT, ticketIT)).toBe(true);
    expect(canChangeStatus(supervisorIT, ticketIT)).toBe(true);
    expect(canChangeStatus(otroEmpleadoIT, ticketIT)).toBe(false);
  });
});

describe("§4.3 · Transferir a otra área", () => {
  it("puede el responsable o el supervisor del área", () => {
    expect(canTransfer(empleadoIT, ticketIT)).toBe(true);
    expect(canTransfer(supervisorIT, ticketIT)).toBe(true);
    expect(canTransfer(otroEmpleadoIT, ticketIT)).toBe(false);
  });
});

describe("§4.3 · Cancelar su propio ticket", () => {
  it("el solicitante puede si no está resuelto", () => {
    expect(canCancel(empleadoVentas, ticketIT)).toBe(true);
    expect(canCancel(empleadoVentas, { ...ticketIT, status: "resolved" })).toBe(false);
  });

  it("un tercero del área no puede", () => {
    expect(canCancel(otroEmpleadoIT, ticketIT)).toBe(false);
  });
});

describe("§4.3 · Fusionar duplicados", () => {
  const duplicado: TicketRef = { ...ticketIT, assigneeIds: [empleadoIT.id] };

  it("el empleado solo si es responsable de ambos", () => {
    expect(canMerge(empleadoIT, ticketIT, duplicado)).toBe(true);
    expect(canMerge(empleadoIT, ticketIT, { ...duplicado, assigneeIds: [] })).toBe(false);
  });

  it("el supervisor del área siempre, dentro de su área", () => {
    expect(canMerge(supervisorIT, ticketIT, duplicado)).toBe(true);
  });

  it("nunca entre áreas distintas", () => {
    expect(canMerge(admin, ticketIT, { ...duplicado, areaId: RRHH })).toBe(false);
  });
});

describe("§4.3 · Crear en nombre de otra persona", () => {
  it("el empleado solo para compañeros de su área", () => {
    expect(canCreateOnBehalfOf(empleadoIT, { id: "x", areaId: IT })).toBe(true);
    expect(canCreateOnBehalfOf(empleadoIT, { id: "x", areaId: VENTAS })).toBe(false);
  });

  it("el admin para cualquiera", () => {
    expect(canCreateOnBehalfOf(admin, { id: "x", areaId: VENTAS })).toBe(true);
  });
});

describe("§4.3 · Disponibilidad", () => {
  it("cualquiera puede marcarse a sí mismo", () => {
    expect(canSetAvailabilityOf(empleadoIT, { id: empleadoIT.id, areaId: IT })).toBe(true);
  });

  it("marcar a otro requiere ser su supervisor o admin", () => {
    expect(canSetAvailabilityOf(empleadoIT, { id: otroEmpleadoIT.id, areaId: IT })).toBe(false);
    expect(canSetAvailabilityOf(supervisorIT, { id: otroEmpleadoIT.id, areaId: IT })).toBe(true);
    expect(canSetAvailabilityOf(supervisorIT, { id: "x", areaId: VENTAS })).toBe(false);
    expect(canSetAvailabilityOf(admin, { id: "x", areaId: VENTAS })).toBe(true);
  });
});

describe("§4.3 · Gestionar usuarios, áreas, categorías y SLA", () => {
  it("solo el admin", () => {
    expect(canManageSystem(admin)).toBe(true);
    expect(canManageSystem(supervisorIT)).toBe(false);
    expect(canManageSystem(supervisorRRHH)).toBe(false);
    expect(canManageSystem(empleadoIT)).toBe(false);
  });
});

describe("§4.3 · Alcance de reportes", () => {
  it("el empleado solo sus propios datos", () => {
    expect(maxReportScope(empleadoIT)).toEqual({ type: "me", userId: empleadoIT.id });
  });

  it("el supervisor de área, su área", () => {
    expect(maxReportScope(supervisorIT)).toEqual({ type: "area", areaId: IT });
  });

  it("RRHH y admin, todas las áreas", () => {
    expect(maxReportScope(supervisorRRHH)).toEqual({ type: "global" });
    expect(maxReportScope(admin)).toEqual({ type: "global" });
  });

  it("rechaza que un empleado pida datos de otra persona o de un área", () => {
    // Es el ataque del spec §10.4: manipular el payload para ver de más.
    expect(isScopeAllowed(empleadoIT, { type: "me", userId: "otro" })).toBe(false);
    expect(isScopeAllowed(empleadoIT, { type: "area", areaId: IT })).toBe(false);
    expect(isScopeAllowed(empleadoIT, { type: "global" })).toBe(false);
    expect(isScopeAllowed(empleadoIT, { type: "me", userId: empleadoIT.id })).toBe(true);
  });

  it("rechaza que un supervisor pida otra área o el global", () => {
    expect(isScopeAllowed(supervisorIT, { type: "area", areaId: RRHH })).toBe(false);
    expect(isScopeAllowed(supervisorIT, { type: "global" })).toBe(false);
    expect(isScopeAllowed(supervisorIT, { type: "area", areaId: IT })).toBe(true);
  });
});

describe("§7.5.1 · Fusión de duplicados", () => {
  const principal: TicketRef = {
    areaId: IT,
    requesterId: empleadoVentas.id,
    createdById: empleadoVentas.id,
    assigneeIds: [empleadoIT.id],
    status: "in_progress",
  };

  it("el solicitante de un duplicado absorbido tampoco ve las notas internas", () => {
    // Llega al principal por la fusión, no por pertenecer al área: sigue siendo
    // un solicitante, y la trastienda del área no es para él.
    const conAbsorbidos: TicketRef = {
      ...principal,
      additionalRequesterIds: [otroEmpleadoIT.id],
    };

    expect(canViewTicket(otroEmpleadoIT, conAbsorbidos)).toBe(true);
    expect(canReadInternalNotes(otroEmpleadoIT, conAbsorbidos)).toBe(false);
    expect(canWriteInternalNote(otroEmpleadoIT, conAbsorbidos)).toBe(false);
    // Sin la fusión, ese mismo empleado del área sí las leería.
    expect(canReadInternalNotes(otroEmpleadoIT, principal)).toBe(true);
  });

  it("deshacer la fusión es solo del supervisor y del admin", () => {
    expect(canUnmerge(supervisorIT, principal)).toBe(true);
    expect(canUnmerge(admin, principal)).toBe(true);
    expect(canUnmerge(empleadoIT, principal)).toBe(false);
    expect(canUnmerge(supervisorRRHH, principal)).toBe(false);
  });
});

describe("§7.5 · Unirme", () => {
  const conResponsables: TicketRef = {
    areaId: IT,
    requesterId: empleadoVentas.id,
    createdById: empleadoVentas.id,
    assigneeIds: [empleadoIT.id],
    status: "in_progress",
  };
  const sinResponsables: TicketRef = { ...conResponsables, assigneeIds: [], status: "open" };

  it("lo pide quien es del área y no lo atiende", () => {
    expect(canRequestJoin(otroEmpleadoIT, conResponsables)).toBe(true);
  });

  it("no lo pide quien ya es responsable", () => {
    expect(canRequestJoin(empleadoIT, conResponsables)).toBe(false);
  });

  it("sin responsables no se pide unirse: se toma", () => {
    expect(canRequestJoin(otroEmpleadoIT, sinResponsables)).toBe(false);
    expect(canSelfAssign(otroEmpleadoIT, sinResponsables)).toBe(true);
  });

  it("no lo pide alguien de otra área ni el propio solicitante", () => {
    expect(canRequestJoin(empleadoVentas, conResponsables)).toBe(false);
  });
});
