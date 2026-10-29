"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revisionController = void 0;
const helpers_1 = require("../helpers");
const http_1 = require("../middleware/http");
const Revision_1 = require("../models/Revision");
exports.revisionController = {
    list: async (req, res) => {
        const q = req.query;
        const { items, total } = await (0, Revision_1.listRevisions)({ registerKey: q.registerKey, recordId: q.recordId }, q.page, q.limit);
        (0, http_1.paged)(res, items, q.page, q.limit, total);
    },
    get: async (req, res) => {
        const r = await Revision_1.Revision.findById(req.params.id).lean();
        if (!r)
            throw http_1.AppError.notFound("Revision not found");
        (0, http_1.ok)(res, (0, helpers_1.serialize)(r));
    },
};
//# sourceMappingURL=revision.controller.js.map