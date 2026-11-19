import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DemoRequest } from "../../models/demoRequest.model";
import { Notification } from "../../models/support.models";
import { app, connect, disconnect, resetDatabase, type Fixture } from "../../test/fixtures";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
  await DemoRequest.deleteMany({});
});

const valid = {
  name: "Inés Barrios",
  email: "  Ines.Barrios@Ferreteria.com ",
  company: "Ferretería Barrios",
  module: "maintenance",
  message: "Tenemos tres sucursales.",
};

describe("POST /demo-requests", () => {
  it("guarda la solicitud sin sesión y avisa a los administradores", async () => {
    const response = await request(app).post("/api/v1/demo-requests").send(valid);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ received: true });

    const saved = await DemoRequest.findOne().lean();
    expect(saved).toMatchObject({ email: "ines.barrios@ferreteria.com", module: "maintenance" });

    const notices = await Notification.find({ type: "demo_request" }).lean();
    expect(notices.map((notice) => String(notice.userId))).toEqual([String(fixture.users.admin.id)]);
    expect(notices[0]).toMatchObject({
      title: "Demo de Mantenimiento",
      body: "Inés Barrios · Ferretería Barrios · ines.barrios@ferreteria.com",
    });
  });

  it("rechaza datos incompletos con el error de cada campo", async () => {
    const response = await request(app)
      .post("/api/v1/demo-requests")
      .send({ ...valid, email: "no-es-correo", company: "" });

    expect(response.status).toBe(422);
    expect(Object.keys(response.body.error.fields)).toEqual(expect.arrayContaining(["email", "company"]));
    expect(await DemoRequest.countDocuments()).toBe(0);
  });

  it("a un robot que llena la trampa le contesta igual, pero no guarda nada", async () => {
    const response = await request(app)
      .post("/api/v1/demo-requests")
      .send({ ...valid, website: "https://spam.example" });

    expect(response.status).toBe(201);
    expect(await DemoRequest.countDocuments()).toBe(0);
    expect(await Notification.countDocuments({ type: "demo_request" })).toBe(0);
  });
});
