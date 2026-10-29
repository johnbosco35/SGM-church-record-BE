"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const bool = zod_1.z.enum(["true", "false"]).transform((v) => v === "true");
const schema = zod_1.z.object({
    NODE_ENV: zod_1.z
        .enum(["development", "test", "production"])
        .default("development"),
    PORT: zod_1.z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: zod_1.z.string().min(1, "MONGODB_URI is required"),
    JWT_ACCESS_SECRET: zod_1.z
        .string()
        .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
    ACCESS_TOKEN_TTL_MINUTES: zod_1.z.coerce.number().int().min(1).max(60).default(15),
    REFRESH_TOKEN_TTL_DAYS: zod_1.z.coerce.number().int().min(1).max(90).default(14),
    BCRYPT_ROUNDS: zod_1.z.coerce.number().int().min(4).max(15).default(12),
    ALLOW_PUBLIC_REGISTRATION: bool.default("false"),
    CORS_ORIGINS: zod_1.z.string().default("http://localhost:5173"),
    COOKIE_DOMAIN: zod_1.z.string().optional(),
    COOKIE_SAMESITE: zod_1.z.enum(["strict", "lax", "none"]).default("lax"),
    COOKIE_SECURE: bool.optional(),
    TRUST_PROXY: zod_1.z.coerce.number().int().min(0).default(0),
    UPLOAD_DIR: zod_1.z.string().default("./uploads"),
    UPLOAD_MAX_FILE_MB: zod_1.z.coerce.number().min(1).max(50).default(10),
    UPLOAD_MAX_FILES: zod_1.z.coerce.number().int().min(1).max(30).default(10),
    EXTRACTION_PROVIDER: zod_1.z.enum(["mock"]).default("mock"),
    CHAT_PROVIDER: zod_1.z.enum(["mock", "anthropic"]).default("mock"),
    ANTHROPIC_API_KEY: zod_1.z.string().optional(),
    CHAT_MODEL: zod_1.z.string().default("claude-sonnet-5-5"),
    BODY_LIMIT_KB: zod_1.z.coerce.number().int().min(10).max(1024).default(100),
    RATE_LIMIT_ENABLED: bool.default("true"),
    RATE_LIMIT_AUTH_MAX: zod_1.z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_PUBLIC_FORM_MAX: zod_1.z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_CHAT_MAX: zod_1.z.coerce.number().int().min(1).default(30),
    RATE_LIMIT_UPLOAD_MAX: zod_1.z.coerce.number().int().min(1).default(30),
    RATE_LIMIT_GENERAL_MAX: zod_1.z.coerce.number().int().min(1).default(300),
    ENABLE_DOCS: bool.optional(),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
    // Fail fast: never boot with a broken security configuration.
    throw new Error(`Invalid environment configuration:\n${issues}`);
}
const e = parsed.data;
const isProd = e.NODE_ENV === "production";
const cookieSecure = e.COOKIE_SECURE ?? isProd;
if (e.COOKIE_SAMESITE === "none" && !cookieSecure) {
    throw new Error("COOKIE_SAMESITE=none requires COOKIE_SECURE=true");
}
if (isProd && /change|replace|example|secret/i.test(e.JWT_ACCESS_SECRET)) {
    throw new Error("JWT_ACCESS_SECRET looks like a placeholder; generate a real random secret for production");
}
if (e.CHAT_PROVIDER === "anthropic" && !e.ANTHROPIC_API_KEY) {
    throw new Error("CHAT_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
}
exports.env = {
    ...e,
    isProd,
    isTest: e.NODE_ENV === "test",
    cookieSecure,
    corsOrigins: e.CORS_ORIGINS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    docsEnabled: e.ENABLE_DOCS ?? !isProd,
};
//# sourceMappingURL=env.js.map