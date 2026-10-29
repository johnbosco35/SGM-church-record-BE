"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.csrfProtection = void 0;
const env_1 = require("../config/env");
const constants_1 = require("../config/constants");
const http_1 = require("./http");
const auth_1 = require("./auth");
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// These establish a brand-new session and carry no ambient authority.
const EXEMPT = new Set([
    `${constants_1.API_PREFIX}/auth/login`,
    `${constants_1.API_PREFIX}/auth/register`,
]);
/**
 * CSRF defence for cookie auth: (1) SameSite cookies, (2) Origin allow-list check, (3) double-submit token.
 * Applies to unsafe methods whenever a session cookie is present. The SPA reads the `csrf_token` cookie
 * (or GET /auth/csrf) and echoes it in the `X-CSRF-Token` header.
 */
const csrfProtection = (req, _res, next) => {
    if (!UNSAFE.has(req.method) || EXEMPT.has(req.baseUrl + req.path))
        return next();
    const hasSession = Boolean(req.cookies?.[auth_1.ACCESS_COOKIE] || req.cookies?.[auth_1.REFRESH_COOKIE]);
    if (!hasSession)
        return next();
    const origin = req.get("origin");
    if (origin && !env_1.env.corsOrigins.includes(origin)) {
        return next(new http_1.AppError(403, "CSRF_ORIGIN", "Request origin is not allowed"));
    }
    const header = req.get("x-csrf-token");
    const cookie = req.cookies?.[auth_1.CSRF_COOKIE];
    if (!header || !cookie || !(0, auth_1.safeEqual)(header, cookie)) {
        return next(new http_1.AppError(403, "CSRF_FAILED", "Missing or invalid CSRF token"));
    }
    next();
};
exports.csrfProtection = csrfProtection;
//# sourceMappingURL=csrf.js.map