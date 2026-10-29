import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { API_PREFIX, type Role } from "../config/constants";
import { env } from "../config/env";
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
  randomToken,
  sha256,
  signAccessToken,
} from "../middleware/auth";
import { AppError, ok } from "../middleware/http";
import { audit } from "../models/AuditLog";
import { RefreshSession } from "../models/RefreshSession";
import { User } from "../models/User";

// ───────────── account & session logic ─────────────
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Used to keep response time similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

export const toPublicUser = (u: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}): PublicUser => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role as Role,
  isActive: u.isActive,
});

export const hashPassword = (pw: string): Promise<string> =>
  bcrypt.hash(pw, env.BCRYPT_ROUNDS);

async function issueSession(
  user: {
    _id: unknown;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    tokenVersion: number;
  },
  meta: SessionMeta,
  family: string = crypto.randomUUID(),
): Promise<AuthResult> {
  const refreshToken = randomToken();
  await RefreshSession.create({
    user: user._id,
    tokenHash: sha256(refreshToken),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300),
  });
  return {
    user: toPublicUser(user),
    accessToken: signAccessToken({
      id: String(user._id),
      role: user.role as Role,
      tokenVersion: user.tokenVersion,
    }),
    refreshToken,
    csrfToken: randomToken(24),
  };
}

export async function registerMember(
  input: { name: string; email: string; password: string },
  meta: SessionMeta,
): Promise<AuthResult> {
  if (!env.ALLOW_PUBLIC_REGISTRATION)
    throw new AppError(
      403,
      "REGISTRATION_DISABLED",
      "Public registration is disabled. Contact the parish office.",
    );
  if (await User.exists({ email: input.email }))
    throw AppError.conflict("An account with this email already exists");
  // Public registration can only ever create the no-privilege "member" role.
  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    role: "member",
  });
  return issueSession(user, meta);
}

export async function login(
  email: string,
  password: string,
  meta: SessionMeta,
): Promise<AuthResult> {
  const user = await User.findOne({ email }).select(
    "+passwordHash +failedLoginCount +lockedUntil",
  );
  const invalid = new AppError(
    401,
    "INVALID_CREDENTIALS",
    "Invalid email or password",
  );

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw invalid;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(
      423,
      "ACCOUNT_LOCKED",
      "Account temporarily locked after repeated failed attempts. Try again later.",
    );
  }
  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches || !user.isActive) {
    if (!matches) {
      user.failedLoginCount = (user.failedLoginCount ?? 0) + 1;
      if (user.failedLoginCount >= MAX_FAILED) {
        user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
        user.failedLoginCount = 0;
      }
      await user.save();
    }
    throw invalid;
  }
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(user, meta);
}

/** Rotates the refresh token. Presenting an already-rotated token revokes the whole token family. */
export async function refresh(
  rawToken: string | undefined,
  meta: SessionMeta,
): Promise<AuthResult> {
  if (!rawToken) throw AppError.unauthorized();
  const tokenHash = sha256(rawToken);
  const now = new Date();

  // Atomic claim: only one concurrent request can rotate a given token.
  const claimed = await RefreshSession.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { revokedAt: now, revokedReason: "rotated" },
    { new: false },
  );

  if (!claimed) {
    const existing = await RefreshSession.findOne({ tokenHash });
    if (existing && existing.revokedReason === "rotated") {
      await RefreshSession.updateMany(
        { family: existing.family, revokedAt: null },
        { revokedAt: now, revokedReason: "reuse_detected" },
      );
    }
    throw AppError.unauthorized("Session expired. Please sign in again.");
  }

  const user = await User.findById(claimed.user);
  if (!user || !user.isActive)
    throw AppError.unauthorized("Session expired. Please sign in again.");
  return issueSession(user, meta, claimed.family);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await RefreshSession.updateOne(
    { tokenHash: sha256(rawToken), revokedAt: null },
    { revokedAt: new Date(), revokedReason: "logout" },
  );
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await RefreshSession.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: new Date(), revokedReason: "revoked_all" },
  );
}

export async function changePassword(
  userId: string,
  current: string,
  next: string,
): Promise<void> {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user || !(await bcrypt.compare(current, user.passwordHash)))
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Current password is incorrect",
    );
  user.passwordHash = await hashPassword(next);
  user.tokenVersion += 1; // invalidates every access token
  await user.save();
  await revokeAllSessions(userId);
}

// ───────────── cookies ─────────────
const cookieBase = () =>
  ({
    secure: env.cookieSecure,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
  }) as const;
const meta = (req: Request): SessionMeta => ({
  ip: req.ip,
  userAgent: req.get("user-agent"),
});

function setAuthCookies(res: Response, r: AuthResult): void {
  res.cookie(ACCESS_COOKIE, r.accessToken, {
    ...cookieBase(),
    httpOnly: true,
    path: "/",
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60_000,
  });
  // Refresh cookie is only ever sent to the auth endpoints.
  res.cookie(REFRESH_COOKIE, r.refreshToken, {
    ...cookieBase(),
    httpOnly: true,
    path: `${API_PREFIX}/auth`,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
  // Readable by the SPA so it can echo the value in X-CSRF-Token.
  res.cookie(CSRF_COOKIE, r.csrfToken, {
    ...cookieBase(),
    httpOnly: false,
    path: "/",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

function clearAuthCookies(res: Response): void {
  const base = cookieBase();
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true, path: "/" });
  res.clearCookie(REFRESH_COOKIE, {
    ...base,
    httpOnly: true,
    path: `${API_PREFIX}/auth`,
  });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false, path: "/" });
}

// ───────────── handlers ─────────────
export const authController = {
  register: async (req: Request, res: Response) => {
    const r = await registerMember(req.body, meta(req));
    setAuthCookies(res, r);
    ok(res, { user: r.user }, 201);
  },
  login: async (req: Request, res: Response) => {
    const r = await login(req.body.email, req.body.password, meta(req));
    setAuthCookies(res, r);
    await audit(req, "auth.login", {
      actorId: r.user.id,
      actorRole: r.user.role,
    });
    ok(res, { user: r.user, csrfToken: r.csrfToken });
  },
  refresh: async (req: Request, res: Response) => {
    try {
      const r = await refresh(req.cookies?.[REFRESH_COOKIE], meta(req));
      setAuthCookies(res, r);
      ok(res, { user: r.user, csrfToken: r.csrfToken });
    } catch (e) {
      clearAuthCookies(res);
      throw e;
    }
  },
  logout: async (req: Request, res: Response) => {
    await logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    ok(res, { loggedOut: true });
  },
  logoutAll: async (req: Request, res: Response) => {
    await revokeAllSessions(req.user!.id);
    await User.updateOne({ _id: req.user!.id }, { $inc: { tokenVersion: 1 } });
    clearAuthCookies(res);
    ok(res, { loggedOut: true });
  },
  me: (req: Request, res: Response) => ok(res, { user: req.user }),
  csrf: (_req: Request, res: Response) => {
    const token = randomToken(24);
    res.cookie(CSRF_COOKIE, token, {
      ...cookieBase(),
      httpOnly: false,
      path: "/",
      maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    });
    ok(res, { csrfToken: token });
  },
  changePassword: async (req: Request, res: Response) => {
    await changePassword(
      req.user!.id,
      req.body.currentPassword,
      req.body.newPassword,
    );
    clearAuthCookies(res);
    await audit(req, "auth.password_changed");
    ok(res, { changed: true });
  },
};
