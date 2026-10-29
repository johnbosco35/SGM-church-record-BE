"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = exports.errorHandler = exports.notFoundHandler = exports.asyncHandler = exports.AppError = exports.logger = void 0;
exports.ok = ok;
exports.paged = paged;
const node_crypto_1 = __importDefault(require("node:crypto"));
const mongoose_1 = __importDefault(require("mongoose"));
const multer_1 = __importDefault(require("multer"));
const zod_1 = require("zod");
const env_1 = require("../config/env");
// ───────────── logger (redacting) ─────────────
/**
 * Minimal structured logger with redaction. Never log request bodies, cookies, tokens,
 * query strings (they can contain names) or sacramental data.
 */
const REDACT = /pass|token|secret|cookie|authorization|csrf|signature|name|address|phone|email|dob|birth|parent|godparent|sponsor|baptis|confirm|sick|remarks/i;
function redact(value, depth = 0) {
    if (depth > 4 || value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map((v) => redact(v, depth + 1));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        out[k] = REDACT.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
}
function write(level, msg, meta) {
    if (process.env.NODE_ENV === "test" && level !== "error")
        return;
    const line = JSON.stringify({
        t: new Date().toISOString(),
        level,
        msg,
        ...(meta ? redact(meta) : {}),
    });
    (level === "error" ? console.error : console.log)(line);
}
exports.logger = {
    info: (msg, meta) => write("info", msg, meta),
    warn: (msg, meta) => write("warn", msg, meta),
    error: (msg, meta) => write("error", msg, meta),
};
// ───────────── AppError ─────────────
class AppError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        this.name = "AppError";
    }
    static badRequest(message, details) {
        return new AppError(400, "BAD_REQUEST", message, details);
    }
    static unauthorized(message = "Authentication required") {
        return new AppError(401, "UNAUTHORIZED", message);
    }
    static forbidden(message = "You do not have permission to perform this action") {
        return new AppError(403, "FORBIDDEN", message);
    }
    static notFound(message = "Resource not found") {
        return new AppError(404, "NOT_FOUND", message);
    }
    static conflict(message, details) {
        return new AppError(409, "CONFLICT", message, details);
    }
    static unprocessable(code, message, details) {
        return new AppError(422, code, message, details);
    }
}
exports.AppError = AppError;
// ───────────── async wrapper & response helpers ─────────────
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};
exports.asyncHandler = asyncHandler;
function ok(res, data, status = 200, meta) {
    res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}
function paged(res, items, page, limit, total) {
    const meta = {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
    };
    res.status(200).json({ success: true, data: items, meta });
}
// ───────────── error handling ─────────────
const notFoundHandler = (req, res) => {
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
exports.notFoundHandler = notFoundHandler;
function send(res, status, code, message, details) {
    res
        .status(status)
        .json({
        success: false,
        error: { code, message, ...(details !== undefined ? { details } : {}) },
    });
}
const errorHandler = (err, req, res, _next) => {
    if (err instanceof AppError)
        return send(res, err.status, err.code, err.message, err.details);
    if (err instanceof zod_1.ZodError) {
        const details = err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
        }));
        return send(res, 400, "VALIDATION_ERROR", "Request validation failed", details);
    }
    if (err instanceof multer_1.default.MulterError) {
        const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        return send(res, status, "UPLOAD_ERROR", err.message);
    }
    if (err instanceof mongoose_1.default.Error.ValidationError) {
        const details = Object.values(err.errors).map((e) => ({
            path: e.path,
            message: e.message,
        }));
        return send(res, 400, "VALIDATION_ERROR", "Data validation failed", details);
    }
    if (err instanceof mongoose_1.default.Error.CastError)
        return send(res, 400, "INVALID_ID", "Invalid identifier");
    if (typeof err === "object" &&
        err &&
        err.code === 11000) {
        return send(res, 409, "DUPLICATE", "A record with this unique value already exists");
    }
    if (typeof err === "object" &&
        err &&
        err.type === "entity.too.large") {
        return send(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large");
    }
    if (err instanceof SyntaxError && "body" in err)
        return send(res, 400, "INVALID_JSON", "Malformed JSON body");
    if (err instanceof Error &&
        /cannot be deleted|append-only/.test(err.message)) {
        return send(res, 405, "PROTECTED_RECORD", err.message);
    }
    exports.logger.error("Unhandled error", {
        path: req.path,
        method: req.method,
        error: err instanceof Error ? err.message : String(err),
        stack: env_1.env.isProd ? undefined : err?.stack,
    });
    send(res, 500, "INTERNAL_ERROR", "An unexpected error occurred");
};
exports.errorHandler = errorHandler;
// ───────────── request log ─────────────
/** Logs method, path (no query string), status, duration and user id. No bodies, cookies, tokens or names. */
const requestLogger = (req, res, next) => {
    const start = process.hrtime.bigint();
    req.requestId = node_crypto_1.default.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    res.on("finish", () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        exports.logger.info("request", {
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
exports.requestLogger = requestLogger;
//# sourceMappingURL=http.js.map