import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    request: {
      type: Schema.Types.ObjectId,
      ref: "SupportRequest",
      required: true,
      index: true,
    },
    reference: { type: String, required: true },
    subject: { type: String, required: true, maxlength: 200 },
    question: { type: String, required: true, maxlength: 4000 },
    forwardedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    forwardedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["pending", "acknowledged", "answered"],
      default: "pending",
      index: true,
    },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: Date,
    /** Visible to the forwarding customer-care staff member. */
    response: { type: String, maxlength: 4000 },
    respondedBy: { type: Schema.Types.ObjectId, ref: "User" },
    respondedAt: Date,
    /** Admin-only. Never returned to customer care. */
    adminInternalNotes: { type: String, maxlength: 4000 },
  },
  { timestamps: true },
);

export const AdminEnquiry =
  mongoose.models.AdminEnquiry ?? mongoose.model("AdminEnquiry", schema);
