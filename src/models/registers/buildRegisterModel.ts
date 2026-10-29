import mongoose, { Schema, type Model } from "mongoose";
import { RECORD_STATUSES } from "../../config/constants";
import type { FieldDef, RegisterDef } from "../../config/registerTypes";
import { buildTree } from "../../helpers";

const leafSchemaType = (f: FieldDef): unknown => {
  if (f.type === "number") return { type: Number, min: 0 };
  return { type: String, trim: true, maxlength: f.maxLength ?? 500 };
};

const PROTECTED_MESSAGE =
  "Official sacramental records cannot be deleted. Submit a correction instead; previous versions are preserved in the revision history.";

/**
 * Builds the Mongoose model for one register. Every register shares the same workflow, provenance and
 * audit fields; the register-specific columns come from the RegisterDef.
 */
export function buildRegisterModel(
  def: RegisterDef,
): Model<Record<string, unknown>> {
  const signature = def.hasPriestSignature
    ? {
        parishPriestSignature: {
          status: {
            type: String,
            enum: ["unsigned", "signed"],
            default: "unsigned",
          },
          signedBy: { type: Schema.Types.ObjectId, ref: "User" },
          signedName: String,
          signedAt: Date,
          statement: String,
        },
      }
    : {};

  const schema = new Schema(
    {
      ...buildTree(def.fields, leafSchemaType),
      ...signature,
      status: {
        type: String,
        enum: RECORD_STATUSES,
        default: "draft",
        index: true,
      },
      version: { type: Number, default: 1 },
      eventYear: { type: Number, index: true },
      duplicateKey: { type: String, index: true },
      source: {
        type: String,
        enum: ["manual", "extraction"],
        default: "manual",
      },
      sourceDocument: {
        fileId: { type: Schema.Types.ObjectId, ref: "UploadedFile" },
        page: Number,
      },
      extraction: {
        jobId: { type: Schema.Types.ObjectId, ref: "ExtractionJob" },
        provider: String,
        isMock: Boolean,
        confidence: Number,
        /** Raw values that could not be stored in their typed field. Kept for the reviewer; never discarded. */
        unparsedValues: Schema.Types.Mixed,
      },
      /** Dotted field paths a human must check. Verification is blocked while this is non-empty. */
      uncertainFields: { type: [String], default: [] },
      reviewNotes: { type: String, maxlength: 2000 },
      createdBy: { type: Schema.Types.ObjectId, ref: "User" },
      updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
      submittedBy: { type: Schema.Types.ObjectId, ref: "User" },
      submittedAt: Date,
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
      verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
      verifiedAt: Date,
    },
    { timestamps: true, collection: def.collection },
  );

  // Defence in depth: even internal code paths cannot delete official records.
  const block = (): never => {
    throw new Error(PROTECTED_MESSAGE);
  };
  schema.pre("deleteOne", { document: true, query: true }, block);
  schema.pre("deleteMany", block);
  schema.pre("findOneAndDelete", block);
  schema.pre("findOneAndReplace", block);
  schema.pre("replaceOne", block);

  if (def.fields.some((f) => f.path === "number")) schema.index({ number: 1 });
  schema.index({ createdAt: -1 });

  return (
    (mongoose.models[def.modelName] as Model<Record<string, unknown>>) ??
    mongoose.model<Record<string, unknown>>(def.modelName, schema)
  );
}
