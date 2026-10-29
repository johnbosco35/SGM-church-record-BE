"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadLimiter = exports.chatLimiter = exports.publicFormLimiter = exports.authLimiter = exports.generalLimiter = void 0;
exports.makeLimiter = makeLimiter;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const env_1 = require("../config/env");
const passthrough = (_req, _res, next) => next();
function makeLimiter(opts) {
    if (!env_1.env.RATE_LIMIT_ENABLED)
        return passthrough;
    return (0, express_rate_limit_1.default)({
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
exports.generalLimiter = makeLimiter({
    windowMs: 15 * MIN,
    max: env_1.env.RATE_LIMIT_GENERAL_MAX,
});
exports.authLimiter = makeLimiter({
    windowMs: 15 * MIN,
    max: env_1.env.RATE_LIMIT_AUTH_MAX,
    message: "Too many authentication attempts. Please try again later.",
});
exports.publicFormLimiter = makeLimiter({
    windowMs: 60 * MIN,
    max: env_1.env.RATE_LIMIT_PUBLIC_FORM_MAX,
});
exports.chatLimiter = makeLimiter({
    windowMs: 10 * MIN,
    max: env_1.env.RATE_LIMIT_CHAT_MAX,
});
exports.uploadLimiter = makeLimiter({
    windowMs: 15 * MIN,
    max: env_1.env.RATE_LIMIT_UPLOAD_MAX,
});
//# sourceMappingURL=rateLimit.js.map