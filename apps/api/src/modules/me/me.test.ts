import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { User } from "../../models/user.model";
import { connect, disconnect, loginAs, PASSWORD, resetDatabase, type Fixture } from "../../test/fixtures";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

describe("mi perfil", () => {
  it("cada quien corrige su propio nombre", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);

    const response = await agente.patch("/api/v1/me").send({ name: "Aldo Agente Ruiz" });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Aldo Agente Ruiz");
    // El área y el rol no se tocan desde aquí: los decide quien administra.
    expect(response.body.areaId).toBe(String(fixture.areas.it));
    expect(response.body.role).toBe("employee");
  });

  it("un nombre vacío no pasa", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);
    expect((await agente.patch("/api/v1/me").send({ name: "A" })).status).toBe(422);
  });

  /**
   * Lo que convierte un equipo desatendido en una cuenta robada: poder cambiar
   * la contraseña sin saber la anterior.
   */
  it("cambiar la contraseña exige la actual", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);

    const conLaMala = await agente
      .post("/api/v1/me/password")
      .send({ currentPassword: "noEsLaSuya1", password: "NuevaClave2026" });
    expect(conLaMala.status).toBe(422);

    const buena = await agente
      .post("/api/v1/me/password")
      .send({ currentPassword: PASSWORD, password: "NuevaClave2026" });
    expect(buena.status).toBe(204);
  });

  it("la contraseña nueva vale para entrar, y la vieja ya no", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);
    await agente
      .post("/api/v1/me/password")
      .send({ currentPassword: PASSWORD, password: "NuevaClave2026" });

    await expect(loginAs(fixture.users.agentIt.email)).rejects.toThrow();

    const conLaNueva = await loginAs(fixture.users.agentIt.email, "NuevaClave2026");
    expect((await conLaNueva.get("/api/v1/me")).status).toBe(200);
  });

  it("una contraseña débil se rechaza con el mismo criterio que la invitación", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);

    const response = await agente
      .post("/api/v1/me/password")
      .send({ currentPassword: PASSWORD, password: "cortita" });

    expect(response.status).toBe(422);
  });

  it("quien entra con Google no tiene contraseña que confirmar, y se le dice", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);
    await User.updateOne({ _id: fixture.users.agentIt.id }, { $unset: { passwordHash: 1 } });

    const response = await agente
      .post("/api/v1/me/password")
      .send({ currentPassword: PASSWORD, password: "NuevaClave2026" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("no_password");
  });
});

describe("foto de perfil", () => {
  // Un PNG de 1×1: lo mínimo que pasa la comprobación por los primeros bytes.
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );

  it("se sube, la ve cualquiera con sesión y se puede quitar", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);

    const subida = await agente.post("/api/v1/me/avatar").attach("file", PNG, "yo.png");
    expect(subida.status).toBe(200);
    const url = subida.body.avatarUrl as string;
    expect(url).toMatch(/^\/api\/v1\/avatars\/[0-9a-f-]{36}\.png$/);

    // Aparece junto al nombre en toda la aplicación, así que la ve otra persona.
    const otro = await loginAs(fixture.users.employeeVentas.email);
    const vista = await otro.get(url);
    expect(vista.status).toBe(200);
    expect(vista.headers["content-type"]).toBe("image/png");

    const quitada = await agente.delete("/api/v1/me/avatar");
    expect(quitada.status).toBe(200);
    expect(quitada.body.avatarUrl).toBeUndefined();
    // El archivo se borra del disco, no solo del perfil.
    expect((await otro.get(url)).status).toBe(404);
  });

  it("un archivo que no es imagen se rechaza aunque diga .png", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);
    const falsa = await agente
      .post("/api/v1/me/avatar")
      .attach("file", Buffer.from("%PDF-1.4 no soy una foto"), "foto.png");
    expect(falsa.status).toBe(415);
  });
});
