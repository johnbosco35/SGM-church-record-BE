"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractionRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const extraction_controller_1 = require("../controllers/extraction.controller");
const helpers_1 = require("../helpers");
const rateLimit_1 = require("../middleware/rateLimit");
const registers_1 = require("../models/registers");
const define_1 = require("./define");
exports.extractionRouter = (0, express_1.Router)();
const body = zod_1.z
    .object({
    registerKey: zod_1.z.enum(registers_1.REGISTER_KEYS),
    fileIds: zod_1.z.array(helpers_1.objectIdSchema).min(1).max(30),
})
    .strict();
(0, define_1.mountRoutes)(exports.extractionRouter, "/extractions", [
    {
        method: "post",
        path: "/",
        tags: ["Extractions"],
        auth: ["admin", "parish_priest"],
        status: 201,
        middleware: [rateLimit_1.uploadLimiter],
        body,
        summary: "Run the configured OCR/AI provider over uploaded files and create DRAFT records flagged for human review. With the mock provider no real extraction occurs (response says so).",
        handler: extraction_controller_1.extractionController.create,
    },
    {
        method: "get",
        path: "/:id",
        tags: ["Extractions"],
        auth: ["admin", "parish_priest"],
        params: helpers_1.idParams,
        summary: "Extraction job status and the drafts it produced",
        handler: extraction_controller_1.extractionController.get,
    },
]);
//# sourceMappingURL=extraction.routes.js.map