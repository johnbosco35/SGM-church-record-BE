import crypto from "node:crypto";
import type { Request, Response } from "express";
import { REQUEST_TRANSITIONS, type RequestStatus } from "../config/constants";
import { escapeRegex } from "../helpers";
import { AppError, ok, paged } from "../middleware/http";
import type { AuthUser } from "../middleware/auth";
import { AdminEnquiry } from "../models/AdminEnquiry";
import { SupportRequest } from "../models/SupportRequest";
import { User } from "../models/User";

type Plain = Record<string, unknown>;
export const view = (d: Plain): Plain => {
  const { _id, __v, ...rest } = d;
  return { id: String(_id), ...rest };
};
export const stripAdminOnly = (e: Plain): Plain => {
  const { adminInternalNotes: _drop, ...rest } = view(e);
  return rest;
};

function newReference(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `REQ-${d}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

export function logActivity(
  doc: Plain & { activity: Plain[] },
  by: AuthUser | null,
  label: string,
  action: string,
  extra: Plain = {},
): void {
  doc.activity.push({
    at: new Date(),
    by: by?.id,
    byLabel: by ? by.name : label,
    action,
    ...extra,
  });
}

export async function createRequest(
  input: Plain & { category: string },
  origin: {
    source: "website_form" | "chatbot" | "staff_entry";
    staff?: AuthUser;
  },
) {
  const { website: _honeypot, ...fields } = input;
  const priority =
    (fields.priority as string | undefined) ??
    (fields.category === "sick_call_assistance" ? "high" : "normal");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const doc = new SupportRequest({
        ...fields,
        priority,
        source: origin.source,
        reference: newReference(),
        consentAt: new Date(),
        status: "new",
      });
      logActivity(
        doc,
        origin.staff ?? null,
        origin.source === "chatbot" ? "chatbot visitor" : "visitor",
        "request_submitted",
        { toStatus: "new" },
      );
      await doc.save();
      return doc;
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e; // reference collision: retry
    }
  }
  throw new AppError(
    500,
    "REFERENCE_FAILED",
    "Could not allocate a request reference",
  );
}

export async function listRequests(
  q: Plain & { page: number; limit: number },
  actor: AuthUser,
) {
  const filter: Plain = {};
  for (const k of ["status", "category", "priority"] as const)
    if (q[k]) filter[k] = q[k];
  if (q.assignedTo === "me") filter.assignedTo = actor.id;
  else if (q.assignedTo === "unassigned") filter.assignedTo = null;
  else if (q.assignedTo) filter.assignedTo = q.assignedTo;
  if (q.q) {
    const rx = new RegExp(escapeRegex(String(q.q)), "i");
    filter.$or = [{ visitorName: rx }, { reference: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    SupportRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .select("-activity -internalNotes -contactAttempts")
      .lean(),
    SupportRequest.countDocuments(filter),
  ]);
  return { items: items.map((i: Plain) => view(i)), total };
}

async function mustFind(id: string) {
  const doc = await SupportRequest.findById(id);
  if (!doc) throw AppError.notFound("Request not found");
  return doc;
}

export async function getRequest(id: string, actor: AuthUser) {
  const doc = await mustFind(id);
  const enquiry: any = doc.adminEnquiry
    ? await AdminEnquiry.findById(doc.adminEnquiry).lean()
    : null;
  return {
    ...view(doc.toObject()),
    adminEnquiry: enquiry
      ? actor.role === "admin"
        ? view(enquiry)
        : stripAdminOnly(enquiry)
      : null,
  };
}

export async function updateRequest(
  id: string,
  patch: { priority?: string; assignedTo?: string | null },
  actor: AuthUser,
) {
  const doc = await mustFind(id);
  if (patch.priority) {
    doc.priority = patch.priority;
    logActivity(doc, actor, "", "priority_changed", { note: patch.priority });
  }
  if (patch.assignedTo !== undefined) {
    const target = patch.assignedTo === "me" ? actor.id : patch.assignedTo;
    if (target) {
      const u: any = await User.findById(target).lean();
      if (!u || !u.isActive || !["customer_care", "admin"].includes(u.role))
        throw AppError.unprocessable(
          "INVALID_ASSIGNEE",
          "Assignee must be an active customer-care or admin user",
        );
    }
    doc.assignedTo = target ?? undefined;
    logActivity(doc, actor, "", target ? "assigned" : "unassigned", {
      note: target ? String(target) : undefined,
    });
  }
  await doc.save();
  return view(doc.toObject());
}

export async function addNote(id: string, text: string, actor: AuthUser) {
  const doc = await mustFind(id);
  doc.internalNotes.push({
    at: new Date(),
    by: actor.id,
    byName: actor.name,
    text,
  });
  logActivity(doc, actor, "", "note_added");
  await doc.save();
  return view(doc.toObject());
}

export async function setStatus(
  id: string,
  status: RequestStatus,
  note: string | undefined,
  actor: AuthUser,
) {
  const doc = await mustFind(id);
  const from = doc.status as RequestStatus;
  if (!REQUEST_TRANSITIONS[from].includes(status)) {
    throw AppError.unprocessable(
      "INVALID_TRANSITION",
      `Cannot move a request from "${from}" to "${status}"`,
      { allowed: REQUEST_TRANSITIONS[from] },
    );
  }
  doc.status = status;
  if (status === "resolved") doc.resolvedAt = new Date();
  if (status === "closed") doc.closedAt = new Date();
  logActivity(doc, actor, "", "status_changed", {
    fromStatus: from,
    toStatus: status,
    note,
  });
  await doc.save();
  return view(doc.toObject());
}

export async function forwardToAdmin(
  id: string,
  input: { subject: string; question: string },
  actor: AuthUser,
) {
  const doc = await mustFind(id);
  if (
    !["in_review", "awaiting_information", "response_received"].includes(
      doc.status,
    )
  ) {
    throw AppError.unprocessable(
      "INVALID_TRANSITION",
      "Only requests that are in review can be forwarded to the administrator",
    );
  }
  const enquiry = await AdminEnquiry.create({
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
  return stripAdminOnly(enquiry.toObject());
}

export async function recordContactAttempt(
  id: string,
  input: { method: string; outcome: string; note?: string },
  actor: AuthUser,
) {
  const doc = await mustFind(id);
  if (!["ready_to_contact_visitor", "contact_attempted"].includes(doc.status)) {
    throw AppError.unprocessable(
      "INVALID_TRANSITION",
      'Mark the request "ready_to_contact_visitor" before recording contact attempts',
    );
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
  return view(doc.toObject());
}

// ───────────── handlers ─────────────
export const requestController = {
  /** Public visitor submission. */
  submit: async (req: Request, res: Response) => {
    if (req.body.website) {
      // bot trap: pretend success, store nothing
      ok(
        res,
        {
          reference: "REQ-RECEIVED",
          message: "Thank you. Your request has been received.",
        },
        201,
      );
      return;
    }
    const doc = await createRequest(req.body, { source: "website_form" });
    ok(
      res,
      {
        reference: doc.reference,
        message:
          "Thank you. Your request has been received and a member of our team will contact you. For urgent sick calls please contact the parish office directly.",
      },
      201,
    );
  },
  staffEntry: async (req: Request, res: Response) => {
    const doc = await createRequest(req.body, {
      source: "staff_entry",
      staff: req.user!,
    });
    ok(res, await getRequest(String(doc._id), req.user!), 201);
  },
  list: async (req: Request, res: Response) => {
    const q = req.query as unknown as { page: number; limit: number };
    const { items, total } = await listRequests(req.query as never, req.user!);
    paged(res, items, q.page, q.limit, total);
  },
  get: async (req: Request, res: Response) =>
    ok(res, await getRequest(req.params.id, req.user!)),
  update: async (req: Request, res: Response) =>
    ok(res, await updateRequest(req.params.id, req.body, req.user!)),
  addNote: async (req: Request, res: Response) =>
    ok(res, await addNote(req.params.id, req.body.text, req.user!), 201),
  setStatus: async (req: Request, res: Response) =>
    ok(
      res,
      await setStatus(req.params.id, req.body.status, req.body.note, req.user!),
    ),
  forward: async (req: Request, res: Response) =>
    ok(res, await forwardToAdmin(req.params.id, req.body, req.user!), 201),
  contactAttempt: async (req: Request, res: Response) =>
    ok(
      res,
      await recordContactAttempt(req.params.id, req.body, req.user!),
      201,
    ),
};
