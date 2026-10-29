"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminEnquiryController = void 0;
exports.listEnquiries = listEnquiries;
exports.getEnquiry = getEnquiry;
exports.acknowledgeEnquiry = acknowledgeEnquiry;
exports.respondToEnquiry = respondToEnquiry;
const http_1 = require("../middleware/http");
const AdminEnquiry_1 = require("../models/AdminEnquiry");
const SupportRequest_1 = require("../models/SupportRequest");
const request_controller_1 = require("./request.controller");
async function listEnquiries(q, actor) {
    const filter = {};
    if (q.status)
        filter.status = q.status;
    if (actor.role !== "admin")
        filter.forwardedBy = actor.id; // customer care sees only their own
    const [items, total] = await Promise.all([
        AdminEnquiry_1.AdminEnquiry.find(filter)
            .sort({ createdAt: -1 })
            .skip((q.page - 1) * q.limit)
            .limit(q.limit)
            .lean(),
        AdminEnquiry_1.AdminEnquiry.countDocuments(filter),
    ]);
    return {
        items: items.map((e) => actor.role === "admin" ? (0, request_controller_1.view)(e) : (0, request_controller_1.stripAdminOnly)(e)),
        total,
    };
}
async function enquiryFor(id, actor) {
    const e = await AdminEnquiry_1.AdminEnquiry.findById(id);
    if (!e || (actor.role !== "admin" && String(e.forwardedBy) !== actor.id))
        throw http_1.AppError.notFound("Enquiry not found");
    return e;
}
async function getEnquiry(id, actor) {
    const e = await enquiryFor(id, actor);
    return actor.role === "admin"
        ? (0, request_controller_1.view)(e.toObject())
        : (0, request_controller_1.stripAdminOnly)(e.toObject());
}
async function acknowledgeEnquiry(id, actor) {
    const e = await enquiryFor(id, actor);
    if (e.status !== "pending")
        throw http_1.AppError.conflict(`Enquiry is already ${e.status}`);
    e.status = "acknowledged";
    e.acknowledgedBy = actor.id;
    e.acknowledgedAt = new Date();
    await e.save();
    const req = await SupportRequest_1.SupportRequest.findById(e.request);
    if (req && req.status === "forwarded_to_admin") {
        req.status = "awaiting_admin_response";
        (0, request_controller_1.logActivity)(req, actor, "", "admin_acknowledged", {
            fromStatus: "forwarded_to_admin",
            toStatus: "awaiting_admin_response",
        });
        await req.save();
    }
    return (0, request_controller_1.view)(e.toObject());
}
async function respondToEnquiry(id, input, actor) {
    const e = await enquiryFor(id, actor);
    const wasAnswered = e.status === "answered";
    e.response = input.response;
    e.adminInternalNotes = input.adminInternalNotes;
    e.status = "answered";
    e.respondedBy = actor.id;
    e.respondedAt = new Date();
    await e.save();
    const req = await SupportRequest_1.SupportRequest.findById(e.request);
    if (req) {
        const from = req.status;
        if (["forwarded_to_admin", "awaiting_admin_response"].includes(from))
            req.status = "response_received";
        (0, request_controller_1.logActivity)(req, actor, "", wasAnswered ? "admin_response_updated" : "admin_responded", { fromStatus: from, toStatus: req.status });
        await req.save();
    }
    return (0, request_controller_1.view)(e.toObject());
}
// ───────────── handlers ─────────────
exports.adminEnquiryController = {
    list: async (req, res) => {
        const q = req.query;
        const { items, total } = await listEnquiries(q, req.user);
        (0, http_1.paged)(res, items, q.page, q.limit, total);
    },
    get: async (req, res) => (0, http_1.ok)(res, await getEnquiry(req.params.id, req.user)),
    acknowledge: async (req, res) => (0, http_1.ok)(res, await acknowledgeEnquiry(req.params.id, req.user)),
    respond: async (req, res) => (0, http_1.ok)(res, await respondToEnquiry(req.params.id, req.body, req.user)),
};
//# sourceMappingURL=adminEnquiry.controller.js.map