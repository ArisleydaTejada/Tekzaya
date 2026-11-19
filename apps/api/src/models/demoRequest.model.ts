import { DEMO_MODULES } from "@tekzaya/shared";
import { model, Schema } from "mongoose";

/** Solicitudes de demo de la página pública. Se guardan aunque nadie las lea a tiempo. */
const demoRequestSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    company: { type: String, required: true, trim: true },
    module: { type: String, enum: DEMO_MODULES, required: true },
    message: { type: String },
  },
  { timestamps: true },
);
demoRequestSchema.index({ createdAt: -1 });

export const DemoRequest = model("DemoRequest", demoRequestSchema, "demo_requests");
