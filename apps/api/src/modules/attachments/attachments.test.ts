import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { connect, disconnect, loginAs, resetDatabase, seedTicket, type Fixture } from "../../test/fixtures";
import { sniffMimeType } from "./attachments.service";

let fixture: Fixture;

beforeAll(connect);
afterAll(disconnect);
beforeEach(async () => {
  fixture = await resetDatabase();
});

/** PNG mínimo válido: cabecera + un IHDR truncado. Basta para la comprobación de bytes. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 1),
]);

describe("comprobación del tipo real", () => {
  it("reconoce los formatos admitidos por sus primeros bytes", () => {
    expect(sniffMimeType(PNG)).toBe("image/png");
    expect(sniffMimeType(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniffMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("no se fía de la extensión: un ejecutable renombrado no pasa", () => {
    expect(sniffMimeType(Buffer.from("MZ\u0090\u0000ejecutable"))).toBeNull();
  });
});

describe("adjuntos", () => {
  it("se sube, se enlaza al mensaje y se descarga con permisos", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const agente = await loginAs(fixture.users.agentIt.email);
    const subida = await agente
      .post("/api/v1/attachments")
      .attach("file", PNG, { filename: "captura.png", contentType: "image/png" });

    expect(subida.status).toBe(201);
    expect(subida.body.mimeType).toBe("image/png");

    const mensaje = await agente
      .post(`/api/v1/tickets/${String(ticket._id)}/messages`)
      .send({ type: "public", body: "Adjunto la captura", attachmentIds: [subida.body.id] });

    expect(mensaje.status).toBe(201);
    expect(mensaje.body.attachments).toHaveLength(1);
    expect(mensaje.body.attachments[0].fileName).toBe("captura.png");

    const propio = await agente.get(`/api/v1/attachments/${subida.body.id}`);
    expect(propio.status).toBe(200);
    expect(propio.headers["content-type"]).toContain("image/png");

    // Alguien ajeno al ticket no llega al archivo aunque tenga el identificador.
    const ajeno = await loginAs(fixture.users.supVentas.email);
    const denegado = await ajeno.get(`/api/v1/attachments/${subida.body.id}`);
    expect(denegado.status).toBe(404);
  });

  it("rechaza un archivo cuyo contenido no es de un tipo admitido", async () => {
    const agente = await loginAs(fixture.users.agentIt.email);
    const response = await agente
      .post("/api/v1/attachments")
      // Se presenta como PNG, pero los bytes son otra cosa.
      .attach("file", Buffer.from("#!/bin/sh\nrm -rf /"), {
        filename: "inocente.png",
        contentType: "image/png",
      });

    expect(response.status).toBe(415);
  });

  it("no se puede enlazar el adjunto de otra persona", async () => {
    const ticket = await seedTicket({
      areaId: fixture.areas.it,
      requesterId: fixture.users.employeeVentas.id,
      assigneeIds: [fixture.users.agentIt.id],
      status: "in_progress",
    });

    const otro = await loginAs(fixture.users.supIt.email);
    const subida = await otro
      .post("/api/v1/attachments")
      .attach("file", PNG, { filename: "ajeno.png", contentType: "image/png" });

    const agente = await loginAs(fixture.users.agentIt.email);
    const response = await agente
      .post(`/api/v1/tickets/${String(ticket._id)}/messages`)
      .send({ type: "public", body: "Intento colgar algo ajeno", attachmentIds: [subida.body.id] });

    expect(response.status).toBe(422);
  });
});
