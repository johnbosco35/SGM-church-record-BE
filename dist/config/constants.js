"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.REQUEST_TRANSITIONS = exports.REQUEST_CATEGORIES = exports.REQUEST_STATUSES = exports.RECORD_STATUSES = exports.STAFF_ROLES = exports.ROLES = exports.API_PREFIX = void 0;
exports.API_PREFIX = "/api/v1";
exports.ROLES = [
    "admin",
    "parish_priest",
    "customer_care",
    "member",
];
/** Staff roles an admin may create. `member` is the no-privilege role used by public registration. */
exports.STAFF_ROLES = ["admin", "parish_priest", "customer_care"];
exports.RECORD_STATUSES = [
    "draft",
    "pending_review",
    "correction_required",
    "verified",
];
exports.REQUEST_STATUSES = [
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
];
exports.REQUEST_CATEGORIES = [
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
];
/**
 * Staff-driven transitions. The steps forwarded_to_admin -> awaiting_admin_response -> response_received
 * are driven by the admin-enquiry workflow, not by this table.
 */
exports.REQUEST_TRANSITIONS = {
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
//# sourceMappingURL=constants.js.map