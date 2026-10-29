import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    /** SHA-256 of the opaque refresh token. The raw token is never stored. */
    tokenHash: { type: String, required: true, unique: true },
    /** All tokens descended from one login share a family; reuse of a rotated token revokes the family. */
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: String,
    replacedByHash: String,
    ip: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);
// Mongo removes expired sessions automatically.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession =
  mongoose.models.RefreshSession ?? mongoose.model("RefreshSession", schema);
