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
exports.Revision = void 0;
exports.writeRevision = writeRevision;
exports.listRevisions = listRevisions;
const mongoose_1 = __importStar(require("mongoose"));
const helpers_1 = require("../helpers");
/** Append-only history of every change to a sacramental record. Cannot be updated or deleted. */
const schema = new mongoose_1.Schema({
    registerKey: { type: String, required: true, index: true },
    recordId: { type: mongoose_1.Schema.Types.ObjectId, required: true, index: true },
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
    before: { type: mongoose_1.Schema.Types.Mixed, default: null },
    /** Full state after the change. */
    after: { type: mongoose_1.Schema.Types.Mixed, required: true },
    changedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    changedByName: String,
    changedByRole: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ registerKey: 1, recordId: 1, version: 1 });
const immutable = () => {
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
]) {
    schema.pre(hook, immutable);
}
schema.pre("save", function (next) {
    if (!this.isNew)
        return next(new Error("Revision history is append-only"));
    next();
});
exports.Revision = mongoose_1.default.models.Revision ?? mongoose_1.default.model("Revision", schema);
async function writeRevision(args) {
    await exports.Revision.create({
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
async function listRevisions(filter, page, limit) {
    const q = {};
    if (filter.registerKey)
        q.registerKey = filter.registerKey;
    if (filter.recordId)
        q.recordId = filter.recordId;
    const [items, total] = await Promise.all([
        exports.Revision.find(q)
            .sort({ createdAt: -1, version: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        exports.Revision.countDocuments(q),
    ]);
    return {
        items: items.map((r) => (0, helpers_1.serialize)(r)),
        total,
    };
}
//# sourceMappingURL=Revision.js.map