"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestController = exports.stripAdminOnly = exports.view = void 0;
exports.logActivity = logActivity;
exports.createRequest = createRequest;
exports.listRequests = listRequests;
exports.getRequest = getRequest;
exports.updateRequest = updateRequest;
exports.addNote = addNote;
exports.setStatus = setStatus;
exports.forwardToAdmin = forwardToAdmin;
exports.recordContactAttempt = recordContactAttempt;
const node_crypto_1 = __importDefault(require("node:crypto"));
const constants_1 = require("../config/constants");
const helpers_1 = require("../helpers");
const http_1 = require("../middleware/http");
const AdminEnquiry_1 = require("../models/AdminEnquiry");
const SupportRequest_1 = require("../models/SupportRequest");
const User_1 = require("../models/User");
const view = (d) => {
    const { _id, __v, ...rest } = d;
    return { id: String(_id), ...rest };
};
exports.view = view;
const stripAdminOnly = (e) => {
    const { adminInternalNotes: _drop, ...rest } = (0, exports.view)(e);
    return rest;
};
exports.stripAdminOnly = stripAdminOnly;
function newReference() {
    const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `REQ-${d}-${node_crypto_1.default.randomBytes(3).toString("hex").toUpperCase()}`;
}
function logActivity(doc, by, label, action, extra = {}) {
    doc.activity.push({
        at: new Date(),
        by: by?.id,
        byLabel: by ? by.name : label,
        action,
        ...extra,
    });
}
async function createRequest(input, origin) {
    const { website: _honeypot, ...fields } = input;
    const priority = fields.priority ??
        (fields.category === "sick_call_assistance" ? "high" : "normal");
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const doc = new SupportRequest_1.SupportRequest({
                ...fields,
                priority,
                source: origin.source,
                reference: newReference(),
                consentAt: new Date(),
                status: "new",
            });
            logActivity(doc, origin.staff ?? null, origin.source === "chatbot" ? "chatbot visitor" : "visitor", "request_submitted", { toStatus: "new" });
            await doc.save();
            return doc;
        }
        catch (e) {
            if (e.code !== 11000)
                throw e; // reference collision: retry
        }
    }
    throw new http_1.AppError(500, "REFERENCE_FAILED", "Could not allocate a request reference");
}
async function listRequests(q, actor) {
    const filter = {};
    for (const k of ["status", "category", "priority"])
        if (q[k])
            filter[k] = q[k];
    if (q.assignedTo === "me")
        filter.assignedTo = actor.id;
    else if (q.assignedTo === "unassigned")
        filter.assignedTo = null;
    else if (q.assignedTo)
        filter.assignedTo = q.assignedTo;
    if (q.q) {
        const rx = new RegExp((0, helpers_1.escapeRegex)(String(q.q)), "i");
        filter.$or = [{ visitorName: rx }, { reference: rx }, { email: rx }];
    }
    const [items, total] = await Promise.all([
        SupportRequest_1.SupportRequest.find(filter)
            .sort({ createdAt: -1 })
            .skip((q.page - 1) * q.limit)
            .limit(q.limit)
            .select("-activity -internalNotes -contactAttempts")
            .lean(),
        SupportRequest_1.SupportRequest.countDocuments(filter),
    ]);
    return { items: items.map((i) => (0, exports.view)(i)), total };
}
async function mustFind(id) {
    const doc = await SupportRequest_1.SupportRequest.findById(id);
    if (!doc)
        throw http_1.AppError.notFound("Request not found");
    return doc;
}
async function getRequest(id, actor) {
    const doc = await mustFind(id);
    const enquiry = doc.adminEnquiry
        ? await AdminEnquiry_1.AdminEnquiry.findById(doc.adminEnquiry).lean()
        : null;
    return {
        ...(0, exports.view)(doc.toObject()),
        adminEnquiry: enquiry
            ? actor.role === "admin"
                ? (0, exports.view)(enquiry)
                : (0, exports.stripAdminOnly)(enquiry)
            : null,
    };
}
async function updateRequest(id, patch, actor) {
    const doc = await mustFind(id);
    if (patch.priority) {
        doc.priority = patch.priority;
        logActivity(doc, actor, "", "priority_changed", { note: patch.priority });
    }
    if (patch.assignedTo !== undefined) {
        const target = patch.assignedTo === "me" ? actor.id : patch.assignedTo;
        if (target) {
            const u = await User_1.User.findById(target).lean();
            if (!u || !u.isActive || !["customer_care", "admin"].includes(u.role))
                throw http_1.AppError.unprocessable("INVALID_ASSIGNEE", "Assignee must be an active customer-care or admin user");
        }
        doc.assignedTo = target ?? undefined;
        logActivity(doc, actor, "", target ? "assigned" : "unassigned", {
            note: target ? String(target) : undefined,
        });
    }
    await doc.save();
    return (0, exports.view)(doc.toObject());
}
async function addNote(id, text, actor) {
    const doc = await mustFind(id);
    doc.internalNotes.push({
        at: new Date(),
        by: actor.id,
        byName: actor.name,
        text,
    });
    logActivity(doc, actor, "", "note_added");
    await doc.save();
    return (0, exports.view)(doc.toObject());
}
async function setStatus(id, status, note, actor) {
    const doc = await mustFind(id);
    const from = doc.status;
    if (!constants_1.REQUEST_TRANSITIONS[from].includes(status)) {
        throw http_1.AppError.unprocessable("INVALID_TRANSITION", `Cannot move a request from "${from}" to "${status}"`, { allowed: constants_1.REQUEST_TRANSITIONS[from] });
    }
    doc.status = status;
    if (status === "resolved")
        doc.resolvedAt = new Date();
    if (status === "closed")
        doc.closedAt = new Date();
    logActivity(doc, actor, "", "status_changed", {
        fromStatus: from,
        toStatus: status,
        note,
    });
    await doc.save();
    return (0, exports.view)(doc.toObject());
}
async function forwardToAdmin(id, input, actor) {
    const doc = await mustFind(id);
    if (!["in_review", "awaiting_information", "response_received"].includes(doc.status)) {
        throw http_1.AppError.unprocessable("INVALID_TRANSITION", "Only requests that are in review can be forwarded to the administrator");
    }
    const enquiry = await AdminEnquiry_1.AdminEnquiry.create({
        request: doc._id,
        reference: doc.reference,
        subject: input.subject,
        question: input.question,
        forwardedBy: actor.id,
    });
    const from = doc.status;
    doc.adminEnquiry = enquiry._id;
    doc.status = "forwarded_to_admin";
    logActivity(doc, actor, "", "forwarded_to_admin", {
        fromStatus: from,
        toStatus: "forwarded_to_admin",
    });
    await doc.save();
    return (0, exports.stripAdminOnly)(enquiry.toObject());
}
async function recordContactAttempt(id, input, actor) {
    const doc = await mustFind(id);
    if (!["ready_to_contact_visitor", "contact_attempted"].includes(doc.status)) {
        throw http_1.AppError.unprocessable("INVALID_TRANSITION", 'Mark the request "ready_to_contact_visitor" before recording contact attempts');
    }
    const from = doc.status;
    // Recorded exactly as reported by staff; the system does not send email or place calls itself.
    doc.contactAttempts.push({
        at: new Date(),
        by: actor.id,
        ...input,
        confirmedByStaff: true,
    });
    doc.status = "contact_attempted";
    logActivity(doc, actor, "", "contact_attempt_recorded", {
        fromStatus: from,
        toStatus: "contact_attempted",
        note: `${input.method}: ${input.outcome}`,
    });
    await doc.save();
    return (0, exports.view)(doc.toObject());
}
// ───────────── handlers ─────────────
exports.requestController = {
    /** Public visitor submission. */
    submit: async (req, res) => {
        if (req.body.website) {
            // bot trap: pretend success, store nothing
            (0, http_1.ok)(res, {
                reference: "REQ-RECEIVED",
                message: "Thank you. Your request has been received.",
            }, 201);
            return;
        }
        const doc = await createRequest(req.body, { source: "website_form" });
        (0, http_1.ok)(res, {
            reference: doc.reference,
            message: "Thank you. Your request has been received and a member of our team will contact you. For urgent sick calls please contact the parish office directly.",
        }, 201);
    },
    staffEntry: async (req, res) => {
        const doc = await createRequest(req.body, {
            source: "staff_entry",
            staff: req.user,
        });
        (0, http_1.ok)(res, await getRequest(String(doc._id), req.user), 201);
    },
    list: async (req, res) => {
        const q = req.query;
        const { items, total } = await listRequests(req.query, req.user);
        (0, http_1.paged)(res, items, q.page, q.limit, total);
    },
    get: async (req, res) => (0, http_1.ok)(res, await getRequest(req.params.id, req.user)),
    update: async (req, res) => (0, http_1.ok)(res, await updateRequest(req.params.id, req.body, req.user)),
    addNote: async (req, res) => (0, http_1.ok)(res, await addNote(req.params.id, req.body.text, req.user), 201),
    setStatus: async (req, res) => (0, http_1.ok)(res, await setStatus(req.params.id, req.body.status, req.body.note, req.user)),
    forward: async (req, res) => (0, http_1.ok)(res, await forwardToAdmin(req.params.id, req.body, req.user), 201),
    contactAttempt: async (req, res) => (0, http_1.ok)(res, await recordContactAttempt(req.params.id, req.body, req.user), 201),
};
//# sourceMappingURL=request.controller.js.map