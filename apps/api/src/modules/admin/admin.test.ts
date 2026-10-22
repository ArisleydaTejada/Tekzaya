import { DEFAULT_SETTINGS } from "@tekzaya/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Notification } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";
import { User } from "../../models/user.model";
import {
  app,
  connect,
  disconnect,
  loginAs,
  resetDatabase,
  seedTicket,
  type Fixture,
} from "../../test/fixtures";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

/** El enlace es lo único que se devuelve: el servidor solo guarda su huella. */
const tokenOf = (url: string): string => new URL(url).searchParams.get("token")!;

describe("acceso a la administración", () => {
  it("solo el administrador entra", async () => {
    const supervisora = await loginAs(fixture.users.supIt.email);
    expect((await supervisora.get("/api/v1/users")).status).toBe(403);
    expect((await supervisora.get("/api/v1/admin/areas")).status).toBe(403);

    const admin = await loginAs(fixture.users.admin.email);
    expect((await admin.get("/api/v1/users")).status).toBe(200);
  });

  /**
   * RRHH lleva las altas y bajas del personal, pero no reparte privilegios: si
   * pudiera, cualquier cuenta de RRHH podría nombrarse administradora.
   */
  describe("el supervisor de RRHH administra personas", () => {
    it("lista, invita y desactiva como el administrador", async () => {
      const rrhh = await loginAs(fixture.users.supRrhh.email);

      expect((await rrhh.get("/api/v1/users")).status).toBe(200);

      const invitada = await rrhh.post("/api/v1/users").send({
        name: "Nora Nueva",
        email: "nora.nueva@tekzaya.test",
        areaId: String(fixture.areas.ventas),
      });
      expect(invitada.status).toBe(201);
      expect(invitada.body.link.url).toContain("/invitacion");

      const baja = await rrhh
        .patch(`/api/v1/users/${invitada.body.user.id}`)
        .send({ status: "disabled" });
      expect(baja.status).toBe(200);
      expect(baja.body.user.status).toBe("disabled");
    });

    it("no puede nombrar administradores ni conceder la lectura global", async () => {
      const rrhh = await loginAs(fixture.users.supRrhh.email);

      const invitaAdmin = await rrhh.post("/api/v1/users").send({
        name: "Ada Atajo",
        email: "ada.atajo@tekzaya.test",
        areaId: String(fixture.areas.ventas),
        role: "admin",
      });
      expect(invitaAdmin.status).toBe(403);

      const asciende = await rrhh
        .patch(`/api/v1/users/${String(fixture.users.agentIt.id)}`)
        .send({ role: "admin" });
      expect(asciende.status).toBe(403);

      const lecturaGlobal = await rrhh
        .patch(`/api/v1/users/${String(fixture.users.agentIt.id)}`)
        .send({ hasGlobalReadAccess: true });
      expect(lecturaGlobal.status).toBe(403);
    });

    it("no toca la cuenta del administrador", async () => {
      const rrhh = await loginAs(fixture.users.supRrhh.email);

      const edita = await rrhh
        .patch(`/api/v1/users/${String(fixture.users.admin.id)}`)
        .send({ name: "Otro nombre" });
      expect(edita.status).toBe(403);

      // Tampoco por la puerta de atrás de los enlaces de acceso.
      const enlace = await rrhh.post(
        `/api/v1/users/${String(fixture.users.admin.id)}/access-link`,
      );
      expect(enlace.status).toBe(403);
    });

    it("sigue sin entrar a áreas", async () => {
      const rrhh = await loginAs(fixture.users.supRrhh.email);
      expect((await rrhh.get("/api/v1/admin/areas")).status).toBe(403);
    });
  });

  /**
   * Configuración no es un catálogo público: el supervisor de área no la lee. La
   * llevan el administrador y RRHH, pero RRHH sin la IA ni los límites de Reportes.
   */
  it("la Configuración es del administrador y de RRHH, no de un supervisor de área", async () => {
    const supervisora = await loginAs(fixture.users.supIt.email);
    expect((await supervisora.get("/api/v1/settings")).status).toBe(403);
    expect((await supervisora.patch("/api/v1/settings").send({ holidays: [] })).status).toBe(403);

    const admin = await loginAs(fixture.users.admin.email);
    expect((await admin.get("/api/v1/settings")).status).toBe(200);
  });

  it("RRHH cambia la jornada y los festivos, pero no la IA ni los límites de Reportes", async () => {
    const rrhh = await loginAs(fixture.users.supRrhh.email);
    expect((await rrhh.get("/api/v1/settings")).status).toBe(200);

    const festivos = await rrhh.patch("/api/v1/settings").send({ holidays: ["2026-12-25"] });
    expect(festivos.status).toBe(200);
    expect(festivos.body.holidays).toEqual(["2026-12-25"]);

    const ia = await rrhh.patch("/api/v1/settings").send({
      aiEnabled: { ...DEFAULT_SETTINGS.aiEnabled, suggestArea: false },
    });
    expect(ia.status).toBe(403);

    const limites = await rrhh
      .patch("/api/v1/settings")
      .send({ reportLimits: { maxSavedReports: 1, maxWidgetsPerReport: 1 } });
    expect(limites.status).toBe(403);
  });

  it("no deja cerrar un ticket en espera antes de recordar al solicitante", async () => {
    const admin = await loginAs(fixture.users.admin.email);

    const juntos = await admin
      .patch("/api/v1/settings")
      .send({ onHoldReminderDays: 6, onHoldAutoCloseDays: 4 });
    expect(juntos.status).toBe(400);

    // Llega solo uno de los dos: se compara con el recordatorio ya guardado (5).
    expect((await admin.patch("/api/v1/settings").send({ onHoldAutoCloseDays: 3 })).status).toBe(400);
    expect((await admin.patch("/api/v1/settings").send({ onHoldAutoCloseDays: 5 })).status).toBe(200);
  });
});

describe("invitar a alguien", () => {
  it("crea la cuenta invitada y entrega un enlace de un solo uso", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const invitacion = await admin.post("/api/v1/users").send({
      name: "Rosa Delgado",
      email: "Rosa.Delgado@Tekzaya.test",
      areaId: String(fixture.areas.ventas),
      role: "employee",
    });

    expect(invitacion.status).toBe(201);
    expect(invitacion.body.user.status).toBe("invited");
    expect(invitacion.body.user.hasPassword).toBe(false);
    expect(invitacion.body.user.email).toBe("rosa.delgado@tekzaya.test");
    expect(invitacion.body.link.url).toContain("/invitacion?token=");

    // El administrador nunca conoce la contraseña: la elige la persona.
    const token = tokenOf(invitacion.body.link.url);
    const previo = await request(app).get(`/api/v1/auth/access?token=${token}`);
    expect(previo.status).toBe(200);
    expect(previo.body.email).toBe("rosa.delgado@tekzaya.test");
    expect(previo.body.areaName).toBe("Ventas");

    const aceptada = await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token, password: "Contrasena2026" });
    expect(aceptada.status).toBe(200);
    expect(aceptada.body.name).toBe("Rosa Delgado");
    // Entra directamente, sin pasar otra vez por el formulario de acceso.
    expect(String(aceptada.headers["set-cookie"])).toContain("tk_access");

    const activa = await User.findOne({ email: "rosa.delgado@tekzaya.test" })
      .select("+passwordHash")
      .lean();
    expect(activa!.status).toBe("active");
    expect(activa!.passwordHash).toBeTruthy();

    // El mismo enlace ya no sirve una segunda vez.
    const repetida = await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token, password: "OtraClave2026" });
    expect(repetida.status).toBe(400);
  });

  it("rechaza un correo que ya existe", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const response = await admin.post("/api/v1/users").send({
      name: "Duplicada",
      email: fixture.users.agentIt.email,
      areaId: String(fixture.areas.it),
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("email_taken");
  });

  it("un enlace inventado no dice si la cuenta existe", async () => {
    const response = await request(app).get(
      "/api/v1/auth/access?token=esto-no-es-un-token-valido-pero-es-largo",
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_token");
  });

  it("exige una contraseña razonable", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const invitacion = await admin.post("/api/v1/users").send({
      name: "Rosa Delgado",
      email: "rosa@tekzaya.test",
      areaId: String(fixture.areas.ventas),
    });

    const response = await request(app)
      .post("/api/v1/auth/accept-invite")
      .send({ token: tokenOf(invitacion.body.link.url), password: "corta" });

    expect(response.status).toBe(422);
  });
});

describe("restablecer la contraseña", () => {
  it("el administrador genera el enlace y la persona elige la contraseña nueva", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const enlace = await admin.post(`/api/v1/users/${String(fixture.users.agentIt.id)}/access-link`);

    expect(enlace.status).toBe(200);
    expect(enlace.body.url).toContain("/restablecer?token=");

    const token = tokenOf(enlace.body.url);
    const cambiada = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "NuevaClave2026" });
    expect(cambiada.status).toBe(200);

    // La contraseña nueva entra; el enlace ya no.
    const acceso = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: fixture.users.agentIt.email, password: "NuevaClave2026" });
    expect(acceso.status).toBe(200);

    const reintento = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token, password: "TerceraClave2026" });
    expect(reintento.status).toBe(400);
  });

  it("un enlace de invitación no sirve para restablecer", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const invitacion = await admin.post("/api/v1/users").send({
      name: "Rosa Delgado",
      email: "rosa@tekzaya.test",
      areaId: String(fixture.areas.ventas),
    });

    const response = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: tokenOf(invitacion.body.link.url), password: "ClaveValida2026" });

    expect(response.status).toBe(400);
  });
});

describe("desactivar a alguien", () => {
  it("lo saca de sus tickets y devuelve a Abierto los que se quedan sin nadie", async () => {
    const soloSuyo = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });
    const compartido = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id, fixture.users.supIt.id],
      status: "in_progress",
    });

    const admin = await loginAs(fixture.users.admin.email);
    const response = await admin
      .patch(`/api/v1/users/${String(fixture.users.agentIt.id)}`)
      .send({ status: "disabled" });

    expect(response.status).toBe(200);
    expect(response.body.user.status).toBe("disabled");
    expect(response.body.releasedTickets).toBe(2);

    const huerfano = await Ticket.findById(soloSuyo._id).lean();
    expect(huerfano!.assigneeIds).toHaveLength(0);
    expect(huerfano!.status).toBe("open");

    // El que sigue teniendo responsable no se mueve de estado.
    const sigue = await Ticket.findById(compartido._id).lean();
    expect(sigue!.assigneeIds.map(String)).toEqual([String(fixture.users.supIt.id)]);
    expect(sigue!.status).toBe("in_progress");

    // Su supervisora se entera de que hay trabajo sin dueño.
    const avisos = await Notification.find({ type: "ticket_unassigned" }).lean();
    expect(avisos).toHaveLength(1);
    expect(String(avisos[0]!.userId)).toBe(String(fixture.users.supIt.id));
  });

  it("una cuenta desactivada ya no entra", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    await admin.patch(`/api/v1/users/${String(fixture.users.agentIt.id)}`).send({
      status: "disabled",
    });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: fixture.users.agentIt.email, password: "Prueba1234!" });

    expect(response.status).toBe(403);
  });

  it("no se puede dejar el sistema sin administrador", async () => {
    const admin = await loginAs(fixture.users.admin.email);

    const propia = await admin
      .patch(`/api/v1/users/${String(fixture.users.admin.id)}`)
      .send({ status: "disabled" });
    expect(propia.status).toBe(409);

    const degradar = await admin
      .patch(`/api/v1/users/${String(fixture.users.admin.id)}`)
      .send({ role: "employee" });
    expect(degradar.status).toBe(409);
    expect(degradar.body.error.code).toBe("last_admin");
  });

  it("reactivar devuelve el acceso", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const id = String(fixture.users.agentIt.id);

    await admin.patch(`/api/v1/users/${id}`).send({ status: "disabled" });
    await admin.patch(`/api/v1/users/${id}`).send({ status: "active" });

    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: fixture.users.agentIt.email, password: "Prueba1234!" });
    expect(response.status).toBe(200);
  });
});

describe("editar a alguien", () => {
  it("cambiar de área deja de supervisar la anterior", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const response = await admin
      .patch(`/api/v1/users/${String(fixture.users.supIt.id)}`)
      .send({ areaId: String(fixture.areas.ventas) });

    expect(response.status).toBe(200);
    expect(response.body.user.areaName).toBe("Ventas");
    expect(response.body.user.isAreaSupervisor).toBe(false);
  });

  it("el cambio de permisos surte efecto en la siguiente petición", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);
    expect((await agente.get("/api/v1/users")).status).toBe(403);

    const admin = await loginAs(fixture.users.admin.email);
    await admin.patch(`/api/v1/users/${String(fixture.users.agentIt.id)}`).send({ role: "admin" });

    // El actor se reconstruye desde la base en cada petición, no desde el token.
    expect((await agente.get("/api/v1/users")).status).toBe(200);
  });
});

describe("áreas y categorías", () => {
  it("crea un área con sus categorías", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const response = await admin.post("/api/v1/admin/areas").send({
      name: "Marketing",
      description: "Material gráfico y eventos",
      color: "#9b7ebd",
      categories: ["Material gráfico", "Eventos"],
    });

    expect(response.status).toBe(201);
    const creada = response.body.items.find((area: { name: string }) => area.name === "Marketing");
    expect(creada.categories).toHaveLength(2);
    expect(creada.memberCount).toBe(0);

    const repetida = await admin
      .post("/api/v1/admin/areas")
      .send({ name: "Marketing", color: "#111111" });
    expect(repetida.status).toBe(409);
  });

  it("no desactiva un área con tickets sin cerrar", async () => {
    await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      status: "in_progress",
    });

    const admin = await loginAs(fixture.users.admin.email);
    const response = await admin
      .patch(`/api/v1/admin/areas/${String(fixture.areas.it)}`)
      .send({ isActive: false });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("area_in_use");
  });

  it("añade, renombra y desactiva categorías sin borrarlas", async () => {
    const admin = await loginAs(fixture.users.admin.email);

    const añadida = await admin
      .post(`/api/v1/admin/areas/${String(fixture.areas.it)}/categories`)
      .send({ name: "Telefonía" });
    expect(añadida.status).toBe(201);

    const area = añadida.body.items.find((item: { id: string }) => item.id === String(fixture.areas.it));
    const categoria = area.categories.find((item: { name: string }) => item.name === "Telefonía");

    const renombrada = await admin
      .patch(`/api/v1/admin/areas/${String(fixture.areas.it)}/categories/${categoria.id}`)
      .send({ name: "Telefonía y móviles", isActive: false });
    expect(renombrada.status).toBe(200);

    const actualizada = renombrada.body.items.find(
      (item: { id: string }) => item.id === String(fixture.areas.it),
    );
    const guardada = actualizada.categories.find(
      (item: { id: string }) => item.id === categoria.id,
    );
    // Sigue existiendo: los tickets antiguos apuntan a ella.
    expect(guardada.name).toBe("Telefonía y móviles");
    expect(guardada.isActive).toBe(false);
  });

  it("una categoría desactivada desaparece del catálogo público", async () => {
    const admin = await loginAs(fixture.users.admin.email);
    const area = (await admin.get("/api/v1/admin/areas")).body.items.find(
      (item: { id: string }) => item.id === String(fixture.areas.it),
    );
    const categoria = area.categories[0];

    await admin
      .patch(`/api/v1/admin/areas/${String(fixture.areas.it)}/categories/${categoria.id}`)
      .send({ isActive: false });

    const publico = await admin.get("/api/v1/areas");
    const visible = publico.body.items.find((item: { id: string }) => item.id === String(fixture.areas.it));
    expect(visible.categories.map((item: { id: string }) => item.id)).not.toContain(categoria.id);
  });

  it("designa supervisores del área, y solo de entre sus miembros", async () => {
    const admin = await loginAs(fixture.users.admin.email);

    const ajeno = await admin
      .put(`/api/v1/admin/areas/${String(fixture.areas.it)}/supervisors`)
      .send({ userIds: [String(fixture.users.employeeVentas.id)] });
    expect(ajeno.status).toBe(422);

    const response = await admin
      .put(`/api/v1/admin/areas/${String(fixture.areas.it)}/supervisors`)
      .send({ userIds: [String(fixture.users.agentIt.id)] });

    expect(response.status).toBe(200);
    const area = response.body.items.find((item: { id: string }) => item.id === String(fixture.areas.it));
    // Sustituye la lista: Sonia deja de supervisar, Aldo pasa a hacerlo.
    expect(area.supervisors.map((item: { name: string }) => item.name)).toEqual(["Aldo Agente"]);
  });
});
