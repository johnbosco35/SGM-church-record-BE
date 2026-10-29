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
exports.AdminEnquiry = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const schema = new mongoose_1.Schema({
    request: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "SupportRequest",
        required: true,
        index: true,
    },
    reference: { type: String, required: true },
    subject: { type: String, required: true, maxlength: 200 },
    question: { type: String, required: true, maxlength: 4000 },
    forwardedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
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
    acknowledgedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    acknowledgedAt: Date,
    /** Visible to the forwarding customer-care staff member. */
    response: { type: String, maxlength: 4000 },
    respondedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    respondedAt: Date,
    /** Admin-only. Never returned to customer care. */
    adminInternalNotes: { type: String, maxlength: 4000 },
}, { timestamps: true });
exports.AdminEnquiry = mongoose_1.default.models.AdminEnquiry ?? mongoose_1.default.model("AdminEnquiry", schema);
//# sourceMappingURL=AdminEnquiry.js.map