import type { RequestHandler } from "express";
import { env } from "../config/env";
import { API_PREFIX } from "../config/constants";
import { AppError } from "./http";
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE, safeEqual } from "./auth";

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// These establish a brand-new session and carry no ambient authority.
const EXEMPT = new Set([
  `${API_PREFIX}/auth/login`,
  `${API_PREFIX}/auth/register`,
]);

/**
 * CSRF defence for cookie auth: (1) SameSite cookies, (2) Origin allow-list check, (3) double-submit token.
 * Applies to unsafe methods whenever a session cookie is present. The SPA reads the `csrf_token` cookie
 * (or GET /auth/csrf) and echoes it in the `X-CSRF-Token` header.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (!UNSAFE.has(req.method) || EXEMPT.has(req.baseUrl + req.path))
    return next();
  const hasSession = Boolean(
    req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE],
  );
  if (!hasSession) return next();

  const origin = req.get("origin");
  if (origin && !env.corsOrigins.includes(origin)) {
    return next(
      new AppError(403, "CSRF_ORIGIN", "Request origin is not allowed"),
    );
  }
  const header = req.get("x-csrf-token");
  const cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
  if (!header || !cookie || !safeEqual(header, cookie)) {
    return next(
      new AppError(403, "CSRF_FAILED", "Missing or invalid CSRF token"),
    );
  }
  next();
};
