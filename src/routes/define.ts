import type { Request, RequestHandler, Response, Router } from "express";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { API_PREFIX, type Role } from "../config/constants";
import { authenticate, requireRoles } from "../middleware/auth";
import { asyncHandler } from "../middleware/http";
import { validate } from "../middleware/validate";

// ───────────── OpenAPI registry ─────────────
export interface OperationDoc {
  method: "get" | "post" | "put" | "patch" | "delete";
  fullPath: string;
  summary: string;
  description?: string;
  tags: string[];
  auth: "public" | "authenticated" | readonly Role[];
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  response?: ZodTypeAny;
  status?: number;
  contentType?: string;
  multipart?: boolean;
}

const operations: OperationDoc[] = [];
export const registerOperation = (op: OperationDoc): void => {
  operations.push(op);
};
export const listOperations = (): readonly OperationDoc[] => operations;

const toSchema = (s: any): Record<string, unknown> => {
  const { $schema: _ignored, ...rest } = zodToJsonSchema(s, {
    target: "openApi3",
    $refStrategy: "none",
  }) as Record<string, unknown>;
  return rest;
};

const errorSchema = {
  type: "object",
  properties: {
    success: { type: "boolean", example: false },
    error: {
      type: "object",
      properties: {
        code: { type: "string", example: "VALIDATION_ERROR" },
        message: { type: "string" },
        details: {},
      },
      required: ["code", "message"],
    },
  },
};

export function buildOpenApiDocument(): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const op of operations) {
    const path = op.fullPath.replace(/:([A-Za-z]+)/g, "{$1}");
    const parameters: unknown[] = [];

    if (op.params) {
      const js = toSchema(op.params) as {
        properties?: Record<string, unknown>;
      };
      for (const [name, schema] of Object.entries(js.properties ?? {}))
        parameters.push({ name, in: "path", required: true, schema });
    }
    if (op.query) {
      const js = toSchema(op.query) as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      for (const [name, schema] of Object.entries(js.properties ?? {})) {
        parameters.push({
          name,
          in: "query",
          required: (js.required ?? []).includes(name),
          schema,
        });
      }
    }

    const secured = op.auth !== "public";
    const roleText = Array.isArray(op.auth)
      ? `Roles: ${(op.auth as readonly string[]).join(", ")}.`
      : op.auth === "authenticated"
        ? "Any authenticated user."
        : "Public.";
    const csrfText =
      secured && op.method !== "get"
        ? " Unsafe methods require the X-CSRF-Token header (value of the csrf_token cookie)."
        : "";

    const okStatus = String(op.status ?? 200);
    const dataSchema = op.response ? toSchema(op.response) : {};
    const content =
      op.contentType && op.contentType !== "application/json"
        ? { [op.contentType]: { schema: { type: "string", format: "binary" } } }
        : {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: dataSchema,
                  meta: { type: "object" },
                },
              },
            },
          };

    paths[path] ??= {};
    paths[path][op.method] = {
      tags: op.tags,
      summary: op.summary,
      description:
        `${op.description ? op.description + " " : ""}${roleText}${csrfText}`.trim(),
      ...(secured ? { security: [{ cookieAuth: [] }] } : {}),
      ...(parameters.length ? { parameters } : {}),
      ...(op.body
        ? {
            requestBody: {
              required: true,
              content: op.multipart
                ? { "multipart/form-data": { schema: toSchema(op.body) } }
                : { "application/json": { schema: toSchema(op.body) } },
            },
          }
        : {}),
      responses: {
        [okStatus]: { description: "Success", content },
        400: {
          description: "Validation error",
          content: { "application/json": { schema: errorSchema } },
        },
        ...(secured
          ? {
              401: { description: "Not authenticated" },
              403: { description: "Forbidden / CSRF failure" },
            }
          : {}),
        429: { description: "Rate limited" },
      },
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "Catholic Church Website & Management System API",
      version: "1.0.0",
      description:
        "Authentication uses HttpOnly cookies (access_token, refresh_token). For unsafe methods on authenticated routes send the X-CSRF-Token header with the csrf_token cookie value (also returned by GET /auth/csrf). " +
        "Success envelope: {success:true,data,meta?}. Error envelope: {success:false,error:{code,message,details?}}. Official sacramental records have no DELETE endpoints.",
    },
    servers: [{ url: API_PREFIX }],
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "access_token" },
      },
    },
    paths: Object.fromEntries(
      Object.entries(paths).map(([p, v]) => [
        p.slice(API_PREFIX.length) || "/",
        v,
      ]),
    ),
  };
}

// ───────────── route helper ─────────────
export type AuthSpec = "public" | "authenticated" | readonly Role[];

export interface RouteSpec {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  auth: AuthSpec;
  body?: ZodTypeAny;
  /** Documentation-only request schema (e.g. multipart bodies that are parsed by multer, not Zod). */
  docBody?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  response?: ZodTypeAny;
  status?: number;
  contentType?: string;
  multipart?: boolean;
  /** Runs after auth and before validation (e.g. rate limiters, multer). */
  middleware?: RequestHandler[];
  handler: (req: Request, res: Response) => unknown;
}

/**
 * Single source of truth: each spec becomes both an Express route (auth + roles + Zod validation)
 * and an OpenAPI operation, so the documented schemas can never drift from the enforced ones.
 */
export function mountRoutes(
  router: Router,
  basePath: string,
  specs: RouteSpec[],
): void {
  for (const s of specs) {
    const chain: RequestHandler[] = [];
    if (s.auth !== "public") {
      chain.push(authenticate);
      if (s.auth !== "authenticated") chain.push(requireRoles(...s.auth));
    }
    if (s.middleware) chain.push(...s.middleware);
    chain.push(validate({ body: s.body, query: s.query, params: s.params }));
    chain.push(asyncHandler((req, res) => s.handler(req, res)));

    (
      router[s.method] as unknown as (
        path: string,
        ...h: RequestHandler[]
      ) => Router
    ).call(router, s.path, ...chain);

    registerOperation({
      method: s.method,
      fullPath: `${API_PREFIX}${basePath}${s.path === "/" ? "" : s.path}`,
      summary: s.summary,
      description: s.description,
      tags: s.tags,
      auth: s.auth,
      body: s.body ?? s.docBody,
      query: s.query,
      params: s.params,
      response: s.response,
      status: s.status,
      contentType: s.contentType,
      multipart: s.multipart,
    });
  }
}
