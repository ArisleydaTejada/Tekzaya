import {
  computeTicketSla,
  DEFAULT_SETTINGS,
  type BusinessCalendar,
  type Priority,
  type TicketStatus,
} from "@tekzaya/shared";
import bcrypt from "bcryptjs";
import mongoose, { Types } from "mongoose";
import request from "supertest";
import { createApp } from "../app";
import { env } from "../config/env";
import { Area } from "../models/area.model";
import { Counter } from "../models/counter.model";
import { Message } from "../models/message.model";
import { Attachment, AvailabilityLog, Notification, Settings, SETTINGS_ID } from "../models/support.models";
import { Ticket } from "../models/ticket.model";
import { User } from "../models/user.model";
import { invalidateSettingsCache } from "../modules/settings/settings.service";

export const app = createApp();
export const PASSWORD = "Prueba1234!";

export interface Fixture {
  areas: { it: Types.ObjectId; ventas: Types.ObjectId };
  categories: { redes: Types.ObjectId };
  users: Record<
    "admin" | "supIt" | "agentIt" | "employeeIt" | "employeeVentas" | "supVentas" | "supRrhh",
    { id: Types.ObjectId; email: string }
  >;
}

export async function connect(): Promise<void> {
  if (mongoose.connection.readyState === 0) await mongoose.connect(env.MONGODB_URI);
}

export async function disconnect(): Promise<void> {
  await mongoose.disconnect();
}

export async function resetDatabase(): Promise<Fixture> {
  await Promise.all([
    Area.deleteMany({}),
    User.deleteMany({}),
    Ticket.deleteMany({}),
    Message.deleteMany({}),
    Attachment.deleteMany({}),
    Notification.deleteMany({}),
    AvailabilityLog.deleteMany({}),
    Settings.deleteMany({}),
    Counter.deleteMany({}),
  ]);
  invalidateSettingsCache();

  await Settings.create({ ...DEFAULT_SETTINGS, _id: SETTINGS_ID });

  const redes = new Types.ObjectId();
  const areas = { it: new Types.ObjectId(), ventas: new Types.ObjectId() };
  await Area.insertMany([
    {
      _id: areas.it,
      name: "IT y Sistemas",
      color: "#7c8cae",
      isActive: true,
      categories: [
        { _id: redes, name: "Redes y conectividad", isActive: true },
        { _id: new Types.ObjectId(), name: "Accesos y cuentas", isActive: true },
      ],
    },
    {
      _id: areas.ventas,
      name: "Ventas",
      color: "#5b9bb0",
      isActive: true,
      categories: [{ _id: new Types.ObjectId(), name: "Cotizaciones", isActive: true }],
    },
  ]);

  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const people = [
    { key: "admin", name: "Ana Admin", areaId: areas.it, role: "admin" as const },
    { key: "supIt", name: "Sonia Supervisora", areaId: areas.it, isAreaSupervisor: true },
    { key: "agentIt", name: "Aldo Agente", areaId: areas.it },
    // Empleado del área destino que además es SOLICITANTE: el caso que separa
    // "pertenecer al área" de "poder leer las notas internas de tu ticket".
    { key: "employeeIt", name: "Elsa Empleada", areaId: areas.it },
    { key: "employeeVentas", name: "Vito Ventas", areaId: areas.ventas },
    { key: "supVentas", name: "Vera Supervisora", areaId: areas.ventas, isAreaSupervisor: true },
    // Supervisor de RRHH: lectura global sin permisos de gestión (spec §4.2). Es el
    // rol que separa "ver los números de todas las áreas" de "abrir sus
    // conversaciones". Aquí no supervisa su área, para que añadirlo no cambie quién
    // recibe los avisos de Ventas en las pruebas de F4.
    {
      key: "supRrhh",
      name: "Rita Recursos",
      areaId: areas.ventas,
      hasGlobalReadAccess: true,
    },
  ];

  const users = {} as Fixture["users"];
  await User.insertMany(
    people.map((person) => {
      const id = new Types.ObjectId();
      const email = `${person.key.toLowerCase()}@tekzaya.test`;
      users[person.key as keyof Fixture["users"]] = { id, email };
      return {
        _id: id,
        name: person.name,
        email,
        passwordHash,
        areaId: person.areaId,
        role: person.role ?? "employee",
        isAreaSupervisor: person.isAreaSupervisor ?? false,
        hasGlobalReadAccess: person.hasGlobalReadAccess ?? false,
        status: "active",
        availability: { state: "available" },
      };
    }),
  );

  await Counter.create({ _id: "ticket", seq: 0 });

  return { areas, categories: { redes }, users };
}

/** Sesión iniciada lista para encadenar peticiones; las cookies viajan solas. */
export async function loginAs(email: string, password: string = PASSWORD) {
  const agent = request.agent(app);
  const response = await agent.post("/api/v1/auth/login").send({ email, password });
  if (response.status !== 200) {
    throw new Error(`No se pudo iniciar sesión como ${email}: ${response.status}`);
  }
  return agent;
}

/** Ticket ya existente en la base, sin pasar por la API. */
export async function seedTicket(options: {
  areaId: Types.ObjectId;
  requesterId: Types.ObjectId;
  createdById?: Types.ObjectId;
  assigneeIds?: Types.ObjectId[];
  status?: TicketStatus;
  priority?: Priority;
  title?: string;
  createdAt?: Date;
  categoryId?: Types.ObjectId;
  /** Métricas ya consumadas: lo que las agregaciones de F6 necesitan medir. */
  firstResponseAt?: Date;
  firstResponderId?: Types.ObjectId;
  resolvedAt?: Date;
  resolvedByIds?: Types.ObjectId[];
  resolutionBreached?: boolean;
  csat?: { rating: number; comment?: string; answeredAt: Date };
}) {
  const priority = options.priority ?? "medium";
  const createdAt = options.createdAt ?? new Date();
  const calendar: BusinessCalendar = {
    hours: DEFAULT_SETTINGS.businessHours,
    holidays: [],
  };
  const targets = computeTicketSla(createdAt, DEFAULT_SETTINGS.slaPolicies[priority], calendar);
  const counter = await Counter.findByIdAndUpdate(
    "ticket",
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  ).lean();

  return Ticket.create({
    number: counter!.seq,
    title: options.title ?? "Se cayó el wifi en el segundo piso",
    description: "Desde hace media hora nadie tiene conexión en el segundo piso.",
    requesterId: options.requesterId,
    createdById: options.createdById ?? options.requesterId,
    areaId: options.areaId,
    ...(options.categoryId ? { categoryId: options.categoryId } : {}),
    assigneeIds: options.assigneeIds ?? [],
    status: options.status ?? "open",
    priority,
    ai: { classificationStatus: "done" },
    sla: {
      responseDueAt: targets.response.dueAt,
      responseRiskAt: targets.response.riskAt,
      resolutionDueAt: targets.resolution.dueAt,
      resolutionRiskAt: targets.resolution.riskAt,
      pausedMs: 0,
      ...(options.firstResponseAt ? { firstResponseAt: options.firstResponseAt } : {}),
      ...(options.firstResponderId ? { firstResponderId: options.firstResponderId } : {}),
      ...(options.resolvedAt ? { resolvedAt: options.resolvedAt } : {}),
      ...(options.resolvedByIds ? { resolvedByIds: options.resolvedByIds } : {}),
      ...(options.resolutionBreached !== undefined
        ? { resolutionBreached: options.resolutionBreached }
        : {}),
    },
    ...(options.csat ? { csat: options.csat } : {}),
    attachmentsCount: 0,
    lastActivityAt: createdAt,
    statusHistory: [{ status: "open", at: createdAt, byId: options.requesterId }],
    createdAt,
    updatedAt: createdAt,
  });
}
