"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.randomToken = exports.sha256 = exports.requireRoles = exports.authenticate = exports.CSRF_COOKIE = exports.REFRESH_COOKIE = exports.ACCESS_COOKIE = void 0;
exports.signAccessToken = signAccessToken;
exports.safeEqual = safeEqual;
const node_crypto_1 = __importDefault(require("node:crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const User_1 = require("../models/User");
const http_1 = require("./http");
exports.ACCESS_COOKIE = "access_token";
exports.REFRESH_COOKIE = "refresh_token";
exports.CSRF_COOKIE = "csrf_token";
function signAccessToken(user) {
    const payload = {
        sub: user.id,
        role: user.role,
        tv: user.tokenVersion,
    };
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_ACCESS_SECRET, {
        algorithm: "HS256",
        expiresIn: `${env_1.env.ACCESS_TOKEN_TTL_MINUTES}m`,
        issuer: "church-api",
    });
}
/** Requires a valid access-token cookie and a currently active account whose token version still matches. */
const authenticate = async (req, _res, next) => {
    try {
        const token = req.cookies?.[exports.ACCESS_COOKIE];
        if (!token)
            throw http_1.AppError.unauthorized();
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET, {
                algorithms: ["HS256"],
                issuer: "church-api",
            });
        }
        catch {
            throw http_1.AppError.unauthorized("Session expired or invalid");
        }
        const user = await User_1.User.findById(payload.sub).lean();
        if (!user || !user.isActive || user.tokenVersion !== payload.tv)
            throw http_1.AppError.unauthorized("Session expired or invalid");
        // Role always comes from the database, never from the token.
        req.user = {
            id: String(user._id),
            name: user.name,
            email: user.email,
            role: user.role,
        };
        next();
    }
    catch (err) {
        next(err);
    }
};
exports.authenticate = authenticate;
const requireRoles = (...roles) => (req, _res, next) => {
    if (!req.user)
        return next(http_1.AppError.unauthorized());
    if (!roles.includes(req.user.role))
        return next(http_1.AppError.forbidden());
    next();
};
exports.requireRoles = requireRoles;
// ───────────── token helpers ─────────────
const sha256 = (v) => node_crypto_1.default.createHash("sha256").update(v).digest("hex");
exports.sha256 = sha256;
const randomToken = (bytes = 48) => node_crypto_1.default.randomBytes(bytes).toString("base64url");
exports.randomToken = randomToken;
function safeEqual(a, b) {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && node_crypto_1.default.timingSafeEqual(ab, bb);
}
//# sourceMappingURL=auth.js.map