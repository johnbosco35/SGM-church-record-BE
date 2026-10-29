import type { Request } from "express";
import mongoose, { Schema } from "mongoose";
import { logger } from "../middleware/http";

/** General security/operations audit trail (logins, exports, role changes, file access...). Never stores record contents. */
const schema = new Schema(
  {
    action: { type: String, required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: "User" },
    actorRole: String,
    targetType: String,
    targetId: String,
    ip: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ createdAt: -1 });

export const AuditLog =
  mongoose.models.AuditLog ?? mongoose.model("AuditLog", schema);

export async function audit(
  req: Request | undefined,
  action: string,
  extra: {
    targetType?: string;
    targetId?: string;
    meta?: Record<string, unknown>;
    actorId?: string;
    actorRole?: string;
  } = {},
): Promise<void> {
  try {
    await AuditLog.create({
      action,
      actor: extra.actorId ?? req?.user?.id,
      actorRole: extra.actorRole ?? req?.user?.role,
      targetType: extra.targetType,
      targetId: extra.targetId,
      ip: req?.ip,
      meta: extra.meta,
    });
  } catch (e) {
    // Auditing must never break the request, but failures must be visible.
    logger.error("audit write failed", {
      action,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
