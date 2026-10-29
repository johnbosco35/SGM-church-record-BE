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
exports.buildRegisterModel = buildRegisterModel;
const mongoose_1 = __importStar(require("mongoose"));
const constants_1 = require("../../config/constants");
const helpers_1 = require("../../helpers");
const leafSchemaType = (f) => {
    if (f.type === "number")
        return { type: Number, min: 0 };
    return { type: String, trim: true, maxlength: f.maxLength ?? 500 };
};
const PROTECTED_MESSAGE = "Official sacramental records cannot be deleted. Submit a correction instead; previous versions are preserved in the revision history.";
/**
 * Builds the Mongoose model for one register. Every register shares the same workflow, provenance and
 * audit fields; the register-specific columns come from the RegisterDef.
 */
function buildRegisterModel(def) {
    const signature = def.hasPriestSignature
        ? {
            parishPriestSignature: {
                status: {
                    type: String,
                    enum: ["unsigned", "signed"],
                    default: "unsigned",
                },
                signedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
                signedName: String,
                signedAt: Date,
                statement: String,
            },
        }
        : {};
    const schema = new mongoose_1.Schema({
        ...(0, helpers_1.buildTree)(def.fields, leafSchemaType),
        ...signature,
        status: {
            type: String,
            enum: constants_1.RECORD_STATUSES,
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
            fileId: { type: mongoose_1.Schema.Types.ObjectId, ref: "UploadedFile" },
            page: Number,
        },
        extraction: {
            jobId: { type: mongoose_1.Schema.Types.ObjectId, ref: "ExtractionJob" },
            provider: String,
            isMock: Boolean,
            confidence: Number,
            /** Raw values that could not be stored in their typed field. Kept for the reviewer; never discarded. */
            unparsedValues: mongoose_1.Schema.Types.Mixed,
        },
        /** Dotted field paths a human must check. Verification is blocked while this is non-empty. */
        uncertainFields: { type: [String], default: [] },
        reviewNotes: { type: String, maxlength: 2000 },
        createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
        updatedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
        submittedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
        submittedAt: Date,
        reviewedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
        reviewedAt: Date,
        verifiedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
        verifiedAt: Date,
    }, { timestamps: true, collection: def.collection });
    // Defence in depth: even internal code paths cannot delete official records.
    const block = () => {
        throw new Error(PROTECTED_MESSAGE);
    };
    schema.pre("deleteOne", { document: true, query: true }, block);
    schema.pre("deleteMany", block);
    schema.pre("findOneAndDelete", block);
    schema.pre("findOneAndReplace", block);
    schema.pre("replaceOne", block);
    if (def.fields.some((f) => f.path === "number"))
        schema.index({ number: 1 });
    schema.index({ createdAt: -1 });
    return (mongoose_1.default.models[def.modelName] ??
        mongoose_1.default.model(def.modelName, schema));
}
//# sourceMappingURL=buildRegisterModel.js.map