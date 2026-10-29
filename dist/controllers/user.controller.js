"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userController = void 0;
exports.listUsers = listUsers;
exports.createStaff = createStaff;
exports.updateUser = updateUser;
exports.adminResetPassword = adminResetPassword;
const helpers_1 = require("../helpers");
const http_1 = require("../middleware/http");
const AuditLog_1 = require("../models/AuditLog");
const User_1 = require("../models/User");
const auth_controller_1 = require("./auth.controller");
const view = (u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
});
async function listUsers(q) {
    const filter = {};
    if (q.role)
        filter.role = q.role;
    if (q.q) {
        const rx = new RegExp((0, helpers_1.escapeRegex)(q.q), "i");
        filter.$or = [{ name: rx }, { email: rx }];
    }
    const [items, total] = await Promise.all([
        User_1.User.find(filter)
            .sort({ createdAt: -1 })
            .skip((q.page - 1) * q.limit)
            .limit(q.limit)
            .lean(),
        User_1.User.countDocuments(filter),
    ]);
    return { items: items.map(view), total };
}
async function createStaff(input, actorId) {
    if (await User_1.User.exists({ email: input.email }))
        throw http_1.AppError.conflict("An account with this email already exists");
    const u = await User_1.User.create({
        name: input.name,
        email: input.email,
        role: input.role,
        passwordHash: await (0, auth_controller_1.hashPassword)(input.password),
        createdBy: actorId,
    });
    return view(u.toObject());
}
async function activeAdminCount() {
    return User_1.User.countDocuments({ role: "admin", isActive: true });
}
async function updateUser(id, patch, actorId) {
    const user = await User_1.User.findById(id);
    if (!user)
        throw http_1.AppError.notFound("User not found");
    const demotes = (patch.role && patch.role !== "admin" && user.role === "admin") ||
        (patch.isActive === false && user.role === "admin" && user.isActive);
    if (demotes && (await activeAdminCount()) <= 1)
        throw http_1.AppError.unprocessable("LAST_ADMIN", "The last active administrator cannot be demoted or deactivated");
    if (id === actorId && (patch.role || patch.isActive === false))
        throw http_1.AppError.unprocessable("SELF_CHANGE", "You cannot change your own role or deactivate yourself");
    const securityChange = (patch.role && patch.role !== user.role) || patch.isActive === false;
    Object.assign(user, patch);
    if (securityChange)
        user.tokenVersion += 1;
    await user.save();
    if (securityChange)
        await (0, auth_controller_1.revokeAllSessions)(id);
    return view(user.toObject());
}
async function adminResetPassword(id, newPassword) {
    const user = await User_1.User.findById(id).select("+passwordHash");
    if (!user)
        throw http_1.AppError.notFound("User not found");
    user.passwordHash = await (0, auth_controller_1.hashPassword)(newPassword);
    user.tokenVersion += 1;
    await user.save();
    await (0, auth_controller_1.revokeAllSessions)(id);
}
// ───────────── handlers ─────────────
exports.userController = {
    list: async (req, res) => {
        const q = req.query;
        const { items, total } = await listUsers(q);
        (0, http_1.paged)(res, items, q.page, q.limit, total);
    },
    create: async (req, res) => {
        const u = await createStaff(req.body, req.user.id);
        await (0, AuditLog_1.audit)(req, "user.created", {
            targetType: "User",
            targetId: String(u.id),
            meta: { role: u.role },
        });
        (0, http_1.ok)(res, u, 201);
    },
    update: async (req, res) => {
        const u = await updateUser(req.params.id, req.body, req.user.id);
        await (0, AuditLog_1.audit)(req, "user.updated", {
            targetType: "User",
            targetId: req.params.id,
            meta: { fields: Object.keys(req.body) },
        });
        (0, http_1.ok)(res, u);
    },
    resetPassword: async (req, res) => {
        await adminResetPassword(req.params.id, req.body.newPassword);
        await (0, AuditLog_1.audit)(req, "user.password_reset", {
            targetType: "User",
            targetId: req.params.id,
        });
        (0, http_1.ok)(res, { reset: true });
    },
    revokeSessions: async (req, res) => {
        await User_1.User.updateOne({ _id: req.params.id }, { $inc: { tokenVersion: 1 } });
        await (0, auth_controller_1.revokeAllSessions)(req.params.id);
        await (0, AuditLog_1.audit)(req, "user.sessions_revoked", {
            targetType: "User",
            targetId: req.params.id,
        });
        (0, http_1.ok)(res, { revoked: true });
    },
};
//# sourceMappingURL=user.controller.js.map