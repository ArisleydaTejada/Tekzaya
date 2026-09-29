import { model, Schema } from "mongoose";

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

// Las categorías van embebidas: son pocas y siempre se leen junto al área (spec §11).
const areaSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    color: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    categories: { type: [categorySchema], default: [] },
  },
  { timestamps: true },
);

export const Area = model("Area", areaSchema, "areas");
