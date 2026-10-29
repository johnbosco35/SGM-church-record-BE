"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLog = void 0;
exports.audit = audit;
const mongoose_1 = __importStar(require("mongoose"));
const http_1 = require("../middleware/http");
/** General security/operations audit trail (logins, exports, role changes, file access...). Never stores record contents. */
const schema = new mongoose_1.Schema({
    action: { type: String, required: true, index: true },
    actor: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    actorRole: String,
    targetType: String,
    targetId: String,
    ip: String,
    meta: mongoose_1.Schema.Types.Mixed,
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ createdAt: -1 });
exports.AuditLog = mongoose_1.default.models.AuditLog ?? mongoose_1.default.model("AuditLog", schema);
async function audit(req, action, extra = {}) {
    try {
        await exports.AuditLog.create({
            action,
            actor: extra.actorId ?? req?.user?.id,
            actorRole: extra.actorRole ?? req?.user?.role,
            targetType: extra.targetType,
            targetId: extra.targetId,
            ip: req?.ip,
            meta: extra.meta,
        });
    }
    catch (e) {
        // Auditing must never break the request, but failures must be visible.
        http_1.logger.error("audit write failed", {
            action,
            error: e instanceof Error ? e.message : String(e),
        });
    }
}
//# sourceMappingURL=AuditLog.js.map