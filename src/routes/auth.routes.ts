import { Router } from "express";
import { z } from "zod";
import { authLimiter } from "../middleware/rateLimit";
import { authController as c } from "../controllers/auth.controller";
import { emailSchema, passwordSchema } from "../helpers";
import { mountRoutes } from "./define";

export const authRouter = Router();

const registerBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();
const loginBody = z
  .object({ email: emailSchema, password: z.string().min(1).max(128) })
  .strict();
const changePasswordBody = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .strict();
const userEnvelope = z.object({
  user: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
      role: z.string(),
    })
    .partial(),
});

mountRoutes(authRouter, "/auth", [
  {
    method: "post",
    path: "/register",
    tags: ["Auth"],
    auth: "public",
    status: 201,
    middleware: [authLimiter],
    summary:
      "Self-register a no-privilege member account (only when ALLOW_PUBLIC_REGISTRATION=true)",
    body: registerBody,
    response: userEnvelope,
    handler: c.register,
  },
  {
    method: "post",
    path: "/login",
    tags: ["Auth"],
    auth: "public",
    middleware: [authLimiter],
    summary:
      "Sign in. Sets HttpOnly access/refresh cookies and a readable csrf_token cookie.",
    body: loginBody,
    response: userEnvelope,
    handler: c.login,
  },
  {
    method: "post",
    path: "/refresh",
    tags: ["Auth"],
    auth: "public",
    middleware: [authLimiter],
    summary:
      "Rotate the refresh token and issue a new access token. Reuse of an old refresh token revokes the session family.",
    handler: c.refresh,
  },
  {
    method: "post",
    path: "/logout",
    tags: ["Auth"],
    auth: "public",
    summary: "Revoke the current refresh token and clear cookies",
    handler: c.logout,
  },
  {
    method: "post",
    path: "/logout-all",
    tags: ["Auth"],
    auth: "authenticated",
    summary: "Revoke every session of the current user",
    handler: c.logoutAll,
  },
  {
    method: "get",
    path: "/me",
    tags: ["Auth"],
    auth: "authenticated",
    summary: "Current user",
    response: userEnvelope,
    handler: c.me,
  },
  {
    method: "get",
    path: "/csrf",
    tags: ["Auth"],
    auth: "public",
    summary: "Issue a fresh CSRF token cookie (for SPAs that lost it)",
    handler: c.csrf,
  },
  {
    method: "post",
    path: "/change-password",
    tags: ["Auth"],
    auth: "authenticated",
    summary: "Change own password; all sessions are revoked",
    body: changePasswordBody,
    handler: c.changePassword,
  },
]);
