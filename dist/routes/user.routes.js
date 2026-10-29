"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const constants_1 = require("../config/constants");
const user_controller_1 = require("../controllers/user.controller");
const helpers_1 = require("../helpers");
const define_1 = require("./define");
exports.userRouter = (0, express_1.Router)();
const createStaffBody = zod_1.z
    .object({
    name: zod_1.z.string().trim().min(2).max(120),
    email: helpers_1.emailSchema,
    password: helpers_1.passwordSchema,
    role: zod_1.z.enum(constants_1.STAFF_ROLES),
})
    .strict();
const updateUserBody = zod_1.z
    .object({
    name: zod_1.z.string().trim().min(2).max(120),
    role: zod_1.z.enum([...constants_1.STAFF_ROLES, "member"]),
    isActive: zod_1.z.boolean(),
})
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0, "Provide at least one field");
const resetPasswordBody = zod_1.z.object({ newPassword: helpers_1.passwordSchema }).strict();
const listUsersQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    role: zod_1.z.enum([...constants_1.STAFF_ROLES, "member"]).optional(),
    q: zod_1.z.string().trim().max(100).optional(),
});
const userResponse = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    email: zod_1.z.string(),
    role: zod_1.z.string(),
    isActive: zod_1.z.boolean(),
    lastLoginAt: zod_1.z.string().optional(),
});
(0, define_1.mountRoutes)(exports.userRouter, "/users", [
    {
        method: "get",
        path: "/",
        tags: ["Users"],
        auth: ["admin"],
        summary: "List users",
        query: listUsersQuery,
        response: zod_1.z.array(userResponse),
        handler: user_controller_1.userController.list,
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
        handler: user_controller_1.userController.create,
    },
    {
        method: "patch",
        path: "/:id",
        tags: ["Users"],
        auth: ["admin"],
        summary: "Update name, role or active flag. Role/active changes revoke the user's sessions.",
        params: helpers_1.idParams,
        body: updateUserBody,
        response: userResponse,
        handler: user_controller_1.userController.update,
    },
    {
        method: "post",
        path: "/:id/reset-password",
        tags: ["Users"],
        auth: ["admin"],
        summary: "Set a new password for a user and revoke their sessions",
        params: helpers_1.idParams,
        body: resetPasswordBody,
        handler: user_controller_1.userController.resetPassword,
    },
    {
        method: "post",
        path: "/:id/revoke-sessions",
        tags: ["Users"],
        auth: ["admin"],
        summary: "Force sign-out of a user everywhere",
        params: helpers_1.idParams,
        handler: user_controller_1.userController.revokeSessions,
    },
]);
//# sourceMappingURL=user.routes.js.map