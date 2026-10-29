"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRouters = exports.revisionsQuery = exports.signBody = exports.correctionBody = exports.transitionBody = exports.exportQuerySchema = exports.listQuerySchema = void 0;
exports.buildCreateSchema = buildCreateSchema;
exports.buildUpdateSchema = buildUpdateSchema;
exports.buildRecordResponseSchema = buildRecordResponseSchema;
exports.createRegisterRouter = createRegisterRouter;
const express_1 = require("express");
const zod_1 = require("zod");
const constants_1 = require("../config/constants");
const register_controller_1 = require("../controllers/register.controller");
const helpers_1 = require("../helpers");
const registers_1 = require("../models/registers");
const define_1 = require("./define");
// ───────────── Zod schemas generated from the register field definitions ─────────────
const leafZod = (f) => {
    switch (f.type) {
        case "date":
            return helpers_1.partialDate.optional();
        case "number":
            return zod_1.z.number().min(0).max(1_000_000_000).optional();
        default:
            return zod_1.z
                .string()
                .trim()
                .max(f.maxLength ?? 500)
                .optional();
    }
};
function treeToZod(tree) {
    const shape = {};
    for (const [k, v] of Object.entries(tree)) {
        shape[k] =
            v instanceof zod_1.z.ZodType
                ? v
                : treeToZod(v).optional();
    }
    return zod_1.z.object(shape).strict();
}
const extras = {
    /** Dotted paths the author wants a reviewer to double-check. */
    uncertainFields: zod_1.z.array(zod_1.z.string().max(100)).max(100).optional(),
    revisionReason: zod_1.z.string().trim().min(3).max(2000).optional(),
};
/** Body for POST: every register column is optional so drafts can be saved incrementally. Unknown keys are rejected (no mass assignment of status, signature, etc.). */
function buildCreateSchema(def) {
    const base = treeToZod((0, helpers_1.buildTree)(def.fields, leafZod));
    return base.extend(extras).strict();
}
function buildUpdateSchema(def) {
    const base = treeToZod((0, helpers_1.buildTree)(def.fields, leafZod));
    return base
        .extend({ ...extras, expectedVersion: zod_1.z.number().int().min(1).optional() })
        .strict();
}
function buildRecordResponseSchema(def) {
    const tree = (0, helpers_1.buildTree)(def.fields, (f) => f.type === "number" ? zod_1.z.number().optional() : zod_1.z.string().optional());
    const body = treeToZod(tree);
    return body
        .extend({
        id: zod_1.z.string(),
        status: zod_1.z.enum(constants_1.RECORD_STATUSES),
        version: zod_1.z.number().int(),
        eventYear: zod_1.z.number().int().optional(),
        source: zod_1.z.enum(["manual", "extraction"]),
        uncertainFields: zod_1.z.array(zod_1.z.string()),
    })
        .passthrough();
}
exports.listQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    q: zod_1.z.string().trim().max(100).optional(),
    status: zod_1.z.enum(constants_1.RECORD_STATUSES).optional(),
    year: zod_1.z.coerce.number().int().min(1000).max(2200).optional(),
    yearFrom: zod_1.z.coerce.number().int().min(1000).max(2200).optional(),
    yearTo: zod_1.z.coerce.number().int().min(1000).max(2200).optional(),
    source: zod_1.z.enum(["manual", "extraction"]).optional(),
    sort: zod_1.z
        .string()
        .regex(/^[A-Za-z.]+(:(asc|desc))?$/)
        .optional(),
});
exports.exportQuerySchema = exports.listQuerySchema.omit({
    page: true,
    limit: true,
});
exports.transitionBody = zod_1.z
    .object({ note: zod_1.z.string().trim().max(2000).optional() })
    .strict();
exports.correctionBody = zod_1.z
    .object({
    note: zod_1.z.string().trim().min(3, "Explain what must be corrected").max(2000),
})
    .strict();
exports.signBody = zod_1.z.object({ confirm: zod_1.z.literal(true) }).strict();
const recordIdParams = helpers_1.idParams;
exports.revisionsQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
});
// ───────────── router factory (one implementation for all seven registers) ─────────────
/**
 * Creates the router for one sacramental register. There is intentionally NO delete route:
 * official records are corrected through audited revisions, never removed.
 */
function createRegisterRouter(def, model) {
    const router = (0, express_1.Router)();
    const c = (0, register_controller_1.createRegisterController)(def, model);
    const tags = [def.title];
    const record = buildRecordResponseSchema(def);
    const base = `/${def.slug}`;
    const specs = [
        {
            method: "get",
            path: "/",
            tags,
            auth: def.readRoles,
            summary: `List ${def.title} entries (search, filter by event year/status, sort, paginate)`,
            query: exports.listQuerySchema,
            response: zod_1.z.array(record),
            handler: c.list,
        },
        // Export/print routes are declared before "/:id" so they are not captured as ids.
        {
            method: "get",
            path: "/export.csv",
            tags,
            auth: def.readRoles,
            summary: "Export matching entries as CSV (spreadsheet-formula safe)",
            query: exports.exportQuerySchema,
            contentType: "text/csv",
            handler: c.exportCsv,
        },
        {
            method: "get",
            path: "/export.docx",
            tags,
            auth: def.readRoles,
            summary: "Export matching entries as an editable Word table",
            query: exports.exportQuerySchema,
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            handler: c.exportDocx,
        },
        {
            method: "get",
            path: "/print",
            tags,
            auth: def.readRoles,
            summary: "Print-friendly data (headers + rows in register column order)",
            query: exports.exportQuerySchema,
            handler: c.print,
        },
        {
            method: "post",
            path: "/",
            tags,
            auth: def.writeRoles,
            status: 201,
            summary: "Create a draft entry manually. Returns duplicate warnings in meta.warnings; never merges.",
            body: buildCreateSchema(def),
            response: record,
            handler: c.create,
        },
        {
            method: "get",
            path: "/:id",
            tags,
            auth: def.readRoles,
            summary: "Entry detail",
            params: recordIdParams,
            response: record,
            handler: c.get,
        },
        {
            method: "patch",
            path: "/:id",
            tags,
            auth: def.writeRoles,
            summary: "Correct an entry. Previous version is preserved in revision history; editing a verified entry requires revisionReason and returns it to pending_review.",
            params: recordIdParams,
            body: buildUpdateSchema(def),
            response: record,
            handler: c.update,
        },
        {
            method: "post",
            path: "/:id/submit",
            tags,
            auth: def.writeRoles,
            summary: "Submit a draft/correction_required entry for review",
            params: recordIdParams,
            body: exports.transitionBody,
            response: record,
            handler: c.submit,
        },
        {
            method: "post",
            path: "/:id/request-correction",
            tags,
            auth: def.verifyRoles,
            summary: "Send a pending_review entry back for correction (note required)",
            params: recordIdParams,
            body: exports.correctionBody,
            response: record,
            handler: c.requestCorrection,
        },
        {
            method: "post",
            path: "/:id/verify",
            tags,
            auth: def.verifyRoles,
            summary: "Verify a pending_review entry. Blocked while fields are flagged uncertain.",
            params: recordIdParams,
            body: exports.transitionBody,
            response: record,
            handler: c.verify,
        },
        {
            method: "get",
            path: "/:id/duplicates",
            tags,
            auth: def.readRoles,
            summary: "Possible duplicate entries (warnings only)",
            params: recordIdParams,
            handler: c.duplicates,
        },
        {
            method: "get",
            path: "/:id/revisions",
            tags,
            auth: def.readRoles,
            summary: "Revision history / audit trail for this entry (includes the previous versions)",
            params: recordIdParams,
            query: exports.revisionsQuery,
            handler: c.revisions,
        },
    ];
    if (def.hasPriestSignature) {
        specs.push({
            method: "post",
            path: "/:id/sign",
            tags,
            auth: ["parish_priest"],
            summary: "Parish priest signature workflow. Only an authenticated parish_priest account can sign; admins cannot sign on the priest's behalf.",
            params: recordIdParams,
            body: exports.signBody,
            response: record,
            handler: c.sign,
        });
    }
    (0, define_1.mountRoutes)(router, base, specs);
    return router;
}
/** One router per register. There is intentionally NO delete route for any of them. */
exports.registerRouters = registers_1.REGISTERS.map(({ def, model }) => [`/${def.slug}`, createRegisterRouter(def, model)]);
//# sourceMappingURL=register.routes.js.map