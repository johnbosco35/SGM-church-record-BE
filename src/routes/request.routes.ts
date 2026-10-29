import { Router } from "express";
import { z } from "zod";
import { REQUEST_CATEGORIES, REQUEST_STATUSES } from "../config/constants";
import { requestController as c } from "../controllers/request.controller";
import { emailSchema, idParams, objectIdSchema } from "../helpers";
import { publicFormLimiter } from "../middleware/rateLimit";
import { mountRoutes } from "./define";

export const requestRouter = Router();
const care = ["customer_care", "admin"] as const;
const tags = ["Customer-care requests"];

// ───────────── schemas (also used by the chat and admin-enquiry routes) ─────────────
const phone = z
  .string()
  .trim()
  .regex(/^[+()\d][\d\s().-]{5,38}$/, "Enter a valid phone number");

const visitorFields = {
  visitorName: z.string().trim().min(2).max(120),
  email: emailSchema.optional(),
  phone: phone.optional(),
  category: z.enum(REQUEST_CATEGORIES),
  summary: z.string().trim().min(10, "Please describe your request").max(2000),
  preferredContactMethod: z
    .enum(["email", "phone", "either"])
    .default("either"),
  consentGiven: z.literal(true, {
    errorMap: () => ({ message: "Consent to be contacted is required" }),
  }),
};
const needsContact = (v: { email?: string; phone?: string }) =>
  Boolean(v.email || v.phone);
const contactMsg = {
  message: "Provide an email address or a phone number so we can reach you",
  path: ["email"],
};

export const publicRequestBody = z
  .object({
    ...visitorFields,
    /** honeypot: real users never fill this */ website: z
      .string()
      .max(200)
      .optional(),
  })
  .strict()
  .refine(needsContact, contactMsg);

export const staffEntryBody = z
  .object({
    ...visitorFields,
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  })
  .strict()
  .refine(needsContact, contactMsg);

export const requestListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(REQUEST_STATUSES).optional(),
  category: z.enum(REQUEST_CATEGORIES).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedTo: z
    .union([z.literal("me"), z.literal("unassigned"), objectIdSchema])
    .optional(),
  q: z.string().trim().max(100).optional(),
});

export const updateRequestBody = z
  .object({
    priority: z.enum(["low", "normal", "high", "urgent"]),
    assignedTo: z.union([z.literal("me"), objectIdSchema, z.null()]),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");

export const addNoteBody = z
  .object({ text: z.string().trim().min(1).max(2000) })
  .strict();

/** Statuses that staff may set directly. The admin-enquiry steps and contact_attempted are set by their own endpoints. */
export const staffStatusBody = z
  .object({
    status: z.enum([
      "in_review",
      "awaiting_information",
      "ready_to_contact_visitor",
      "resolved",
      "closed",
    ]),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export const forwardBody = z
  .object({
    subject: z.string().trim().min(3).max(200),
    question: z.string().trim().min(5).max(4000),
  })
  .strict();

export const contactAttemptBody = z
  .object({
    method: z.enum(["email", "phone", "sms", "in_person"]),
    outcome: z.enum([
      "reached",
      "no_answer",
      "left_message",
      "email_sent",
      "wrong_details",
      "declined",
    ]),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export const enquiryListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["pending", "acknowledged", "answered"]).optional(),
});
export const respondBody = z
  .object({
    response: z.string().trim().min(2).max(4000),
    adminInternalNotes: z.string().trim().max(4000).optional(),
  })
  .strict();

export const publicRequestResponse = z.object({
  reference: z.string(),
  message: z.string(),
});

mountRoutes(requestRouter, "/requests", [
  {
    method: "post",
    path: "/",
    tags: ["Public"],
    auth: "public",
    status: 201,
    middleware: [publicFormLimiter],
    summary:
      "Visitor submits a request (membership card, certificates, sacrament enquiries, general...). Rate limited; honeypot protected.",
    body: publicRequestBody,
    response: publicRequestResponse,
    handler: c.submit,
  },
  {
    method: "post",
    path: "/staff-entry",
    tags,
    auth: care,
    status: 201,
    summary:
      "Staff records a request received by phone/in person (staff confirms the visitor's consent)",
    body: staffEntryBody,
    handler: c.staffEntry,
  },
  {
    method: "get",
    path: "/",
    tags,
    auth: care,
    summary: "List requests",
    query: requestListQuery,
    handler: c.list,
  },
  {
    method: "get",
    path: "/:id",
    tags,
    auth: care,
    params: idParams,
    summary:
      "Request detail with activity history, contact attempts and (for customer care) the admin response",
    handler: c.get,
  },
  {
    method: "patch",
    path: "/:id",
    tags,
    auth: care,
    params: idParams,
    body: updateRequestBody,
    summary: "Set priority or assignee",
    handler: c.update,
  },
  {
    method: "post",
    path: "/:id/notes",
    tags,
    auth: care,
    params: idParams,
    body: addNoteBody,
    status: 201,
    summary: "Add an internal staff note",
    handler: c.addNote,
  },
  {
    method: "post",
    path: "/:id/status",
    tags,
    auth: care,
    params: idParams,
    body: staffStatusBody,
    summary: "Move the request along its workflow (transition rules enforced)",
    handler: c.setStatus,
  },
  {
    method: "post",
    path: "/:id/forward",
    tags,
    auth: care,
    params: idParams,
    body: forwardBody,
    status: 201,
    summary:
      "Forward the request to the administrator (creates an admin enquiry)",
    handler: c.forward,
  },
  {
    method: "post",
    path: "/:id/contact-attempts",
    tags,
    auth: care,
    params: idParams,
    body: contactAttemptBody,
    status: 201,
    summary: "Record a contact attempt and its outcome, as reported by staff",
    handler: c.contactAttempt,
  },
]);
