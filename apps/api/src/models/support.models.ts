import { AVAILABILITY_STATES, AWAY_REASONS, DEFAULT_SETTINGS } from "@tekzaya/shared";
import { model, Schema } from "mongoose";

// ── attachments ───────────────────────────────────────────────
const attachmentSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true },
    messageId: { type: Schema.Types.ObjectId, ref: "Message" },
    uploaderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    /** Ruta en disco, fuera del directorio público: se sirve por endpoint protegido. */
    storageKey: { type: String, required: true },
  },
  { timestamps: true },
);
attachmentSchema.index({ ticketId: 1 });

export const Attachment = model("Attachment", attachmentSchema, "attachments");

// ── notifications ─────────────────────────────────────────────
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket" },
    title: { type: String, required: true },
    body: { type: String },
    readAt: { type: Date },
  },
  { timestamps: true },
);
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = model("Notification", notificationSchema, "notifications");

// ── availability_logs ─────────────────────────────────────────
// Alimenta la medida "Días de ausencia" de los reportes (spec §11).
const availabilityLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  state: { type: String, enum: AVAILABILITY_STATES, required: true },
  reason: { type: String, enum: AWAY_REASONS },
  from: { type: Date, required: true },
  to: { type: Date },
  changedById: { type: Schema.Types.ObjectId, ref: "User" },
});
availabilityLogSchema.index({ userId: 1, from: -1 });

export const AvailabilityLog = model(
  "AvailabilityLog",
  availabilityLogSchema,
  "availability_logs",
);

// ── settings ──────────────────────────────────────────────────
// Documento único: se guarda con _id fijo para no poder duplicarlo.
export const SETTINGS_ID = "app";

const settingsSchema = new Schema(
  {
    _id: { type: String, default: SETTINGS_ID },
    slaPolicies: { type: Schema.Types.Mixed, default: () => DEFAULT_SETTINGS.slaPolicies },
    businessHours: { type: Schema.Types.Mixed, default: () => DEFAULT_SETTINGS.businessHours },
    holidays: { type: [String], default: [] },
    autoCloseResolvedDays: { type: Number, default: DEFAULT_SETTINGS.autoCloseResolvedDays },
    onHoldReminderDays: { type: Number, default: DEFAULT_SETTINGS.onHoldReminderDays },
    onHoldAutoCloseDays: { type: Number, default: DEFAULT_SETTINGS.onHoldAutoCloseDays },
    aiEnabled: { type: Schema.Types.Mixed, default: () => DEFAULT_SETTINGS.aiEnabled },
    incidentDetection: {
      type: Schema.Types.Mixed,
      default: () => DEFAULT_SETTINGS.incidentDetection,
    },
  },
  { timestamps: true, _id: false },
);

export const Settings = model("Settings", settingsSchema, "settings");
