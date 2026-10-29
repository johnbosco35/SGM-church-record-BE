import crypto from "node:crypto";
import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import mongoose from "mongoose";
import multer from "multer";
import { ZodError } from "zod";
import { env } from "../config/env";

// ───────────── logger (redacting) ─────────────
/**
 * Minimal structured logger with redaction. Never log request bodies, cookies, tokens,
 * query strings (they can contain names) or sacramental data.
 */
const REDACT =
  /pass|token|secret|cookie|authorization|csrf|signature|name|address|phone|email|dob|birth|parent|godparent|sponsor|baptis|confirm|sick|remarks/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT.test(k) ? "[REDACTED]" : redact(v, depth + 1);
  }
  return out;
}

function write(
  level: string,
  msg: string,
  meta?: Record<string, unknown>,
): void {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ? (redact(meta) as object) : {}),
  });
  (level === "error" ? console.error : console.log)(line);
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) =>
    write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    write("error", msg, meta),
};

// ───────────── AppError ─────────────
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }
  static unauthorized(message = "Authentication required") {
    return new AppError(401, "UNAUTHORIZED", message);
  }
  static forbidden(
    message = "You do not have permission to perform this action",
  ) {
    return new AppError(403, "FORBIDDEN", message);
  }
  static notFound(message = "Resource not found") {
    return new AppError(404, "NOT_FOUND", message);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError(409, "CONFLICT", message, details);
  }
  static unprocessable(code: string, message: string, details?: unknown) {
    return new AppError(422, code, message, details);
  }
}

// ───────────── async wrapper & response helpers ─────────────
export const asyncHandler =
  (
    fn: (req: Request, res: Response, next: NextFunction) => unknown,
  ): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function ok<T>(
  res: Response,
  data: T,
  status = 200,
  meta?: Record<string, unknown>,
): void {
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function paged<T>(
  res: Response,
  items: T[],
  page: number,
  limit: number,
  total: number,
): void {
  const meta: PageMeta = {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
  res.status(200).json({ success: true, data: items, meta });
}

// ───────────── error handling ─────────────
export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: `Route ${req.method} ${req.path} not found`,
      },
    });
};

function send(
  res: Parameters<ErrorRequestHandler>[2],
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res
    .status(status)
    .json({
      success: false,
      error: { code, message, ...(details !== undefined ? { details } : {}) },
    });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError)
    return send(res, err.status, err.code, err.message, err.details);

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
    }));
    return send(
      res,
      400,
      "VALIDATION_ERROR",
      "Request validation failed",
      details,
    );
  }
  if (err instanceof multer.MulterError) {
    const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return send(res, status, "UPLOAD_ERROR", err.message);
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({
      path: e.path,
      message: e.message,
    }));
    return send(
      res,
      400,
      "VALIDATION_ERROR",
      "Data validation failed",
      details,
    );
  }
  if (err instanceof mongoose.Error.CastError)
    return send(res, 400, "INVALID_ID", "Invalid identifier");
  if (
    typeof err === "object" &&
    err &&
    (err as { code?: number }).code === 11000
  ) {
    return send(
      res,
      409,
      "DUPLICATE",
      "A record with this unique value already exists",
    );
  }
  if (
    typeof err === "object" &&
    err &&
    (err as { type?: string }).type === "entity.too.large"
  ) {
    return send(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }
  if (err instanceof SyntaxError && "body" in err)
    return send(res, 400, "INVALID_JSON", "Malformed JSON body");
  if (
    err instanceof Error &&
    /cannot be deleted|append-only/.test(err.message)
  ) {
    return send(res, 405, "PROTECTED_RECORD", err.message);
  }

  logger.error("Unhandled error", {
    path: req.path,
    method: req.method,
    error: err instanceof Error ? err.message : String(err),
    stack: env.isProd ? undefined : (err as Error)?.stack,
  });
  send(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
};

// ───────────── request log ─────────────
/** Logs method, path (no query string), status, duration and user id. No bodies, cookies, tokens or names. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  req.requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    logger.info("request", {
      id: req.requestId,
      method: req.method,
      path: req.baseUrl + req.path,
      status: res.statusCode,
      ms: Math.round(ms),
      userId: req.user?.id,
    });
  });
  next();
};
