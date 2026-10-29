"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicRequestResponse = exports.respondBody = exports.enquiryListQuery = exports.contactAttemptBody = exports.forwardBody = exports.staffStatusBody = exports.addNoteBody = exports.updateRequestBody = exports.requestListQuery = exports.staffEntryBody = exports.publicRequestBody = exports.requestRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const constants_1 = require("../config/constants");
const request_controller_1 = require("../controllers/request.controller");
const helpers_1 = require("../helpers");
const rateLimit_1 = require("../middleware/rateLimit");
const define_1 = require("./define");
exports.requestRouter = (0, express_1.Router)();
const care = ["customer_care", "admin"];
const tags = ["Customer-care requests"];
// ───────────── schemas (also used by the chat and admin-enquiry routes) ─────────────
const phone = zod_1.z
    .string()
    .trim()
    .regex(/^[+()\d][\d\s().-]{5,38}$/, "Enter a valid phone number");
const visitorFields = {
    visitorName: zod_1.z.string().trim().min(2).max(120),
    email: helpers_1.emailSchema.optional(),
    phone: phone.optional(),
    category: zod_1.z.enum(constants_1.REQUEST_CATEGORIES),
    summary: zod_1.z.string().trim().min(10, "Please describe your request").max(2000),
    preferredContactMethod: zod_1.z
        .enum(["email", "phone", "either"])
        .default("either"),
    consentGiven: zod_1.z.literal(true, {
        errorMap: () => ({ message: "Consent to be contacted is required" }),
    }),
};
const needsContact = (v) => Boolean(v.email || v.phone);
const contactMsg = {
    message: "Provide an email address or a phone number so we can reach you",
    path: ["email"],
};
exports.publicRequestBody = zod_1.z
    .object({
    ...visitorFields,
    /** honeypot: real users never fill this */ website: zod_1.z
        .string()
        .max(200)
        .optional(),
})
    .strict()
    .refine(needsContact, contactMsg);
exports.staffEntryBody = zod_1.z
    .object({
    ...visitorFields,
    priority: zod_1.z.enum(["low", "normal", "high", "urgent"]).default("normal"),
})
    .strict()
    .refine(needsContact, contactMsg);
exports.requestListQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    status: zod_1.z.enum(constants_1.REQUEST_STATUSES).optional(),
    category: zod_1.z.enum(constants_1.REQUEST_CATEGORIES).optional(),
    priority: zod_1.z.enum(["low", "normal", "high", "urgent"]).optional(),
    assignedTo: zod_1.z
        .union([zod_1.z.literal("me"), zod_1.z.literal("unassigned"), helpers_1.objectIdSchema])
        .optional(),
    q: zod_1.z.string().trim().max(100).optional(),
});
exports.updateRequestBody = zod_1.z
    .object({
    priority: zod_1.z.enum(["low", "normal", "high", "urgent"]),
    assignedTo: zod_1.z.union([zod_1.z.literal("me"), helpers_1.objectIdSchema, zod_1.z.null()]),
})
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field");
exports.addNoteBody = zod_1.z
    .object({ text: zod_1.z.string().trim().min(1).max(2000) })
    .strict();
/** Statuses that staff may set directly. The admin-enquiry steps and contact_attempted are set by their own endpoints. */
exports.staffStatusBody = zod_1.z
    .object({
    status: zod_1.z.enum([
        "in_review",
        "awaiting_information",
        "ready_to_contact_visitor",
        "resolved",
        "closed",
    ]),
    note: zod_1.z.string().trim().max(2000).optional(),
})
    .strict();
exports.forwardBody = zod_1.z
    .object({
    subject: zod_1.z.string().trim().min(3).max(200),
    question: zod_1.z.string().trim().min(5).max(4000),
})
    .strict();
exports.contactAttemptBody = zod_1.z
    .object({
    method: zod_1.z.enum(["email", "phone", "sms", "in_person"]),
    outcome: zod_1.z.enum([
        "reached",
        "no_answer",
        "left_message",
        "email_sent",
        "wrong_details",
        "declined",
    ]),
    note: zod_1.z.string().trim().max(2000).optional(),
})
    .strict();
exports.enquiryListQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    status: zod_1.z.enum(["pending", "acknowledged", "answered"]).optional(),
});
exports.respondBody = zod_1.z
    .object({
    response: zod_1.z.string().trim().min(2).max(4000),
    adminInternalNotes: zod_1.z.string().trim().max(4000).optional(),
})
    .strict();
exports.publicRequestResponse = zod_1.z.object({
    reference: zod_1.z.string(),
    message: zod_1.z.string(),
});
(0, define_1.mountRoutes)(exports.requestRouter, "/requests", [
    {
        method: "post",
        path: "/",
        tags: ["Public"],
        auth: "public",
        status: 201,
        middleware: [rateLimit_1.publicFormLimiter],
        summary: "Visitor submits a request (membership card, certificates, sacrament enquiries, general...). Rate limited; honeypot protected.",
        body: exports.publicRequestBody,
        response: exports.publicRequestResponse,
        handler: request_controller_1.requestController.submit,
    },
    {
        method: "post",
        path: "/staff-entry",
        tags,
        auth: care,
        status: 201,
        summary: "Staff records a request received by phone/in person (staff confirms the visitor's consent)",
        body: exports.staffEntryBody,
        handler: request_controller_1.requestController.staffEntry,
    },
    {
        method: "get",
        path: "/",
        tags,
        auth: care,
        summary: "List requests",
        query: exports.requestListQuery,
        handler: request_controller_1.requestController.list,
    },
    {
        method: "get",
        path: "/:id",
        tags,
        auth: care,
        params: helpers_1.idParams,
        summary: "Request detail with activity history, contact attempts and (for customer care) the admin response",
        handler: request_controller_1.requestController.get,
    },
    {
        method: "patch",
        path: "/:id",
        tags,
        auth: care,
        params: helpers_1.idParams,
        body: exports.updateRequestBody,
        summary: "Set priority or assignee",
        handler: request_controller_1.requestController.update,
    },
    {
        method: "post",
        path: "/:id/notes",
        tags,
        auth: care,
        params: helpers_1.idParams,
        body: exports.addNoteBody,
        status: 201,
        summary: "Add an internal staff note",
        handler: request_controller_1.requestController.addNote,
    },
    {
        method: "post",
        path: "/:id/status",
        tags,
        auth: care,
        params: helpers_1.idParams,
        body: exports.staffStatusBody,
        summary: "Move the request along its workflow (transition rules enforced)",
        handler: request_controller_1.requestController.setStatus,
    },
    {
        method: "post",
        path: "/:id/forward",
        tags,
        auth: care,
        params: helpers_1.idParams,
        body: exports.forwardBody,
        status: 201,
        summary: "Forward the request to the administrator (creates an admin enquiry)",
        handler: request_controller_1.requestController.forward,
    },
    {
        method: "post",
        path: "/:id/contact-attempts",
        tags,
        auth: care,
        params: helpers_1.idParams,
        body: exports.contactAttemptBody,
        status: 201,
        summary: "Record a contact attempt and its outcome, as reported by staff",
        handler: request_controller_1.requestController.contactAttempt,
    },
]);
//# sourceMappingURL=request.routes.js.map