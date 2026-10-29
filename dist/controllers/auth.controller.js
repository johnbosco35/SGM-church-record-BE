"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = exports.hashPassword = exports.toPublicUser = void 0;
exports.registerMember = registerMember;
exports.login = login;
exports.refresh = refresh;
exports.logout = logout;
exports.revokeAllSessions = revokeAllSessions;
exports.changePassword = changePassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const constants_1 = require("../config/constants");
const env_1 = require("../config/env");
const auth_1 = require("../middleware/auth");
const http_1 = require("../middleware/http");
const AuditLog_1 = require("../models/AuditLog");
const RefreshSession_1 = require("../models/RefreshSession");
const User_1 = require("../models/User");
// ───────────── account & session logic ─────────────
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Used to keep response time similar whether or not the email exists.
const DUMMY_HASH = bcryptjs_1.default.hashSync("not-a-real-password", 10);
const toPublicUser = (u) => ({
    id: String(u._id),
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
});
exports.toPublicUser = toPublicUser;
const hashPassword = (pw) => bcryptjs_1.default.hash(pw, env_1.env.BCRYPT_ROUNDS);
exports.hashPassword = hashPassword;
async function issueSession(user, meta, family = node_crypto_1.default.randomUUID()) {
    const refreshToken = (0, auth_1.randomToken)();
    await RefreshSession_1.RefreshSession.create({
        user: user._id,
        tokenHash: (0, auth_1.sha256)(refreshToken),
        family,
        expiresAt: new Date(Date.now() + env_1.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 300),
    });
    return {
        user: (0, exports.toPublicUser)(user),
        accessToken: (0, auth_1.signAccessToken)({
            id: String(user._id),
            role: user.role,
            tokenVersion: user.tokenVersion,
        }),
        refreshToken,
        csrfToken: (0, auth_1.randomToken)(24),
    };
}
async function registerMember(input, meta) {
    if (!env_1.env.ALLOW_PUBLIC_REGISTRATION)
        throw new http_1.AppError(403, "REGISTRATION_DISABLED", "Public registration is disabled. Contact the parish office.");
    if (await User_1.User.exists({ email: input.email }))
        throw http_1.AppError.conflict("An account with this email already exists");
    // Public registration can only ever create the no-privilege "member" role.
    const user = await User_1.User.create({
        name: input.name,
        email: input.email,
        passwordHash: await (0, exports.hashPassword)(input.password),
        role: "member",
    });
    return issueSession(user, meta);
}
async function login(email, password, meta) {
    const user = await User_1.User.findOne({ email }).select("+passwordHash +failedLoginCount +lockedUntil");
    const invalid = new http_1.AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    if (!user) {
        await bcryptjs_1.default.compare(password, DUMMY_HASH);
        throw invalid;
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new http_1.AppError(423, "ACCOUNT_LOCKED", "Account temporarily locked after repeated failed attempts. Try again later.");
    }
    const matches = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!matches || !user.isActive) {
        if (!matches) {
            user.failedLoginCount = (user.failedLoginCount ?? 0) + 1;
            if (user.failedLoginCount >= MAX_FAILED) {
                user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
                user.failedLoginCount = 0;
            }
            await user.save();
        }
        throw invalid;
    }
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save();
    return issueSession(user, meta);
}
/** Rotates the refresh token. Presenting an already-rotated token revokes the whole token family. */
async function refresh(rawToken, meta) {
    if (!rawToken)
        throw http_1.AppError.unauthorized();
    const tokenHash = (0, auth_1.sha256)(rawToken);
    const now = new Date();
    // Atomic claim: only one concurrent request can rotate a given token.
    const claimed = await RefreshSession_1.RefreshSession.findOneAndUpdate({ tokenHash, revokedAt: null, expiresAt: { $gt: now } }, { revokedAt: now, revokedReason: "rotated" }, { new: false });
    if (!claimed) {
        const existing = await RefreshSession_1.RefreshSession.findOne({ tokenHash });
        if (existing && existing.revokedReason === "rotated") {
            await RefreshSession_1.RefreshSession.updateMany({ family: existing.family, revokedAt: null }, { revokedAt: now, revokedReason: "reuse_detected" });
        }
        throw http_1.AppError.unauthorized("Session expired. Please sign in again.");
    }
    const user = await User_1.User.findById(claimed.user);
    if (!user || !user.isActive)
        throw http_1.AppError.unauthorized("Session expired. Please sign in again.");
    return issueSession(user, meta, claimed.family);
}
async function logout(rawToken) {
    if (!rawToken)
        return;
    await RefreshSession_1.RefreshSession.updateOne({ tokenHash: (0, auth_1.sha256)(rawToken), revokedAt: null }, { revokedAt: new Date(), revokedReason: "logout" });
}
async function revokeAllSessions(userId) {
    await RefreshSession_1.RefreshSession.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date(), revokedReason: "revoked_all" });
}
async function changePassword(userId, current, next) {
    const user = await User_1.User.findById(userId).select("+passwordHash");
    if (!user || !(await bcryptjs_1.default.compare(current, user.passwordHash)))
        throw new http_1.AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
    user.passwordHash = await (0, exports.hashPassword)(next);
    user.tokenVersion += 1; // invalidates every access token
    await user.save();
    await revokeAllSessions(userId);
}
// ───────────── cookies ─────────────
const cookieBase = () => ({
    secure: env_1.env.cookieSecure,
    sameSite: env_1.env.COOKIE_SAMESITE,
    domain: env_1.env.COOKIE_DOMAIN,
});
const meta = (req) => ({
    ip: req.ip,
    userAgent: req.get("user-agent"),
});
function setAuthCookies(res, r) {
    res.cookie(auth_1.ACCESS_COOKIE, r.accessToken, {
        ...cookieBase(),
        httpOnly: true,
        path: "/",
        maxAge: env_1.env.ACCESS_TOKEN_TTL_MINUTES * 60_000,
    });
    // Refresh cookie is only ever sent to the auth endpoints.
    res.cookie(auth_1.REFRESH_COOKIE, r.refreshToken, {
        ...cookieBase(),
        httpOnly: true,
        path: `${constants_1.API_PREFIX}/auth`,
        maxAge: env_1.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    });
    // Readable by the SPA so it can echo the value in X-CSRF-Token.
    res.cookie(auth_1.CSRF_COOKIE, r.csrfToken, {
        ...cookieBase(),
        httpOnly: false,
        path: "/",
        maxAge: env_1.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
    });
}
function clearAuthCookies(res) {
    const base = cookieBase();
    res.clearCookie(auth_1.ACCESS_COOKIE, { ...base, httpOnly: true, path: "/" });
    res.clearCookie(auth_1.REFRESH_COOKIE, {
        ...base,
        httpOnly: true,
        path: `${constants_1.API_PREFIX}/auth`,
    });
    res.clearCookie(auth_1.CSRF_COOKIE, { ...base, httpOnly: false, path: "/" });
}
// ───────────── handlers ─────────────
exports.authController = {
    register: async (req, res) => {
        const r = await registerMember(req.body, meta(req));
        setAuthCookies(res, r);
        (0, http_1.ok)(res, { user: r.user }, 201);
    },
    login: async (req, res) => {
        const r = await login(req.body.email, req.body.password, meta(req));
        setAuthCookies(res, r);
        await (0, AuditLog_1.audit)(req, "auth.login", {
            actorId: r.user.id,
            actorRole: r.user.role,
        });
        (0, http_1.ok)(res, { user: r.user, csrfToken: r.csrfToken });
    },
    refresh: async (req, res) => {
        try {
            const r = await refresh(req.cookies?.[auth_1.REFRESH_COOKIE], meta(req));
            setAuthCookies(res, r);
            (0, http_1.ok)(res, { user: r.user, csrfToken: r.csrfToken });
        }
        catch (e) {
            clearAuthCookies(res);
            throw e;
        }
    },
    logout: async (req, res) => {
        await logout(req.cookies?.[auth_1.REFRESH_COOKIE]);
        clearAuthCookies(res);
        (0, http_1.ok)(res, { loggedOut: true });
    },
    logoutAll: async (req, res) => {
        await revokeAllSessions(req.user.id);
        await User_1.User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
        clearAuthCookies(res);
        (0, http_1.ok)(res, { loggedOut: true });
    },
    me: (req, res) => (0, http_1.ok)(res, { user: req.user }),
    csrf: (_req, res) => {
        const token = (0, auth_1.randomToken)(24);
        res.cookie(auth_1.CSRF_COOKIE, token, {
            ...cookieBase(),
            httpOnly: false,
            path: "/",
            maxAge: env_1.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
        });
        (0, http_1.ok)(res, { csrfToken: token });
    },
    changePassword: async (req, res) => {
        await changePassword(req.user.id, req.body.currentPassword, req.body.newPassword);
        clearAuthCookies(res);
        await (0, AuditLog_1.audit)(req, "auth.password_changed");
        (0, http_1.ok)(res, { changed: true });
    },
};
//# sourceMappingURL=auth.controller.js.map