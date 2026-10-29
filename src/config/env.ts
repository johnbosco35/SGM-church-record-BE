import "dotenv/config";
import { z } from "zod";

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  ALLOW_PUBLIC_REGISTRATION: bool.default("false"),

  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["strict", "lax", "none"]).default("lax"),
  COOKIE_SECURE: bool.optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  UPLOAD_DIR: z.string().default("./uploads"),
  UPLOAD_MAX_FILE_MB: z.coerce.number().min(1).max(50).default(10),
  UPLOAD_MAX_FILES: z.coerce.number().int().min(1).max(30).default(10),

  EXTRACTION_PROVIDER: z.enum(["mock"]).default("mock"),
  CHAT_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  CHAT_MODEL: z.string().default("claude-sonnet-5-5"),

  BODY_LIMIT_KB: z.coerce.number().int().min(10).max(1024).default(100),
  RATE_LIMIT_ENABLED: bool.default("true"),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_PUBLIC_FORM_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_CHAT_MAX: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_GENERAL_MAX: z.coerce.number().int().min(1).default(300),
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
  throw new Error(
    "JWT_ACCESS_SECRET looks like a placeholder; generate a real random secret for production",
  );
}
if (e.CHAT_PROVIDER === "anthropic" && !e.ANTHROPIC_API_KEY) {
  throw new Error("CHAT_PROVIDER=anthropic requires ANTHROPIC_API_KEY");
}

export const env = {
  ...e,
  isProd,
  isTest: e.NODE_ENV === "test",
  cookieSecure,
  corsOrigins: e.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  docsEnabled: e.ENABLE_DOCS ?? !isProd,
};
export type Env = typeof env;
