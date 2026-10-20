import { createReadStream } from "node:fs";
import { canViewAsset, canViewTicket, canViewWorkOrder, MAX_ATTACHMENT_BYTES } from "@tekzaya/shared";
import { Router } from "express";
import multer from "multer";
import { Types } from "mongoose";
import { AppError } from "../../middleware/errors";
import { Asset, WorkOrder } from "../../models/maintenance.models";
import { Attachment } from "../../models/support.models";
import { Ticket } from "../../models/ticket.model";
import { assetRefOf } from "../assets/asset.access";
import { workOrderRefOf } from "../workOrders/workOrder.access";
import { refOf, routeParam, type LeanTicket } from "../tickets/ticket.access";
import { pathOf, storeUpload } from "./attachments.service";

const router = Router();

// En memoria y con tope de tamaño: el archivo solo llega al disco después de
// comprobar sus bytes reales (ver `sniffMimeType`).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
});

router.post("/attachments", (req, res, next) => {
  upload.single("file")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "El archivo supera los 10 MB"
          : "No se pudo leer el archivo";
      next(new AppError(413, "file_too_large", message));
      return;
    }
    if (error) {
      next(error);
      return;
    }

    const file = req.file;
    if (!file) {
      next(new AppError(422, "validation_error", "Adjunta un archivo en el campo «file»"));
      return;
    }

    void storeUpload(file.buffer, file.originalname, res.locals.actor.id)
      .then((stored) => res.status(201).json(stored))
      .catch(next);
  });
});

/**
 * Descarga protegida: el archivo vive fuera de lo que sirve el servidor web, así
 * que el único camino hasta él pasa por esta comprobación de permisos (spec §10.4).
 */
router.get("/attachments/:id", async (req, res) => {
  const id = routeParam(req.params["id"]);
  if (!Types.ObjectId.isValid(id)) throw new AppError(404, "not_found", "Ese archivo no existe");

  const file = await Attachment.findById(id).lean();
  if (!file) throw new AppError(404, "not_found", "Ese archivo no existe");

  const actor = res.locals.actor;
  if (file.ticketId) {
    const ticket = await Ticket.findById(file.ticketId)
      .select("areaId requesterId createdById assigneeIds status")
      .lean();
    if (!ticket || !canViewTicket(actor, refOf(ticket as LeanTicket))) {
      throw new AppError(404, "not_found", "Ese archivo no existe");
    }
  } else if (file.assetId) {
    // La foto de un equipo la ve quien puede ver el equipo, nada más.
    const asset = await Asset.findById(file.assetId).select("areaId usedByAreaId custodianId").lean();
    if (!asset || !canViewAsset(actor, assetRefOf(asset))) {
      throw new AppError(404, "not_found", "Ese archivo no existe");
    }
  } else if (file.workOrderId) {
    // La factura de un costo externo es información del área, como el costo.
    const order = await WorkOrder.findById(file.workOrderId).select("areaId assigneeIds").lean();
    if (!order || !canViewWorkOrder(actor, workOrderRefOf(order))) {
      throw new AppError(404, "not_found", "Ese archivo no existe");
    }
  } else if (String(file.uploaderId) !== actor.id) {
    // Borrador todavía sin ticket: solo lo ve quien lo subió.
    throw new AppError(404, "not_found", "Ese archivo no existe");
  }

  res.type(file.mimeType!);
  res.setHeader("Content-Length", String(file.sizeBytes));
  // `inline` para previsualizar imágenes y PDF; el nombre va entre comillas por
  // si trae espacios.
  res.setHeader("Content-Disposition", `inline; filename="${file.fileName}"`);
  createReadStream(pathOf(file.storageKey!)).pipe(res);
});

export default router;
