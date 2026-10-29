"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const rateLimit_1 = require("../middleware/rateLimit");
const auth_controller_1 = require("../controllers/auth.controller");
const helpers_1 = require("../helpers");
const define_1 = require("./define");
exports.authRouter = (0, express_1.Router)();
const registerBody = zod_1.z
    .object({
    name: zod_1.z.string().trim().min(2).max(120),
    email: helpers_1.emailSchema,
    password: helpers_1.passwordSchema,
})
    .strict();
const loginBody = zod_1.z
    .object({ email: helpers_1.emailSchema, password: zod_1.z.string().min(1).max(128) })
    .strict();
const changePasswordBody = zod_1.z
    .object({
    currentPassword: zod_1.z.string().min(1).max(128),
    newPassword: helpers_1.passwordSchema,
})
    .strict();
const userEnvelope = zod_1.z.object({
    user: zod_1.z
        .object({
        id: zod_1.z.string(),
        name: zod_1.z.string(),
        email: zod_1.z.string(),
        role: zod_1.z.string(),
    })
        .partial(),
});
(0, define_1.mountRoutes)(exports.authRouter, "/auth", [
    {
        method: "post",
        path: "/register",
        tags: ["Auth"],
        auth: "public",
        status: 201,
        middleware: [rateLimit_1.authLimiter],
        summary: "Self-register a no-privilege member account (only when ALLOW_PUBLIC_REGISTRATION=true)",
        body: registerBody,
        response: userEnvelope,
        handler: auth_controller_1.authController.register,
    },
    {
        method: "post",
        path: "/login",
        tags: ["Auth"],
        auth: "public",
        middleware: [rateLimit_1.authLimiter],
        summary: "Sign in. Sets HttpOnly access/refresh cookies and a readable csrf_token cookie.",
        body: loginBody,
        response: userEnvelope,
        handler: auth_controller_1.authController.login,
    },
    {
        method: "post",
        path: "/refresh",
        tags: ["Auth"],
        auth: "public",
        middleware: [rateLimit_1.authLimiter],
        summary: "Rotate the refresh token and issue a new access token. Reuse of an old refresh token revokes the session family.",
        handler: auth_controller_1.authController.refresh,
    },
    {
        method: "post",
        path: "/logout",
        tags: ["Auth"],
        auth: "public",
        summary: "Revoke the current refresh token and clear cookies",
        handler: auth_controller_1.authController.logout,
    },
    {
        method: "post",
        path: "/logout-all",
        tags: ["Auth"],
        auth: "authenticated",
        summary: "Revoke every session of the current user",
        handler: auth_controller_1.authController.logoutAll,
    },
    {
        method: "get",
        path: "/me",
        tags: ["Auth"],
        auth: "authenticated",
        summary: "Current user",
        response: userEnvelope,
        handler: auth_controller_1.authController.me,
    },
    {
        method: "get",
        path: "/csrf",
        tags: ["Auth"],
        auth: "public",
        summary: "Issue a fresh CSRF token cookie (for SPAs that lost it)",
        handler: auth_controller_1.authController.csrf,
    },
    {
        method: "post",
        path: "/change-password",
        tags: ["Auth"],
        auth: "authenticated",
        summary: "Change own password; all sessions are revoked",
        body: changePasswordBody,
        handler: auth_controller_1.authController.changePassword,
    },
]);
//# sourceMappingURL=auth.routes.js.map