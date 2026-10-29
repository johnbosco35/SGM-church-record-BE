import type { Request, Response } from "express";
import type { STAFF_ROLES } from "../config/constants";
import { escapeRegex } from "../helpers";
import { AppError, ok, paged } from "../middleware/http";
import { audit } from "../models/AuditLog";
import { User } from "../models/User";
import { hashPassword, revokeAllSessions } from "./auth.controller";

const view = (u: Record<string, unknown>) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
});

export async function listUsers(q: {
  page: number;
  limit: number;
  role?: string;
  q?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (q.role) filter.role = q.role;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), "i");
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    User.countDocuments(filter),
  ]);
  return { items: items.map(view), total };
}

export async function createStaff(
  input: {
    name: string;
    email: string;
    password: string;
    role: (typeof STAFF_ROLES)[number];
  },
  actorId: string,
) {
  if (await User.exists({ email: input.email }))
    throw AppError.conflict("An account with this email already exists");
  const u = await User.create({
    name: input.name,
    email: input.email,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    createdBy: actorId,
  });
  return view(u.toObject());
}

async function activeAdminCount(): Promise<number> {
  return User.countDocuments({ role: "admin", isActive: true });
}

export async function updateUser(
  id: string,
  patch: { name?: string; role?: string; isActive?: boolean },
  actorId: string,
) {
  const user = await User.findById(id);
  if (!user) throw AppError.notFound("User not found");

  const demotes =
    (patch.role && patch.role !== "admin" && user.role === "admin") ||
    (patch.isActive === false && user.role === "admin" && user.isActive);
  if (demotes && (await activeAdminCount()) <= 1)
    throw AppError.unprocessable(
      "LAST_ADMIN",
      "The last active administrator cannot be demoted or deactivated",
    );
  if (id === actorId && (patch.role || patch.isActive === false))
    throw AppError.unprocessable(
      "SELF_CHANGE",
      "You cannot change your own role or deactivate yourself",
    );

  const securityChange =
    (patch.role && patch.role !== user.role) || patch.isActive === false;
  Object.assign(user, patch);
  if (securityChange) user.tokenVersion += 1;
  await user.save();
  if (securityChange) await revokeAllSessions(id);
  return view(user.toObject());
}

export async function adminResetPassword(id: string, newPassword: string) {
  const user = await User.findById(id).select("+passwordHash");
  if (!user) throw AppError.notFound("User not found");
  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1;
  await user.save();
  await revokeAllSessions(id);
}

// ───────────── handlers ─────────────
export const userController = {
  list: async (req: Request, res: Response) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      role?: string;
      q?: string;
    };
    const { items, total } = await listUsers(q);
    paged(res, items, q.page, q.limit, total);
  },
  create: async (req: Request, res: Response) => {
    const u = await createStaff(req.body, req.user!.id);
    await audit(req, "user.created", {
      targetType: "User",
      targetId: String(u.id),
      meta: { role: u.role },
    });
    ok(res, u, 201);
  },
  update: async (req: Request, res: Response) => {
    const u = await updateUser(req.params.id, req.body, req.user!.id);
    await audit(req, "user.updated", {
      targetType: "User",
      targetId: req.params.id,
      meta: { fields: Object.keys(req.body) },
    });
    ok(res, u);
  },
  resetPassword: async (req: Request, res: Response) => {
    await adminResetPassword(req.params.id, req.body.newPassword);
    await audit(req, "user.password_reset", {
      targetType: "User",
      targetId: req.params.id,
    });
    ok(res, { reset: true });
  },
  revokeSessions: async (req: Request, res: Response) => {
    await User.updateOne({ _id: req.params.id }, { $inc: { tokenVersion: 1 } });
    await revokeAllSessions(req.params.id);
    await audit(req, "user.sessions_revoked", {
      targetType: "User",
      targetId: req.params.id,
    });
    ok(res, { revoked: true });
  },
};
