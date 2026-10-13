import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_AVATAR_BYTES } from "@tekzaya/shared";
import { Router } from "express";
import multer from "multer";
import { uploadDir } from "../../config/env";
import { AppError } from "../../middleware/errors";
import { User } from "../../models/user.model";
import { sniffMimeType } from "../attachments/attachments.service";
import { buildMeResponse } from "../auth/auth.service";

const router = Router();

/**
 * Las fotos viven aparte de los adjuntos: no pertenecen a ningún ticket y las ve
 * cualquiera con sesión, porque aparecen junto al nombre en toda la aplicación.
 */
const avatarDir = path.join(uploadDir, "avatars");
const PREFIX = "/api/v1/avatars/";

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
const MIME_OF = Object.fromEntries(Object.entries(EXTENSION).map(([mime, ext]) => [ext, mime]));

// El nombre en disco lo genera el servidor; esto solo deja pasar lo que él mismo creó.
const KEY = /^[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
});

/** Borra la foto anterior. Si no está en disco, no hay nada que limpiar. */
async function removeStored(url: string | undefined | null): Promise<void> {
  if (!url?.startsWith(PREFIX)) return;
  const key = url.slice(PREFIX.length);
  if (KEY.test(key)) await unlink(path.join(avatarDir, key)).catch(() => undefined);
}

router.post("/me/avatar", (req, res, next) => {
  upload.single("file")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE" ? "La foto supera los 2 MB" : "No se pudo leer la foto";
      next(new AppError(413, "file_too_large", message));
      return;
    }
    if (error) {
      next(error);
      return;
    }

    const file = req.file;
    if (!file) {
      next(new AppError(422, "validation_error", "Adjunta una foto en el campo «file»"));
      return;
    }

    // Igual que con los adjuntos, el tipo lo dicen los bytes, no la extensión.
    const mime = sniffMimeType(file.buffer);
    const ext = mime ? EXTENSION[mime] : undefined;
    if (!ext) {
      next(new AppError(415, "unsupported_file_type", "La foto debe ser PNG, JPG, GIF o WebP"));
      return;
    }

    const actorId: string = res.locals.actor.id;
    const key = `${randomUUID()}.${ext}`;

    void (async () => {
      await mkdir(avatarDir, { recursive: true });
      await writeFile(path.join(avatarDir, key), file.buffer);

      const previous = await User.findByIdAndUpdate(actorId, { $set: { avatarUrl: `${PREFIX}${key}` } })
        .select("avatarUrl")
        .lean();
      await removeStored(previous?.avatarUrl);

      res.json(await buildMeResponse(actorId));
    })().catch(next);
  });
});

router.delete("/me/avatar", async (_req, res) => {
  const actorId: string = res.locals.actor.id;
  const previous = await User.findByIdAndUpdate(actorId, { $unset: { avatarUrl: 1 } })
    .select("avatarUrl")
    .lean();
  await removeStored(previous?.avatarUrl);
  res.json(await buildMeResponse(actorId));
});

router.get("/avatars/:key", async (req, res) => {
  const key = String(req.params["key"] ?? "");
  if (!KEY.test(key)) throw new AppError(404, "not_found", "Esa foto no existe");

  const file = path.join(avatarDir, key);
  const info = await stat(file).catch(() => null);
  if (!info) throw new AppError(404, "not_found", "Esa foto no existe");

  res.type(MIME_OF[key.split(".").pop()!]!);
  res.setHeader("Content-Length", String(info.size));
  // El nombre cambia con cada foto nueva, así que el navegador puede guardarla sin miedo.
  res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
  res.setHeader("X-Content-Type-Options", "nosniff");
  createReadStream(file).pipe(res);
});

export default router;
