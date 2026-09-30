import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AvailabilityLog, Notification } from "../models/support.models";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { connect, disconnect, resetDatabase, seedTicket, type Fixture } from "../test/fixtures";
import { runAvailabilityReturn } from "./availability.job";
import { runLifecycleJobs } from "./lifecycle.job";
import { runSlaWatch } from "./sla.job";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

const DIA = 24 * 60 * 60 * 1000;

describe("vigilancia del SLA", () => {
  it("un ticket viejo pasa a vencido y avisa a quien lo atiende", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
      // Medio plazo de resolución son 24 h laborables; diez días atrás lo vencen.
      createdAt: new Date(Date.now() - 10 * DIA),
    });

    const resultado = await runSlaWatch();
    expect(resultado.breached).toBe(1);

    const actualizado = await Ticket.findById(ticket._id).lean();
    expect(actualizado!.sla!.resolutionBreached).toBe(true);
    expect(actualizado!.sla!.breachNotifiedAt).toBeTruthy();

    const avisos = await Notification.find({ type: "sla_breached" }).lean();
    // Su responsable y la supervisora del área, nadie más.
    expect(new Set(avisos.map((aviso) => String(aviso.userId)))).toEqual(
      new Set([String(fixture.users.agentIt.id), String(fixture.users.supIt.id)]),
    );
  });

  it("no repite el aviso en cada vuelta", async () => {
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
      createdAt: new Date(Date.now() - 10 * DIA),
    });

    await runSlaWatch();
    const segunda = await runSlaWatch();

    expect(segunda.breached).toBe(0);
    expect(await Notification.countDocuments({ type: "sla_breached" })).toBe(2);
  });

  it("un ticket recién creado no molesta a nadie", async () => {
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
      priority: "low",
    });

    const resultado = await runSlaWatch();
    expect(resultado.atRisk).toBe(0);
    expect(resultado.breached).toBe(0);
    expect(await Notification.countDocuments()).toBe(0);
  });

  it("un ticket cerrado ya no consume SLA", async () => {
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      status: "closed",
      createdAt: new Date(Date.now() - 30 * DIA),
    });

    const resultado = await runSlaWatch();
    expect(resultado.scanned).toBe(0);
  });
});

describe("cierres automáticos", () => {
  it("cierra solo un ticket resuelto tras los días hábiles configurados", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "resolved",
      createdAt: new Date(Date.now() - 20 * DIA),
    });
    // Resuelto hace dos semanas: sobran los 3 días hábiles por defecto.
    await Ticket.updateOne(
      { _id: ticket._id },
      { $set: { "sla.resolvedAt": new Date(Date.now() - 14 * DIA) } },
    );

    const resultado = await runLifecycleJobs();
    expect(resultado.closedResolved).toBe(1);

    const cerrado = await Ticket.findById(ticket._id).lean();
    expect(cerrado!.status).toBe("closed");
    expect(cerrado!.statusHistory!.at(-1)!.status).toBe("closed");
    expect(await Notification.countDocuments({ type: "ticket_auto_closed" })).toBe(1);
  });

  it("no cierra el que acaba de resolverse", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "resolved",
    });
    await Ticket.updateOne({ _id: ticket._id }, { $set: { "sla.resolvedAt": new Date() } });

    const resultado = await runLifecycleJobs();
    expect(resultado.closedResolved).toBe(0);
  });

  it("recuerda al solicitante a los 5 días en espera y cierra a los 10", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "on_hold",
      createdAt: new Date(Date.now() - 20 * DIA),
    });

    // Una semana natural da de sobra para los 5 días hábiles del recordatorio,
    // pero no llega a los 10 del cierre.
    await Ticket.updateOne(
      { _id: ticket._id },
      { $set: { "sla.onHoldSince": new Date(Date.now() - 9 * DIA) } },
    );
    const primera = await runLifecycleJobs();
    expect(primera.remindedOnHold).toBe(1);
    expect(primera.closedOnHold).toBe(0);
    expect((await Ticket.findById(ticket._id).lean())!.status).toBe("on_hold");

    // El recordatorio no se repite.
    expect((await runLifecycleJobs()).remindedOnHold).toBe(0);

    await Ticket.updateOne(
      { _id: ticket._id },
      { $set: { "sla.onHoldSince": new Date(Date.now() - 20 * DIA) } },
    );
    const segunda = await runLifecycleJobs();
    expect(segunda.closedOnHold).toBe(1);
    expect((await Ticket.findById(ticket._id).lean())!.status).toBe("closed");
  });
});

describe("regreso de una ausencia", () => {
  it("devuelve a Disponible a quien ya cumplió su fecha de regreso", async () => {
    await User.updateOne(
      { _id: fixture.users.agentIt.id },
      {
        $set: {
          availability: {
            state: "away",
            reason: "vacation",
            awayUntil: new Date(Date.now() - DIA),
          },
        },
      },
    );

    expect(await runAvailabilityReturn()).toBe(1);

    const vuelto = await User.findById(fixture.users.agentIt.id).lean();
    expect(vuelto!.availability!.state).toBe("available");
    // El tramo queda registrado: alimenta la medida "Días de ausencia" (spec §11).
    expect(await AvailabilityLog.countDocuments({ userId: fixture.users.agentIt.id })).toBe(1);
  });

  it("no toca a quien sigue ausente", async () => {
    await User.updateOne(
      { _id: fixture.users.agentIt.id },
      { $set: { availability: { state: "away", awayUntil: new Date(Date.now() + 5 * DIA) } } },
    );

    expect(await runAvailabilityReturn()).toBe(0);
    const sigue = await User.findById(fixture.users.agentIt.id).lean();
    expect(sigue!.availability!.state).toBe("away");
  });
});
