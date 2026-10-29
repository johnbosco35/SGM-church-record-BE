import { Router } from "express";
import { z, type ZodTypeAny } from "zod";
import { RECORD_STATUSES } from "../config/constants";
import type { RegisterDef, FieldDef } from "../config/registerTypes";
import { createRegisterController } from "../controllers/register.controller";
import { buildTree, idParams, partialDate, type Tree } from "../helpers";
import { REGISTERS, type RegisterModel } from "../models/registers";
import { mountRoutes, type RouteSpec } from "./define";

// ───────────── Zod schemas generated from the register field definitions ─────────────

const leafZod = (f: FieldDef): ZodTypeAny => {
  switch (f.type) {
    case "date":
      return partialDate.optional();
    case "number":
      return z.number().min(0).max(1_000_000_000).optional();
    default:
      return z
        .string()
        .trim()
        .max(f.maxLength ?? 500)
        .optional();
  }
};

function treeToZod(tree: Tree): ZodTypeAny {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [k, v] of Object.entries(tree)) {
    shape[k] =
      v instanceof z.ZodType
        ? (v as ZodTypeAny)
        : treeToZod(v as Tree).optional();
  }
  return z.object(shape).strict();
}

const extras = {
  /** Dotted paths the author wants a reviewer to double-check. */
  uncertainFields: z.array(z.string().max(100)).max(100).optional(),
  revisionReason: z.string().trim().min(3).max(2000).optional(),
};

/** Body for POST: every register column is optional so drafts can be saved incrementally. Unknown keys are rejected (no mass assignment of status, signature, etc.). */
export function buildCreateSchema(def: RegisterDef): ZodTypeAny {
  const base = treeToZod(
    buildTree(def.fields, leafZod),
  ) as z.ZodObject<z.ZodRawShape>;
  return base.extend(extras).strict();
}

export function buildUpdateSchema(def: RegisterDef): ZodTypeAny {
  const base = treeToZod(
    buildTree(def.fields, leafZod),
  ) as z.ZodObject<z.ZodRawShape>;
  return base
    .extend({ ...extras, expectedVersion: z.number().int().min(1).optional() })
    .strict();
}

export function buildRecordResponseSchema(def: RegisterDef): ZodTypeAny {
  const tree = buildTree(def.fields, (f) =>
    f.type === "number" ? z.number().optional() : z.string().optional(),
  );
  const body = treeToZod(tree) as z.ZodObject<z.ZodRawShape>;
  return body
    .extend({
      id: z.string(),
      status: z.enum(RECORD_STATUSES),
      version: z.number().int(),
      eventYear: z.number().int().optional(),
      source: z.enum(["manual", "extraction"]),
      uncertainFields: z.array(z.string()),
    })
    .passthrough();
}

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  status: z.enum(RECORD_STATUSES).optional(),
  year: z.coerce.number().int().min(1000).max(2200).optional(),
  yearFrom: z.coerce.number().int().min(1000).max(2200).optional(),
  yearTo: z.coerce.number().int().min(1000).max(2200).optional(),
  source: z.enum(["manual", "extraction"]).optional(),
  sort: z
    .string()
    .regex(/^[A-Za-z.]+(:(asc|desc))?$/)
    .optional(),
});
export const exportQuerySchema = listQuerySchema.omit({
  page: true,
  limit: true,
});

export const transitionBody = z
  .object({ note: z.string().trim().max(2000).optional() })
  .strict();
export const correctionBody = z
  .object({
    note: z.string().trim().min(3, "Explain what must be corrected").max(2000),
  })
  .strict();
export const signBody = z.object({ confirm: z.literal(true) }).strict();
const recordIdParams = idParams;
export const revisionsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// ───────────── router factory (one implementation for all seven registers) ─────────────
/**
 * Creates the router for one sacramental register. There is intentionally NO delete route:
 * official records are corrected through audited revisions, never removed.
 */
export function createRegisterRouter(
  def: RegisterDef,
  model: RegisterModel,
): Router {
  const router = Router();
  const c = createRegisterController(def, model);
  const tags = [def.title];
  const record = buildRecordResponseSchema(def);
  const base = `/${def.slug}`;

  const specs: RouteSpec[] = [
    {
      method: "get",
      path: "/",
      tags,
      auth: def.readRoles,
      summary: `List ${def.title} entries (search, filter by event year/status, sort, paginate)`,
      query: listQuerySchema,
      response: z.array(record),
      handler: c.list,
    },
    // Export/print routes are declared before "/:id" so they are not captured as ids.
    {
      method: "get",
      path: "/export.csv",
      tags,
      auth: def.readRoles,
      summary: "Export matching entries as CSV (spreadsheet-formula safe)",
      query: exportQuerySchema,
      contentType: "text/csv",
      handler: c.exportCsv,
    },
    {
      method: "get",
      path: "/export.docx",
      tags,
      auth: def.readRoles,
      summary: "Export matching entries as an editable Word table",
      query: exportQuerySchema,
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      handler: c.exportDocx,
    },
    {
      method: "get",
      path: "/print",
      tags,
      auth: def.readRoles,
      summary: "Print-friendly data (headers + rows in register column order)",
      query: exportQuerySchema,
      handler: c.print,
    },
    {
      method: "post",
      path: "/",
      tags,
      auth: def.writeRoles,
      status: 201,
      summary:
        "Create a draft entry manually. Returns duplicate warnings in meta.warnings; never merges.",
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
      summary:
        "Correct an entry. Previous version is preserved in revision history; editing a verified entry requires revisionReason and returns it to pending_review.",
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
      body: transitionBody,
      response: record,
      handler: c.submit,
    },
    {
      method: "post",
      path: "/:id/request-correction",
      tags,
      auth: def.verifyRoles,
      summary:
        "Send a pending_review entry back for correction (note required)",
      params: recordIdParams,
      body: correctionBody,
      response: record,
      handler: c.requestCorrection,
    },
    {
      method: "post",
      path: "/:id/verify",
      tags,
      auth: def.verifyRoles,
      summary:
        "Verify a pending_review entry. Blocked while fields are flagged uncertain.",
      params: recordIdParams,
      body: transitionBody,
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
      summary:
        "Revision history / audit trail for this entry (includes the previous versions)",
      params: recordIdParams,
      query: revisionsQuery,
      handler: c.revisions,
    },
  ];

  if (def.hasPriestSignature) {
    specs.push({
      method: "post",
      path: "/:id/sign",
      tags,
      auth: ["parish_priest"],
      summary:
        "Parish priest signature workflow. Only an authenticated parish_priest account can sign; admins cannot sign on the priest's behalf.",
      params: recordIdParams,
      body: signBody,
      response: record,
      handler: c.sign,
    });
  }

  mountRoutes(router, base, specs);
  return router;
}

/** One router per register. There is intentionally NO delete route for any of them. */
export const registerRouters: Array<[string, Router]> = REGISTERS.map(
  ({ def, model }) => [`/${def.slug}`, createRegisterRouter(def, model)],
);
