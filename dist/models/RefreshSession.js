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
exports.RefreshSession = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const schema = new mongoose_1.Schema({
    user: {
        type: mongoose_1.Schema.Types.ObjectId,
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
}, { timestamps: true });
// Mongo removes expired sessions automatically.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
exports.RefreshSession = mongoose_1.default.models.RefreshSession ?? mongoose_1.default.model("RefreshSession", schema);
//# sourceMappingURL=RefreshSession.js.map