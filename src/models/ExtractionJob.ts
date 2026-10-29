import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    registerKey: { type: String, required: true },
    files: [{ type: Schema.Types.ObjectId, ref: "UploadedFile" }],
    provider: { type: String, required: true },
    /** True when produced by the development mock. Mock output is NOT real OCR/AI extraction. */
    isMock: { type: Boolean, required: true },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
    },
    error: String,
    warnings: [String],
    createdRecordIds: [{ type: Schema.Types.ObjectId }],
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

export const ExtractionJob =
  mongoose.models.ExtractionJob ?? mongoose.model("ExtractionJob", schema);
