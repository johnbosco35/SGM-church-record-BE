import mongoose, { Schema } from "mongoose";
import { serialize } from "../helpers";
import type { AuthUser } from "../middleware/auth";

/** Append-only history of every change to a sacramental record. Cannot be updated or deleted. */
const schema = new Schema(
  {
    registerKey: { type: String, required: true, index: true },
    recordId: { type: Schema.Types.ObjectId, required: true, index: true },
    version: { type: Number, required: true },
    action: {
      type: String,
      enum: [
        "create",
        "update",
        "submit",
        "request_correction",
        "verify",
        "sign",
        "signature_reset",
        "extraction_create",
      ],
      required: true,
    },
    reason: { type: String, maxlength: 2000 },
    changedPaths: { type: [String], default: [] },
    /** Full state before the change (null for creation). Preserves the previous version. */
    before: { type: Schema.Types.Mixed, default: null },
    /** Full state after the change. */
    after: { type: Schema.Types.Mixed, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    changedByName: String,
    changedByRole: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ registerKey: 1, recordId: 1, version: 1 });

const immutable = (): never => {
  throw new Error("Revision history is append-only");
};
for (const hook of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "findOneAndReplace",
  "replaceOne",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const) {
  schema.pre(hook, immutable);
}
schema.pre("save", function (next) {
  if (!this.isNew) return next(new Error("Revision history is append-only"));
  next();
});

export const Revision =
  mongoose.models.Revision ?? mongoose.model("Revision", schema);

export async function writeRevision(args: {
  registerKey: string;
  recordId: unknown;
  version: number;
  action:
    | "create"
    | "update"
    | "submit"
    | "request_correction"
    | "verify"
    | "sign"
    | "signature_reset"
    | "extraction_create";
  actor: AuthUser;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  changedPaths?: string[];
  reason?: string;
}): Promise<void> {
  await Revision.create({
    registerKey: args.registerKey,
    recordId: args.recordId,
    version: args.version,
    action: args.action,
    reason: args.reason,
    changedPaths: args.changedPaths ?? [],
    before: args.before,
    after: args.after,
    changedBy: args.actor.id,
    changedByName: args.actor.name,
    changedByRole: args.actor.role,
  });
}

export async function listRevisions(
  filter: { registerKey?: string; recordId?: string },
  page: number,
  limit: number,
) {
  const q: Record<string, unknown> = {};
  if (filter.registerKey) q.registerKey = filter.registerKey;
  if (filter.recordId) q.recordId = filter.recordId;
  const [items, total] = await Promise.all([
    Revision.find(q)
      .sort({ createdAt: -1, version: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Revision.countDocuments(q),
  ]);
  return {
    items: items.map((r: Record<string, unknown>) => serialize(r)),
    total,
  };
}
