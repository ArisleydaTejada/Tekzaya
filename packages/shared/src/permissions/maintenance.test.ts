import { describe, expect, it } from "vitest";
import {
  assetScopeFor,
  canAssignWorkOrder,
  canCreateWorkOrder,
  canLinkAssetToTicket,
  canLinkAssetsOnTicket,
  canManageAsset,
  canManageMaintenancePlans,
  canManageMaintenanceSettings,
  canManageStock,
  canTakeWorkOrder,
  canViewAsset,
  canViewAssetDetails,
  canViewMaintenancePlans,
  canViewSpareParts,
  canViewWorkOrder,
  canWorkOnWorkOrder,
  type AssetRef,
  type WorkOrderRef,
} from "./maintenance";
import type { Actor, TicketRef } from "./permissions";

/**
 * Una prueba por fila de la matriz del plan §3. Los personajes son los mismos en
 * todas: la impresora de Ventas la mantiene IT, y la laptop de Diego (Ventas)
 * también.
 */
const IT = "area-it";
const VENTAS = "area-ventas";
const RRHH = "area-rrhh";
const MANT = "area-mant";

const base = { role: "employee" as const, isAreaSupervisor: false, hasGlobalReadAccess: false };
const empleadoVentas: Actor = { ...base, id: "u-diego", areaId: VENTAS };
const otroDeVentas: Actor = { ...base, id: "u-otro-ventas", areaId: VENTAS };
const empleadoMarketing: Actor = { ...base, id: "u-mkt", areaId: "area-mkt" };
const tecnicoIT: Actor = { ...base, id: "u-tecnico-it", areaId: IT };
const otroTecnicoIT: Actor = { ...base, id: "u-otro-tecnico-it", areaId: IT };
const supervisorIT: Actor = { ...base, id: "u-sup-it", areaId: IT, isAreaSupervisor: true };
const supervisorMant: Actor = { ...base, id: "u-sup-mant", areaId: MANT, isAreaSupervisor: true };
const rrhh: Actor = { ...base, id: "u-rrhh", areaId: RRHH, isAreaSupervisor: true, hasGlobalReadAccess: true };
const admin: Actor = { ...base, id: "u-admin", areaId: IT, role: "admin" };

/** Laptop de Diego: la usa Ventas, la tiene él, la mantiene IT. */
const laptopDiego: AssetRef = { areaId: IT, usedByAreaId: VENTAS, custodianId: empleadoVentas.id };
/** Impresora de Ventas, sin persona a cargo. */
const impresoraVentas: AssetRef = { areaId: IT, usedByAreaId: VENTAS };
/** Aire acondicionado de la sala de juntas: lo mantiene Mantenimiento. */
const aireSala: AssetRef = { areaId: MANT, usedByAreaId: "area-mkt" };

const ticketDeDiego: TicketRef = {
  areaId: IT,
  requesterId: empleadoVentas.id,
  createdById: empleadoVentas.id,
  assigneeIds: [tecnicoIT.id],
  status: "in_progress",
};
const ticketDeOtro: TicketRef = { ...ticketDeDiego, requesterId: otroDeVentas.id, createdById: otroDeVentas.id };
const ticketDeMant: TicketRef = { ...ticketDeOtro, areaId: MANT, assigneeIds: [] };

const ordenIT: WorkOrderRef = { areaId: IT, assigneeIds: [tecnicoIT.id] };

describe("ver los activos que tiene a su cargo o que usa su área", () => {
  it("el empleado ve su laptop y la impresora de su área, no lo de otras áreas", () => {
    expect(canViewAsset(empleadoVentas, laptopDiego)).toBe(true);
    expect(canViewAsset(otroDeVentas, impresoraVentas)).toBe(true);
    expect(canViewAsset(empleadoVentas, aireSala)).toBe(false);
    expect(canViewAsset(empleadoMarketing, laptopDiego)).toBe(false);
  });

  it("técnico, supervisor, RRHH y admin también", () => {
    for (const actor of [tecnicoIT, supervisorIT, rrhh, admin]) {
      expect(canViewAsset(actor, laptopDiego)).toBe(true);
    }
  });
});

describe("ver inventario completo del área, historial y costos", () => {
  it("el empleado no, aunque el equipo sea suyo", () => {
    expect(canViewAssetDetails(empleadoVentas, laptopDiego)).toBe(false);
  });

  it("el área responsable, RRHH y el admin sí", () => {
    for (const actor of [tecnicoIT, supervisorIT, rrhh, admin]) {
      expect(canViewAssetDetails(actor, laptopDiego)).toBe(true);
    }
  });

  it("el técnico de otra área no ve los costos de un equipo que no mantiene", () => {
    expect(canViewAssetDetails(tecnicoIT, aireSala)).toBe(false);
  });

  it("el alcance de una lista lo decide la sesión: global solo para RRHH y admin", () => {
    expect(assetScopeFor(admin)).toEqual({ type: "global" });
    expect(assetScopeFor(rrhh)).toEqual({ type: "global" });
    expect(assetScopeFor(supervisorIT)).toEqual({ type: "limited", areaId: IT, userId: supervisorIT.id });
    expect(assetScopeFor(empleadoVentas)).toEqual({
      type: "limited",
      areaId: VENTAS,
      userId: empleadoVentas.id,
    });
  });
});

describe("crear, editar, mover, dar de baja un activo", () => {
  it("solo el supervisor del área responsable y el admin", () => {
    expect(canManageAsset(supervisorIT, laptopDiego)).toBe(true);
    expect(canManageAsset(admin, aireSala)).toBe(true);
    expect(canManageAsset(tecnicoIT, laptopDiego)).toBe(false);
    expect(canManageAsset(empleadoVentas, laptopDiego)).toBe(false);
    expect(canManageAsset(rrhh, laptopDiego)).toBe(false);
    expect(canManageAsset(supervisorMant, laptopDiego)).toBe(false);
  });
});

describe("vincular un activo a un ticket", () => {
  it("el empleado, al crear el suyo y con un equipo que usa", () => {
    expect(canLinkAssetToTicket(empleadoVentas, laptopDiego, ticketDeDiego)).toBe(true);
    expect(canLinkAssetToTicket(empleadoVentas, impresoraVentas, ticketDeDiego)).toBe(true);
    // Ni en el ticket de otro ni con un equipo que no usa.
    expect(canLinkAssetToTicket(empleadoVentas, laptopDiego, ticketDeOtro)).toBe(false);
    expect(canLinkAssetToTicket(empleadoVentas, aireSala, ticketDeDiego)).toBe(false);
  });

  it("técnico y supervisor, con equipos de su área en tickets que atienden", () => {
    expect(canLinkAssetToTicket(tecnicoIT, impresoraVentas, ticketDeOtro)).toBe(true);
    expect(canLinkAssetToTicket(supervisorIT, laptopDiego, ticketDeOtro)).toBe(true);
    expect(canLinkAssetToTicket(tecnicoIT, impresoraVentas, ticketDeMant)).toBe(false);
  });

  it("RRHH no: leer no es actuar", () => {
    expect(canLinkAssetToTicket(rrhh, laptopDiego, ticketDeDiego)).toBe(false);
  });

  it("el admin sí", () => {
    expect(canLinkAssetToTicket(admin, aireSala, ticketDeMant)).toBe(true);
  });
});

describe("ofrecer el selector de equipos en un ticket", () => {
  it("al solicitante, al área que lo atiende y al admin", () => {
    expect(canLinkAssetsOnTicket(empleadoVentas, ticketDeDiego)).toBe(true);
    expect(canLinkAssetsOnTicket(tecnicoIT, ticketDeOtro)).toBe(true);
    expect(canLinkAssetsOnTicket(admin, ticketDeMant)).toBe(true);
  });

  it("no a otro empleado, ni a otra área, ni a RRHH", () => {
    expect(canLinkAssetsOnTicket(empleadoVentas, ticketDeOtro)).toBe(false);
    expect(canLinkAssetsOnTicket(tecnicoIT, ticketDeMant)).toBe(false);
    expect(canLinkAssetsOnTicket(rrhh, ticketDeDiego)).toBe(false);
  });
});

describe("convertir un ticket en OT", () => {
  it("técnico, supervisor y admin del área responsable; nadie más", () => {
    expect(canCreateWorkOrder(tecnicoIT, laptopDiego)).toBe(true);
    expect(canCreateWorkOrder(supervisorIT, laptopDiego)).toBe(true);
    expect(canCreateWorkOrder(admin, aireSala)).toBe(true);
    expect(canCreateWorkOrder(empleadoVentas, laptopDiego)).toBe(false);
    expect(canCreateWorkOrder(rrhh, laptopDiego)).toBe(false);
    expect(canCreateWorkOrder(tecnicoIT, aireSala)).toBe(false);
  });
});

describe("tomar una OT, registrar horas y repuestos", () => {
  it("cualquier técnico del área la toma", () => {
    expect(canTakeWorkOrder(otroTecnicoIT, ordenIT)).toBe(true);
    expect(canTakeWorkOrder(supervisorIT, ordenIT)).toBe(true);
    expect(canTakeWorkOrder(admin, ordenIT)).toBe(true);
    expect(canTakeWorkOrder(empleadoVentas, ordenIT)).toBe(false);
    expect(canTakeWorkOrder(rrhh, ordenIT)).toBe(false);
  });

  it("carga horas y repuestos quien la atiende o su supervisor", () => {
    expect(canWorkOnWorkOrder(tecnicoIT, ordenIT)).toBe(true);
    expect(canWorkOnWorkOrder(supervisorIT, ordenIT)).toBe(true);
    expect(canWorkOnWorkOrder(admin, ordenIT)).toBe(true);
    expect(canWorkOnWorkOrder(otroTecnicoIT, ordenIT)).toBe(false);
    expect(canWorkOnWorkOrder(rrhh, ordenIT)).toBe(false);
  });

  it("verla: el área, RRHH y el admin; el empleado no", () => {
    expect(canViewWorkOrder(otroTecnicoIT, ordenIT)).toBe(true);
    expect(canViewWorkOrder(rrhh, ordenIT)).toBe(true);
    expect(canViewWorkOrder(empleadoVentas, ordenIT)).toBe(false);
  });
});

describe("asignar OT a otros", () => {
  it("solo el supervisor del área y el admin", () => {
    expect(canAssignWorkOrder(supervisorIT, ordenIT)).toBe(true);
    expect(canAssignWorkOrder(admin, ordenIT)).toBe(true);
    expect(canAssignWorkOrder(tecnicoIT, ordenIT)).toBe(false);
    expect(canAssignWorkOrder(rrhh, ordenIT)).toBe(false);
    expect(canAssignWorkOrder(supervisorMant, ordenIT)).toBe(false);
  });
});

describe("gestionar planes preventivos", () => {
  it("solo el supervisor del área y el admin", () => {
    expect(canManageMaintenancePlans(supervisorMant, MANT)).toBe(true);
    expect(canManageMaintenancePlans(admin, MANT)).toBe(true);
    expect(canManageMaintenancePlans(supervisorIT, MANT)).toBe(false);
    expect(canManageMaintenancePlans(tecnicoIT, IT)).toBe(false);
    expect(canManageMaintenancePlans(rrhh, MANT)).toBe(false);
  });
});

describe("ver planes y calendario de preventivos", () => {
  it("el área que mantiene los equipos, RRHH y el admin", () => {
    expect(canViewMaintenancePlans(tecnicoIT, IT)).toBe(true);
    expect(canViewMaintenancePlans(rrhh, MANT)).toBe(true);
    expect(canViewMaintenancePlans(admin, MANT)).toBe(true);
    expect(canViewMaintenancePlans(tecnicoIT, MANT)).toBe(false);
    expect(canViewMaintenancePlans(supervisorMant, IT)).toBe(false);
    expect(canViewMaintenancePlans(empleadoVentas, IT)).toBe(false);
  });
});

describe("entradas y ajustes de stock", () => {
  it("solo el supervisor del área y el admin", () => {
    expect(canManageStock(supervisorIT, IT)).toBe(true);
    expect(canManageStock(admin, MANT)).toBe(true);
    expect(canManageStock(tecnicoIT, IT)).toBe(false);
    expect(canManageStock(rrhh, IT)).toBe(false);
    expect(canManageStock(supervisorMant, IT)).toBe(false);
  });

  it("ver el almacén: el área, RRHH y el admin; nadie de fuera", () => {
    expect(canViewSpareParts(tecnicoIT, IT)).toBe(true);
    expect(canViewSpareParts(rrhh, IT)).toBe(true);
    expect(canViewSpareParts(empleadoVentas, IT)).toBe(false);
    expect(canViewSpareParts(tecnicoIT, MANT)).toBe(false);
  });
});

describe("tarifas, moneda y umbrales", () => {
  it("solo el admin", () => {
    expect(canManageMaintenanceSettings(admin)).toBe(true);
    for (const actor of [empleadoVentas, tecnicoIT, supervisorIT, rrhh]) {
      expect(canManageMaintenanceSettings(actor)).toBe(false);
    }
  });
});
