export const API_PREFIX = "/api/v1";

export const ROLES = [
  "admin",
  "parish_priest",
  "customer_care",
  "member",
] as const;
export type Role = (typeof ROLES)[number];

/** Staff roles an admin may create. `member` is the no-privilege role used by public registration. */
export const STAFF_ROLES = ["admin", "parish_priest", "customer_care"] as const;

export const RECORD_STATUSES = [
  "draft",
  "pending_review",
  "correction_required",
  "verified",
] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const REQUEST_STATUSES = [
  "new",
  "in_review",
  "awaiting_information",
  "forwarded_to_admin",
  "awaiting_admin_response",
  "response_received",
  "ready_to_contact_visitor",
  "contact_attempted",
  "resolved",
  "closed",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REQUEST_CATEGORIES = [
  "membership_card",
  "baptism",
  "first_holy_communion",
  "confirmation",
  "holy_matrimony",
  "holy_orders",
  "sick_call_assistance",
  "website_information",
  "general_enquiry",
  "societies_ministries_events",
] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

/**
 * Staff-driven transitions. The steps forwarded_to_admin -> awaiting_admin_response -> response_received
 * are driven by the admin-enquiry workflow, not by this table.
 */
export const REQUEST_TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  new: ["in_review", "closed"],
  in_review: [
    "awaiting_information",
    "ready_to_contact_visitor",
    "resolved",
    "closed",
  ],
  awaiting_information: ["in_review", "closed"],
  forwarded_to_admin: ["in_review"],
  awaiting_admin_response: ["in_review"],
  response_received: ["ready_to_contact_visitor", "in_review", "resolved"],
  ready_to_contact_visitor: ["contact_attempted", "resolved"],
  contact_attempted: [
    "contact_attempted",
    "ready_to_contact_visitor",
    "resolved",
    "closed",
  ],
  resolved: ["closed", "in_review"],
  closed: [],
};
