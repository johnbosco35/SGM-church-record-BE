import crypto from "node:crypto";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { Role } from "../config/constants";
import { User } from "../models/User";
import { AppError } from "./http";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const CSRF_COOKIE = "csrf_token";

interface AccessPayload {
  sub: string;
  role: Role;
  tv: number;
}

export function signAccessToken(user: {
  id: string;
  role: Role;
  tokenVersion: number;
}): string {
  const payload: AccessPayload = {
    sub: user.id,
    role: user.role,
    tv: user.tokenVersion,
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
    issuer: "church-api",
  });
}

/** Requires a valid access-token cookie and a currently active account whose token version still matches. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (!token) throw AppError.unauthorized();
    let payload: AccessPayload;
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        algorithms: ["HS256"],
        issuer: "church-api",
      }) as unknown as AccessPayload;
    } catch {
      throw AppError.unauthorized("Session expired or invalid");
    }
    const user: any = await User.findById(payload.sub).lean();
    if (!user || !user.isActive || user.tokenVersion !== payload.tv)
      throw AppError.unauthorized("Session expired or invalid");
    // Role always comes from the database, never from the token.
    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role as Role,
    };
    next();
  } catch (err) {
    next(err);
  }
};

export const requireRoles =
  (...roles: readonly Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!roles.includes(req.user.role)) return next(AppError.forbidden());
    next();
  };

export type AuthUser = NonNullable<Express.Request["user"]>;

// ───────────── token helpers ─────────────
export const sha256 = (v: string): string =>
  crypto.createHash("sha256").update(v).digest("hex");
export const randomToken = (bytes = 48): string =>
  crypto.randomBytes(bytes).toString("base64url");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
