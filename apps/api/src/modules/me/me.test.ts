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
