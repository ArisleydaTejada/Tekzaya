import { MESSAGE_TYPES } from "@tekzaya/shared";
import { model, Schema } from "mongoose";

// Colección aparte para no hacer crecer el documento del ticket (spec §11).
const messageSchema = new Schema(
  {
    ticketId: { type: Schema.Types.ObjectId, ref: "Ticket", required: true },
    // Ausente en los mensajes de sistema.
    authorId: { type: Schema.Types.ObjectId, ref: "User" },
    type: { type: String, enum: MESSAGE_TYPES, required: true },
    body: { type: String, default: "" },
    mentions: [{ type: Schema.Types.ObjectId, ref: "User" }],
    attachments: [{ type: Schema.Types.ObjectId, ref: "Attachment" }],
    systemEvent: {
      kind: { type: String },
      from: { type: String },
      to: { type: String },
      reason: { type: String },
    },
  },
  { timestamps: true },
);

messageSchema.index({ ticketId: 1, createdAt: 1 });

export const Message = model("Message", messageSchema, "messages");
