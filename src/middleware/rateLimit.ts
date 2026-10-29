import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const passthrough: RequestHandler = (_req, _res, next) => next();

export function makeLimiter(opts: {
  windowMs: number;
  max: number;
  message?: string;
}): RequestHandler {
  if (!env.RATE_LIMIT_ENABLED) return passthrough;
  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: opts.message ?? "Too many requests. Please try again later.",
        },
      });
    },
  });
}

const MIN = 60_000;
export const generalLimiter = makeLimiter({
  windowMs: 15 * MIN,
  max: env.RATE_LIMIT_GENERAL_MAX,
});
export const authLimiter = makeLimiter({
  windowMs: 15 * MIN,
  max: env.RATE_LIMIT_AUTH_MAX,
  message: "Too many authentication attempts. Please try again later.",
});
export const publicFormLimiter = makeLimiter({
  windowMs: 60 * MIN,
  max: env.RATE_LIMIT_PUBLIC_FORM_MAX,
});
export const chatLimiter = makeLimiter({
  windowMs: 10 * MIN,
  max: env.RATE_LIMIT_CHAT_MAX,
});
export const uploadLimiter = makeLimiter({
  windowMs: 15 * MIN,
  max: env.RATE_LIMIT_UPLOAD_MAX,
});
