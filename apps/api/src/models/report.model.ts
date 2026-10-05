import { model, Schema } from "mongoose";

/**
 * Se guarda la **definición**, nunca los datos: el reporte abierto mañana refleja
 * el estado de mañana (spec §7.8.8). La gráfica entera va como `Mixed` porque su
 * forma la valida Zod en el borde (`reportWidget`), que es el único esquema que
 * frontend y backend comparten; duplicarla aquí solo daría dos sitios donde
 * equivocarse.
 *
 * El alcance guardado es lo que se **pidió**, no un permiso concedido: al abrirlo
 * se vuelve a validar contra el rol de ese momento (spec §7.8.1).
 */
const reportSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },

    scope: { type: String, required: true },
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    period: { type: String, required: true },
    from: { type: String },
    to: { type: String },
    perspective: { type: String, enum: ["agent", "requester"] },

    widgets: { type: [Schema.Types.Mixed], default: [] },
    ticketFilters: { type: Schema.Types.Mixed },
    columns: { type: [String] },
  },
  { timestamps: true },
);

// Los reportes son personales y la pestaña "Mis reportes" los lista por lo más
// reciente; el índice del spec §11 es exactamente ese par.
reportSchema.index({ ownerId: 1, updatedAt: -1 });

export const Report = model("Report", reportSchema, "reports");
