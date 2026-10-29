"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revisionRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const revision_controller_1 = require("../controllers/revision.controller");
const helpers_1 = require("../helpers");
const registers_1 = require("../models/registers");
const define_1 = require("./define");
exports.revisionRouter = (0, express_1.Router)();
const query = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    registerKey: zod_1.z.enum(registers_1.REGISTER_KEYS).optional(),
    recordId: helpers_1.objectIdSchema.optional(),
});
(0, define_1.mountRoutes)(exports.revisionRouter, "/revisions", [
    {
        method: "get",
        path: "/",
        tags: ["Revisions"],
        auth: ["admin", "parish_priest"],
        query,
        summary: "Revision history across registers (append-only audit trail), filterable by register and record",
        handler: revision_controller_1.revisionController.list,
    },
    {
        method: "get",
        path: "/:id",
        tags: ["Revisions"],
        auth: ["admin", "parish_priest"],
        params: helpers_1.idParams,
        summary: "One revision including before/after snapshots",
        handler: revision_controller_1.revisionController.get,
    },
]);
//# sourceMappingURL=revision.routes.js.map