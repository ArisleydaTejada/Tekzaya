import { AVAILABILITY_STATES, AWAY_REASONS, ROLES, USER_STATUSES } from "@tekzaya/shared";
import { model, Schema } from "mongoose";

const availabilitySchema = new Schema(
  {
    state: { type: String, enum: AVAILABILITY_STATES, default: "available" },
    reason: { type: String, enum: AWAY_REASONS },
    awayUntil: { type: Date },
    updatedById: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Ausente en las cuentas que solo entran con Google; nunca sale de la API.
    passwordHash: { type: String, select: false },
    googleId: { type: String, sparse: true },
    avatarUrl: { type: String },

    areaId: { type: Schema.Types.ObjectId, ref: "Area", required: true },

    // Rol base + banderas, en vez de multiplicar roles (spec §4.2).
    role: { type: String, enum: ROLES, default: "employee" },
    isAreaSupervisor: { type: Boolean, default: false },
    hasGlobalReadAccess: { type: Boolean, default: false },

    status: { type: String, enum: USER_STATUSES, default: "invited" },
    availability: { type: availabilitySchema, default: () => ({ state: "available" }) },

    lastLoginAt: { type: Date },
    failedLoginAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date },

    // Enlaces de invitación y de restablecimiento. Se guarda solo la huella: el
    // texto del enlace existe una vez, en la pantalla del administrador. Quien
    // lea la base no puede entrar con la cuenta de nadie (spec §10.4).
    accessTokenHash: { type: String, select: false },
    accessTokenPurpose: { type: String, enum: ["invite", "reset"] },
    accessTokenExpiresAt: { type: Date },

    disabledAt: { type: Date },
    disabledById: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

userSchema.index({ areaId: 1, status: 1 });
userSchema.index({ accessTokenHash: 1 }, { sparse: true });

export const User = model("User", userSchema, "users");
