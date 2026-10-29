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
exports.SupportRequest = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const constants_1 = require("../config/constants");
const activity = new mongoose_1.Schema({
    at: { type: Date, default: Date.now },
    by: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    byLabel: String, // staff name, or "visitor" / "system"
    action: { type: String, required: true },
    fromStatus: String,
    toStatus: String,
    note: { type: String, maxlength: 2000 },
}, { _id: false });
/** Contact attempts are recorded by staff. The system never asserts that an email/call happened on its own. */
const contactAttempt = new mongoose_1.Schema({
    at: { type: Date, default: Date.now },
    by: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
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
}, { _id: false });
const internalNote = new mongoose_1.Schema({
    at: { type: Date, default: Date.now },
    by: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    byName: String,
    text: { type: String, maxlength: 2000 },
}, { _id: false });
const schema = new mongoose_1.Schema({
    reference: { type: String, required: true, unique: true },
    visitorName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, lowercase: true, trim: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 40 },
    category: {
        type: String,
        enum: constants_1.REQUEST_CATEGORIES,
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
        enum: constants_1.REQUEST_STATUSES,
        default: "new",
        index: true,
    },
    assignedTo: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", index: true },
    internalNotes: { type: [internalNote], default: [] },
    activity: { type: [activity], default: [] },
    contactAttempts: { type: [contactAttempt], default: [] },
    adminEnquiry: { type: mongoose_1.Schema.Types.ObjectId, ref: "AdminEnquiry" },
    resolvedAt: Date,
    closedAt: Date,
}, { timestamps: true });
schema.index({ createdAt: -1 });
exports.SupportRequest = mongoose_1.default.models.SupportRequest ?? mongoose_1.default.model("SupportRequest", schema);
//# sourceMappingURL=SupportRequest.js.map