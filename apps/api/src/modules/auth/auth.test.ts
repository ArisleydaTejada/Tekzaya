import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { User } from "../../models/user.model";
import { app, connect, disconnect, PASSWORD, resetDatabase, type Fixture } from "../../test/fixtures";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

/** Las cookies de una respuesta, por nombre, como las guardaría el navegador. */
function cookiesOf(response: request.Response): Record<string, string> {
  const raw = response.headers["set-cookie"] as unknown as string[] | undefined;
  return Object.fromEntries(
    (raw ?? []).map((line) => {
      const pair = line.split(";")[0]!;
      const separator = pair.indexOf("=");
      return [pair.slice(0, separator), pair.slice(separator + 1)];
    }),
  );
}

async function login(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD });
  expect(response.status).toBe(200);
  return cookiesOf(response);
}

/**
 * Pasados los 15 minutos el navegador borra la cookie de acceso y solo le queda la
 * de renovación: es el caso que la web resuelve llamando a `/auth/refresh`.
 */
describe("renovación de la sesión", () => {
  it("sin la cookie de acceso, la de renovación devuelve una nueva", async () => {
    const { tk_refresh: refresh } = await login(fixture.users.agentIt.email);
    expect(refresh).toBeTruthy();

    const caducada = await request(app).get("/api/v1/me").set("Cookie", `tk_refresh=${refresh}`);
    expect(caducada.status).toBe(401);

    const renovada = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `tk_refresh=${refresh}`);
    expect(renovada.status).toBe(200);
    const { tk_access: access } = cookiesOf(renovada);
    expect(access).toBeTruthy();

    const otraVez = await request(app).get("/api/v1/me").set("Cookie", `tk_access=${access}`);
    expect(otraVez.status).toBe(200);
    expect(otraVez.body.email).toBe(fixture.users.agentIt.email);
  });

  it("una cuenta desactivada no renueva aunque la cookie siga viva", async () => {
    const { tk_refresh: refresh } = await login(fixture.users.agentIt.email);
    await User.updateOne({ _id: fixture.users.agentIt.id }, { $set: { status: "disabled" } });

    const response = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `tk_refresh=${refresh}`);
    expect(response.status).toBe(401);
  });

  it("sin ninguna cookie no hay nada que renovar", async () => {
    expect((await request(app).post("/api/v1/auth/refresh")).status).toBe(401);
  });
});

describe("consulta de la sesión", () => {
  it("sin cookies responde 200 con null, no un 401", async () => {
    const response = await request(app).get("/api/v1/auth/session");
    expect(response.status).toBe(200);
    expect(response.body.me).toBeNull();
  });

  it("con la cookie de acceso devuelve a la persona", async () => {
    const { tk_access: access } = await login(fixture.users.agentIt.email);
    const response = await request(app).get("/api/v1/auth/session").set("Cookie", `tk_access=${access}`);
    expect(response.status).toBe(200);
    expect(response.body.me.email).toBe(fixture.users.agentIt.email);
  });

  it("con solo la de renovación, renueva y devuelve a la persona", async () => {
    const { tk_refresh: refresh } = await login(fixture.users.agentIt.email);
    const response = await request(app).get("/api/v1/auth/session").set("Cookie", `tk_refresh=${refresh}`);
    expect(response.status).toBe(200);
    expect(response.body.me.email).toBe(fixture.users.agentIt.email);
    expect(cookiesOf(response).tk_access).toBeTruthy();
  });

  it("con cookies inválidas responde null y las borra", async () => {
    const response = await request(app)
      .get("/api/v1/auth/session")
      .set("Cookie", "tk_access=basura; tk_refresh=basura");
    expect(response.status).toBe(200);
    expect(response.body.me).toBeNull();
    expect(cookiesOf(response)).toMatchObject({ tk_access: "", tk_refresh: "" });
  });
});
