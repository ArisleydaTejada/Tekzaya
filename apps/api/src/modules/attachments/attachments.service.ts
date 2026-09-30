import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { ALLOWED_ATTACHMENT_MIME } from "@tekzaya/shared";
import { Types } from "mongoose";
import { uploadDir } from "../../config/env";
import { AppError } from "../../middleware/errors";
import { Attachment } from "../../models/support.models";

type AllowedMime = (typeof ALLOWED_ATTACHMENT_MIME)[number];

/**
 * El tipo se decide por los primeros bytes del archivo, no por la extensión ni
 * por el `Content-Type` que manda el navegador: ambos los elige quien sube, así
 * que ninguno sirve como control (spec §10.4).
 */
const MAGIC: { mime: AllowedMime; bytes: readonly (number | null)[]; offset?: number }[] = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  // "RIFF" … "WEBP": los cuatro bytes del tamaño van en medio y no se comprueban.
  {
    mime: "image/webp",
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },
];

export function sniffMimeType(buffer: Buffer): AllowedMime | null {
  for (const candidate of MAGIC) {
    const { bytes } = candidate;
    if (buffer.length < bytes.length) continue;
    if (bytes.every((byte, index) => byte === null || buffer[index] === byte)) {
      return candidate.mime;
    }
  }
  return null;
}

/** Quita rutas y caracteres raros: el nombre solo se usa para mostrar y descargar. */
export function safeFileName(original: string): string {
  const base = path.basename(original).replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_");
  return base.slice(0, 120) || "archivo";
}

export interface StoredFile {
  id: string;
  fileName: string;
  mimeType: AllowedMime;
  sizeBytes: number;
}

/**
 * Guarda el archivo con un nombre generado y lo registra como borrador (sin
 * ticket). El nombre en disco nunca proviene del usuario, así que no hay forma
 * de escribir fuera del directorio de subidas.
 */
export async function storeUpload(
  buffer: Buffer,
  originalName: string,
  uploaderId: string,
): Promise<StoredFile> {
  const mimeType = sniffMimeType(buffer);
  if (!mimeType) {
    throw new AppError(
      415,
      "unsupported_file_type",
      "Solo se aceptan imágenes (PNG, JPG, GIF, WebP) y archivos PDF",
    );
  }

  await mkdir(uploadDir, { recursive: true });
  const storageKey = `${randomUUID()}`;
  const target = path.join(uploadDir, storageKey);

  await new Promise<void>((resolve, reject) => {
    const stream = createWriteStream(target);
    stream.on("error", reject);
    stream.on("finish", resolve);
    stream.end(buffer);
  });

  try {
    const doc = await Attachment.create({
      uploaderId,
      fileName: safeFileName(originalName),
      mimeType,
      sizeBytes: buffer.length,
      storageKey,
    });
    return {
      id: String(doc._id),
      fileName: doc.fileName!,
      mimeType,
      sizeBytes: buffer.length,
    };
  } catch (error) {
    // Sin registro en la base, el archivo en disco sería basura invisible.
    await unlink(target).catch(() => undefined);
    throw error;
  }
}

export function pathOf(storageKey: string): string {
  return path.join(uploadDir, storageKey);
}

/**
 * Enlaza borradores a un ticket y un mensaje. Solo acepta archivos que subió
 * este mismo usuario y que aún no pertenecen a ningún ticket: así un identificador
 * ajeno no engancha el adjunto de otra persona a una conversación nueva.
 */
export async function bindAttachments(
  attachmentIds: readonly string[],
  uploaderId: string,
  ticketId: Types.ObjectId,
  messageId: Types.ObjectId,
): Promise<number> {
  if (!attachmentIds.length) return 0;

  const ids = attachmentIds.map((id) => new Types.ObjectId(id));
  const criteria = { _id: { $in: ids }, uploaderId, ticketId: { $exists: false } };

  // Se comprueban todos antes de tocar ninguno: si uno no vale, no se enlaza
  // ninguno y el mensaje se rechaza entero.
  const usable = await Attachment.countDocuments(criteria);
  if (usable !== ids.length) {
    throw new AppError(
      422,
      "invalid_attachment",
      "Alguno de los adjuntos ya no está disponible; vuelve a subirlo",
    );
  }

  await Attachment.updateMany(criteria, { $set: { ticketId, messageId } });
  return ids.length;
}
