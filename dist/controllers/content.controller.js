"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createContentController = createContentController;
const helpers_1 = require("../helpers");
const http_1 = require("../middleware/http");
const AuditLog_1 = require("../models/AuditLog");
const PUBLIC_SELECT = "-createdBy -updatedBy -__v";
const view = (d) => {
    const { _id, __v, ...rest } = d;
    return { id: String(_id), ...rest };
};
/**
 * Public handlers return PUBLISHED content only (unpublished ids respond 404, same as missing).
 * Management handlers are admin-only (enforced in routes). The no-delete rule applies to the seven
 * sacramental registers, not to website content.
 */
function createContentController(cfg) {
    const { model } = cfg;
    const searchFilter = (q) => {
        if (!q)
            return {};
        const rx = new RegExp((0, helpers_1.escapeRegex)(q), "i");
        return { $or: cfg.searchFields.map((f) => ({ [f]: rx })) };
    };
    const found = (doc) => {
        if (!doc)
            throw http_1.AppError.notFound();
        return doc;
    };
    return {
        list: async (req, res) => {
            const q = req.query;
            const filter = { published: true, ...searchFilter(q.q) };
            const [items, total] = await Promise.all([
                model
                    .find(filter)
                    .select(PUBLIC_SELECT)
                    .sort(cfg.sort)
                    .skip((q.page - 1) * q.limit)
                    .limit(q.limit)
                    .lean(),
                model.countDocuments(filter),
            ]);
            (0, http_1.paged)(res, items.map((i) => view(i)), q.page, q.limit, total);
        },
        manageList: async (req, res) => {
            const q = req.query;
            const filter = {
                ...searchFilter(q.q),
                ...(q.published ? { published: q.published === "true" } : {}),
            };
            const [items, total] = await Promise.all([
                model
                    .find(filter)
                    .sort(cfg.sort)
                    .skip((q.page - 1) * q.limit)
                    .limit(q.limit)
                    .lean(),
                model.countDocuments(filter),
            ]);
            (0, http_1.paged)(res, items.map((i) => view(i)), q.page, q.limit, total);
        },
        manageGet: async (req, res) => (0, http_1.ok)(res, view(found(await model.findById(req.params.id).lean()))),
        get: async (req, res) => (0, http_1.ok)(res, view(found(await model
            .findOne({ _id: req.params.id, published: true })
            .select(PUBLIC_SELECT)
            .lean()))),
        create: async (req, res) => {
            const doc = await model.create({
                ...req.body,
                published: false,
                createdBy: req.user.id,
                updatedBy: req.user.id,
            });
            (0, http_1.ok)(res, view(doc.toObject()), 201);
        },
        update: async (req, res) => {
            const doc = await model
                .findByIdAndUpdate(req.params.id, { $set: { ...req.body, updatedBy: req.user.id } }, { new: true, runValidators: true })
                .lean();
            (0, http_1.ok)(res, view(found(doc)));
        },
        publish: async (req, res) => {
            const doc = await model
                .findByIdAndUpdate(req.params.id, {
                $set: {
                    published: true,
                    publishedAt: new Date(),
                    updatedBy: req.user.id,
                },
            }, { new: true })
                .lean();
            (0, http_1.ok)(res, view(found(doc)));
        },
        unpublish: async (req, res) => {
            const doc = await model
                .findByIdAndUpdate(req.params.id, { $set: { published: false, updatedBy: req.user.id } }, { new: true })
                .lean();
            (0, http_1.ok)(res, view(found(doc)));
        },
        remove: async (req, res) => {
            found(await model.findByIdAndDelete(req.params.id).lean());
            await (0, AuditLog_1.audit)(req, "content.deleted", {
                targetType: cfg.tag,
                targetId: req.params.id,
            });
            (0, http_1.ok)(res, { deleted: true });
        },
    };
}
//# sourceMappingURL=content.controller.js.map