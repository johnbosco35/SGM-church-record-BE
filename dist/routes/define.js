"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listOperations = exports.registerOperation = void 0;
exports.buildOpenApiDocument = buildOpenApiDocument;
exports.mountRoutes = mountRoutes;
const zod_to_json_schema_1 = require("zod-to-json-schema");
const constants_1 = require("../config/constants");
const auth_1 = require("../middleware/auth");
const http_1 = require("../middleware/http");
const validate_1 = require("../middleware/validate");
const operations = [];
const registerOperation = (op) => {
    operations.push(op);
};
exports.registerOperation = registerOperation;
const listOperations = () => operations;
exports.listOperations = listOperations;
const toSchema = (s) => {
    const { $schema: _ignored, ...rest } = (0, zod_to_json_schema_1.zodToJsonSchema)(s, {
        target: "openApi3",
        $refStrategy: "none",
    });
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
function buildOpenApiDocument() {
    const paths = {};
    for (const op of operations) {
        const path = op.fullPath.replace(/:([A-Za-z]+)/g, "{$1}");
        const parameters = [];
        if (op.params) {
            const js = toSchema(op.params);
            for (const [name, schema] of Object.entries(js.properties ?? {}))
                parameters.push({ name, in: "path", required: true, schema });
        }
        if (op.query) {
            const js = toSchema(op.query);
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
            ? `Roles: ${op.auth.join(", ")}.`
            : op.auth === "authenticated"
                ? "Any authenticated user."
                : "Public.";
        const csrfText = secured && op.method !== "get"
            ? " Unsafe methods require the X-CSRF-Token header (value of the csrf_token cookie)."
            : "";
        const okStatus = String(op.status ?? 200);
        const dataSchema = op.response ? toSchema(op.response) : {};
        const content = op.contentType && op.contentType !== "application/json"
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
            description: `${op.description ? op.description + " " : ""}${roleText}${csrfText}`.trim(),
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
            description: "Authentication uses HttpOnly cookies (access_token, refresh_token). For unsafe methods on authenticated routes send the X-CSRF-Token header with the csrf_token cookie value (also returned by GET /auth/csrf). " +
                "Success envelope: {success:true,data,meta?}. Error envelope: {success:false,error:{code,message,details?}}. Official sacramental records have no DELETE endpoints.",
        },
        servers: [{ url: constants_1.API_PREFIX }],
        components: {
            securitySchemes: {
                cookieAuth: { type: "apiKey", in: "cookie", name: "access_token" },
            },
        },
        paths: Object.fromEntries(Object.entries(paths).map(([p, v]) => [
            p.slice(constants_1.API_PREFIX.length) || "/",
            v,
        ])),
    };
}
/**
 * Single source of truth: each spec becomes both an Express route (auth + roles + Zod validation)
 * and an OpenAPI operation, so the documented schemas can never drift from the enforced ones.
 */
function mountRoutes(router, basePath, specs) {
    for (const s of specs) {
        const chain = [];
        if (s.auth !== "public") {
            chain.push(auth_1.authenticate);
            if (s.auth !== "authenticated")
                chain.push((0, auth_1.requireRoles)(...s.auth));
        }
        if (s.middleware)
            chain.push(...s.middleware);
        chain.push((0, validate_1.validate)({ body: s.body, query: s.query, params: s.params }));
        chain.push((0, http_1.asyncHandler)((req, res) => s.handler(req, res)));
        router[s.method].call(router, s.path, ...chain);
        (0, exports.registerOperation)({
            method: s.method,
            fullPath: `${constants_1.API_PREFIX}${basePath}${s.path === "/" ? "" : s.path}`,
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
//# sourceMappingURL=define.js.map