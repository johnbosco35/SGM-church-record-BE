import mongoose, { Schema } from "mongoose";
import { REQUEST_CATEGORIES, REQUEST_STATUSES } from "../config/constants";

const activity = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    byLabel: String, // staff name, or "visitor" / "system"
    action: { type: String, required: true },
    fromStatus: String,
    toStatus: String,
    note: { type: String, maxlength: 2000 },
  },
  { _id: false },
);

/** Contact attempts are recorded by staff. The system never asserts that an email/call happened on its own. */
const contactAttempt = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    method: {
      type: String,
      enum: ["email", "phone", "sms", "in_person"],
      required: true,
    },
    outcome: {
      type: String,
      enum: [
        "reached",
        "no_answer",
        "left_message",
        "email_sent",
        "wrong_details",
        "declined",
      ],
      required: true,
    },
    note: { type: String, maxlength: 2000 },
    confirmedByStaff: { type: Boolean, default: true },
  },
  { _id: false },
);

const internalNote = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    byName: String,
    text: { type: String, maxlength: 2000 },
  },
  { _id: false },
);

const schema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    visitorName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 40 },
    category: {
      type: String,
      enum: REQUEST_CATEGORIES,
      required: true,
      index: true,
    },
    summary: { type: String, required: true, maxlength: 2000 },
    source: {
      type: String,
      enum: ["website_form", "chatbot", "staff_entry"],
      default: "website_form",
    },
    preferredContactMethod: {
      type: String,
      enum: ["email", "phone", "either"],
      default: "either",
    },
    consentGiven: { type: Boolean, required: true },
    consentAt: Date,
    priority: {
      type: String,
      enum: ["low", "normal", "high", "urgent"],
      default: "normal",
      index: true,
    },
    status: {
      type: String,
      enum: REQUEST_STATUSES,
      default: "new",
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", index: true },
    internalNotes: { type: [internalNote], default: [] },
    activity: { type: [activity], default: [] },
    contactAttempts: { type: [contactAttempt], default: [] },
    adminEnquiry: { type: Schema.Types.ObjectId, ref: "AdminEnquiry" },
    resolvedAt: Date,
    closedAt: Date,
  },
  { timestamps: true },
);
schema.index({ createdAt: -1 });

export const SupportRequest =
  mongoose.models.SupportRequest ?? mongoose.model("SupportRequest", schema);
