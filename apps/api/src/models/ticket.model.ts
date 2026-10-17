import { PRIORITIES, TICKET_STATUSES } from "@tekzaya/shared";
import { model, Schema } from "mongoose";

const slaSchema = new Schema(
  {
    responseDueAt: { type: Date, required: true },
    resolutionDueAt: { type: Date, required: true },
    // Instante en que el ticket pasa a "En riesgo". Se precalcula para que el estado
    // del SLA sea una comparación de fechas y no un cálculo por cada lectura.
    responseRiskAt: { type: Date, required: true },
    resolutionRiskAt: { type: Date, required: true },

    firstResponseAt: { type: Date },
    firstResponderId: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    resolvedByIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    closedAt: { type: Date },

    /** Inicio de la pausa en curso, mientras el ticket está "En espera". */
    onHoldSince: { type: Date },
    /** Tiempo laborable acumulado en pausa. */
    pausedMs: { type: Number, default: 0 },

    responseBreached: { type: Boolean, default: false },
    resolutionBreached: { type: Boolean, default: false },

    // Marcas de "ya se avisó": el job corre cada pocos minutos y sin ellas
    // repetiría la misma notificación hasta que alguien atendiera el ticket.
    riskNotifiedAt: { type: Date },
    breachNotifiedAt: { type: Date },
    onHoldReminderAt: { type: Date },
  },
  { _id: false },
);

const aiSchema = new Schema(
  {
    suggestedAreaId: { type: Schema.Types.ObjectId, ref: "Area" },
    areaConfidence: { type: Number },
    suggestedPriority: { type: String, enum: PRIORITIES },
    suggestedCategoryId: { type: Schema.Types.ObjectId },
    rationale: { type: String },
    classificationStatus: {
      type: String,
      enum: ["pending", "done", "failed"],
      default: "pending",
    },
    incident: {
      groupId: { type: String },
      label: { type: String },
      confidence: { type: Number },
      status: { type: String, enum: ["detected", "dismissed"] },
    },
    summary: { type: String },
    summaryUpdatedAt: { type: Date },
    /** Mensajes que tenía la conversación al generarlo; a los 3 nuevos, caduca. */
    summaryMessageCount: { type: Number },
  },
  { _id: false },
);

const ticketSchema = new Schema(
  {
    number: { type: Number, required: true, unique: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },

    requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },
    categoryId: { type: Schema.Types.ObjectId },
    assigneeIds: [{ type: Schema.Types.ObjectId, ref: "User" }],

    // Módulo 2: el equipo afectado y las órdenes de trabajo que salieron del
    // ticket. Vincular un equipo no es registrar una falla: la falla nace con la
    // OT correctiva (plan A2).
    assetId: { type: Schema.Types.ObjectId, ref: "Asset" },
    workOrderIds: [{ type: Schema.Types.ObjectId, ref: "WorkOrder" }],

    status: { type: String, enum: TICKET_STATUSES, default: "open" },
    priority: { type: String, enum: PRIORITIES, default: "medium" },

    mergedIntoId: { type: Schema.Types.ObjectId, ref: "Ticket" },
    mergedTicketIds: [{ type: Schema.Types.ObjectId, ref: "Ticket" }],
    additionalRequesterIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    mergedAt: { type: Date },
    mergedById: { type: Schema.Types.ObjectId, ref: "User" },

    ai: { type: aiSchema, default: () => ({}) },
    sla: { type: slaSchema, required: true },

    csat: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String },
      answeredAt: { type: Date },
    },

    attachmentsCount: { type: Number, default: 0 },
    lastActivityAt: { type: Date, required: true },
    lastPublicReplyAt: { type: Date },

    stats: {
      reopenCount: { type: Number, default: 0 },
      transferCount: { type: Number, default: 0 },
      publicMessageCount: { type: Number, default: 0 },
      internalMessageCount: { type: Number, default: 0 },
      priorityChangedByHuman: { type: Boolean, default: false },
      joinRequestCount: { type: Number, default: 0 },
    },

    // Permite reconstruir el backlog en cualquier fecha pasada y atribuir el
    // trabajo en los reportes (spec §11).
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: TICKET_STATUSES },
        at: { type: Date },
        byId: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],
    assigneeHistory: [
      {
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        from: { type: Date },
        to: { type: Date },
      },
    ],
  },
  { timestamps: true },
);

ticketSchema.index({ areaId: 1, status: 1 });
ticketSchema.index({ assigneeIds: 1, status: 1 });
ticketSchema.index({ requesterId: 1, createdAt: -1 });
ticketSchema.index({ createdById: 1, createdAt: -1 });
ticketSchema.index({ areaId: 1, createdAt: -1 });
ticketSchema.index({ areaId: 1, "sla.resolvedAt": -1 });
ticketSchema.index({ status: 1, "sla.resolutionDueAt": 1 });
ticketSchema.index({ title: "text", description: "text" });
ticketSchema.index({ assetId: 1, createdAt: -1 }, { sparse: true });

export const Ticket = model("Ticket", ticketSchema, "tickets");
