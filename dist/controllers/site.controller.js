"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageController = exports.donationController = exports.settingsController = void 0;
const http_1 = require("../middleware/http");
const AuditLog_1 = require("../models/AuditLog");
const content_1 = require("../models/content");
const view = (d) => {
    const { _id, __v, ...rest } = d;
    return { id: String(_id), ...rest };
};
const found = (doc) => {
    if (!doc)
        throw http_1.AppError.notFound();
    return doc;
};
const pageOf = (req) => req.query;
exports.settingsController = {
    get: async (_req, res) => {
        const s = await content_1.WebsiteSettings.findOne({ key: "singleton" })
            .select("-updatedBy -__v -key")
            .lean();
        (0, http_1.ok)(res, s ? view(s) : {});
    },
    update: async (req, res) => {
        const s = await content_1.WebsiteSettings.findOneAndUpdate({ key: "singleton" }, { $set: { ...req.body, updatedBy: req.user.id } }, {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
        }).lean();
        await (0, AuditLog_1.audit)(req, "settings.updated");
        (0, http_1.ok)(res, view(s));
    },
};
/** Donation RECORDS only: no payment is processed and none is claimed. */
exports.donationController = {
    create: async (req, res) => {
        const d = await content_1.Donation.create({
            ...req.body,
            isDemo: true,
            paymentStatus: "not_processed",
        });
        (0, http_1.ok)(res, {
            id: String(d._id),
            paymentStatus: "not_processed",
            isDemo: true,
            message: "Your donation intention has been recorded. No payment has been processed. The parish office will advise how to give.",
        }, 201);
    },
    list: async (req, res) => {
        const q = pageOf(req);
        const [items, total] = await Promise.all([
            content_1.Donation.find()
                .sort({ createdAt: -1 })
                .skip((q.page - 1) * q.limit)
                .limit(q.limit)
                .lean(),
            content_1.Donation.countDocuments(),
        ]);
        (0, http_1.paged)(res, items.map((i) => view(i)), q.page, q.limit, total);
    },
    get: async (req, res) => (0, http_1.ok)(res, view(found(await content_1.Donation.findById(req.params.id).lean()))),
    addNote: async (req, res) => (0, http_1.ok)(res, view(found(await content_1.Donation.findByIdAndUpdate(req.params.id, { $set: { adminNote: req.body.adminNote } }, { new: true }).lean()))),
};
exports.messageController = {
    create: async (req, res) => {
        const { website, ...data } = req.body;
        if (!website)
            await content_1.Message.create(data); // honeypot: silently drop bot submissions
        (0, http_1.ok)(res, { message: "Thank you. Your message has been received." }, 201);
    },
    list: async (req, res) => {
        const q = pageOf(req);
        const filter = q.status ? { status: q.status } : {};
        const [items, total] = await Promise.all([
            content_1.Message.find(filter)
                .sort({ createdAt: -1 })
                .skip((q.page - 1) * q.limit)
                .limit(q.limit)
                .lean(),
            content_1.Message.countDocuments(filter),
        ]);
        (0, http_1.paged)(res, items.map((i) => view(i)), q.page, q.limit, total);
    },
    get: async (req, res) => (0, http_1.ok)(res, view(found(await content_1.Message.findById(req.params.id).lean()))),
    setStatus: async (req, res) => (0, http_1.ok)(res, view(found(await content_1.Message.findByIdAndUpdate(req.params.id, { $set: { status: req.body.status } }, { new: true }).lean()))),
    remove: async (req, res) => {
        found(await content_1.Message.findByIdAndDelete(req.params.id).lean());
        (0, http_1.ok)(res, { deleted: true });
    },
};
//# sourceMappingURL=site.controller.js.map