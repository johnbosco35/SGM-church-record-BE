import type { Request, Response } from "express";
import { AppError, ok, paged } from "../middleware/http";
import type { AuthUser } from "../middleware/auth";
import { AdminEnquiry } from "../models/AdminEnquiry";
import { SupportRequest } from "../models/SupportRequest";
import { logActivity, stripAdminOnly, view } from "./request.controller";

type Plain = Record<string, unknown>;

export async function listEnquiries(
  q: { page: number; limit: number; status?: string },
  actor: AuthUser,
) {
  const filter: Plain = {};
  if (q.status) filter.status = q.status;
  if (actor.role !== "admin") filter.forwardedBy = actor.id; // customer care sees only their own
  const [items, total] = await Promise.all([
    AdminEnquiry.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    AdminEnquiry.countDocuments(filter),
  ]);
  return {
    items: items.map((e: Plain) =>
      actor.role === "admin" ? view(e) : stripAdminOnly(e),
    ),
    total,
  };
}

async function enquiryFor(id: string, actor: AuthUser) {
  const e = await AdminEnquiry.findById(id);
  if (!e || (actor.role !== "admin" && String(e.forwardedBy) !== actor.id))
    throw AppError.notFound("Enquiry not found");
  return e;
}

export async function getEnquiry(id: string, actor: AuthUser) {
  const e = await enquiryFor(id, actor);
  return actor.role === "admin"
    ? view(e.toObject())
    : stripAdminOnly(e.toObject());
}

export async function acknowledgeEnquiry(id: string, actor: AuthUser) {
  const e = await enquiryFor(id, actor);
  if (e.status !== "pending")
    throw AppError.conflict(`Enquiry is already ${e.status}`);
  e.status = "acknowledged";
  e.acknowledgedBy = actor.id as never;
  e.acknowledgedAt = new Date();
  await e.save();
  const req = await SupportRequest.findById(e.request);
  if (req && req.status === "forwarded_to_admin") {
    req.status = "awaiting_admin_response";
    logActivity(req, actor, "", "admin_acknowledged", {
      fromStatus: "forwarded_to_admin",
      toStatus: "awaiting_admin_response",
    });
    await req.save();
  }
  return view(e.toObject());
}

export async function respondToEnquiry(
  id: string,
  input: { response: string; adminInternalNotes?: string },
  actor: AuthUser,
) {
  const e = await enquiryFor(id, actor);
  const wasAnswered = e.status === "answered";
  e.response = input.response;
  e.adminInternalNotes = input.adminInternalNotes;
  e.status = "answered";
  e.respondedBy = actor.id as never;
  e.respondedAt = new Date();
  await e.save();
  const req = await SupportRequest.findById(e.request);
  if (req) {
    const from = req.status;
    if (["forwarded_to_admin", "awaiting_admin_response"].includes(from))
      req.status = "response_received";
    logActivity(
      req,
      actor,
      "",
      wasAnswered ? "admin_response_updated" : "admin_responded",
      { fromStatus: from, toStatus: req.status },
    );
    await req.save();
  }
  return view(e.toObject());
}

// ───────────── handlers ─────────────
export const adminEnquiryController = {
  list: async (req: Request, res: Response) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      status?: string;
    };
    const { items, total } = await listEnquiries(q, req.user!);
    paged(res, items, q.page, q.limit, total);
  },
  get: async (req: Request, res: Response) =>
    ok(res, await getEnquiry(req.params.id, req.user!)),
  acknowledge: async (req: Request, res: Response) =>
    ok(res, await acknowledgeEnquiry(req.params.id, req.user!)),
  respond: async (req: Request, res: Response) =>
    ok(res, await respondToEnquiry(req.params.id, req.body, req.user!)),
};
