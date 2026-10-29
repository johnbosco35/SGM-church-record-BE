import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    /** Server-generated name inside the private upload directory. Never derived from user input. */
    storedName: { type: String, required: true, unique: true },
    originalName: { type: String, maxlength: 255 },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true, index: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    purpose: {
      type: String,
      enum: ["register_scan"],
      default: "register_scan",
    },
  },
  { timestamps: true },
);

export const UploadedFile =
  mongoose.models.UploadedFile ?? mongoose.model("UploadedFile", schema);
