import { Router } from "express";
import { z } from "zod";
import { revisionController as c } from "../controllers/revision.controller";
import { idParams, objectIdSchema } from "../helpers";
import { REGISTER_KEYS } from "../models/registers";
import { mountRoutes } from "./define";

export const revisionRouter = Router();
const query = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  registerKey: z.enum(REGISTER_KEYS).optional(),
  recordId: objectIdSchema.optional(),
});

mountRoutes(revisionRouter, "/revisions", [
  {
    method: "get",
    path: "/",
    tags: ["Revisions"],
    auth: ["admin", "parish_priest"],
    query,
    summary:
      "Revision history across registers (append-only audit trail), filterable by register and record",
    handler: c.list,
  },
  {
    method: "get",
    path: "/:id",
    tags: ["Revisions"],
    auth: ["admin", "parish_priest"],
    params: idParams,
    summary: "One revision including before/after snapshots",
    handler: c.get,
  },
]);
