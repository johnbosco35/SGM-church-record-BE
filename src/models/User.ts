import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { ROLES } from "../config/constants";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: "member" },
    isActive: { type: Boolean, default: true },
    /** Incremented on password/role/active changes; invalidates every outstanding access token. */
    tokenVersion: { type: Number, default: 0 },
    failedLoginCount: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    lastLoginAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = mongoose.models.User ?? mongoose.model("User", userSchema);
