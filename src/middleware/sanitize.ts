import type { RequestHandler } from "express";

/** Rejects NoSQL-operator injection: any key starting with "$" or containing "." inside body/query/params. */
function hasBadKey(value: unknown, depth = 0): boolean {
  if (depth > 10) return true;
  if (Array.isArray(value)) return value.some((v) => hasBadKey(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([k, v]) =>
        k.startsWith("$") || k.includes(".") || hasBadKey(v, depth + 1),
    );
  }
  return false;
}

export const noSqlInjectionGuard: RequestHandler = (req, res, next) => {
  if (hasBadKey(req.body) || hasBadKey(req.query) || hasBadKey(req.params)) {
    res
      .status(400)
      .json({
        success: false,
        error: {
          code: "INVALID_INPUT",
          message: "Request contains disallowed characters in field names",
        },
      });
    return;
  }
  next();
};
