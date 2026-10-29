import { Router } from "express";
import { z } from "zod";
import { STAFF_ROLES } from "../config/constants";
import { userController as c } from "../controllers/user.controller";
import { emailSchema, idParams, passwordSchema } from "../helpers";
import { mountRoutes } from "./define";

export const userRouter = Router();

const createStaffBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: passwordSchema,
    role: z.enum(STAFF_ROLES),
  })
  .strict();
const updateUserBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    role: z.enum([...STAFF_ROLES, "member"]),
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");
const resetPasswordBody = z.object({ newPassword: passwordSchema }).strict();
const listUsersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  role: z.enum([...STAFF_ROLES, "member"]).optional(),
  q: z.string().trim().max(100).optional(),
});
const userResponse = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  lastLoginAt: z.string().optional(),
});

mountRoutes(userRouter, "/users", [
  {
    method: "get",
    path: "/",
    tags: ["Users"],
    auth: ["admin"],
    summary: "List users",
    query: listUsersQuery,
    response: z.array(userResponse),
    handler: c.list,
  },
  {
    method: "post",
    path: "/",
    tags: ["Users"],
    auth: ["admin"],
    status: 201,
    summary: "Create a staff account (admin, parish_priest or customer_care)",
    body: createStaffBody,
    response: userResponse,
    handler: c.create,
  },
  {
    method: "patch",
    path: "/:id",
    tags: ["Users"],
    auth: ["admin"],
    summary:
      "Update name, role or active flag. Role/active changes revoke the user's sessions.",
    params: idParams,
    body: updateUserBody,
    response: userResponse,
    handler: c.update,
  },
  {
    method: "post",
    path: "/:id/reset-password",
    tags: ["Users"],
    auth: ["admin"],
    summary: "Set a new password for a user and revoke their sessions",
    params: idParams,
    body: resetPasswordBody,
    handler: c.resetPassword,
  },
  {
    method: "post",
    path: "/:id/revoke-sessions",
    tags: ["Users"],
    auth: ["admin"],
    summary: "Force sign-out of a user everywhere",
    params: idParams,
    handler: c.revokeSessions,
  },
]);
