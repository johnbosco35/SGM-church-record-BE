import { Router } from "express";
import { z } from "zod";
import { extractionController as c } from "../controllers/extraction.controller";
import { idParams, objectIdSchema } from "../helpers";
import { uploadLimiter } from "../middleware/rateLimit";
import { REGISTER_KEYS } from "../models/registers";
import { mountRoutes } from "./define";

export const extractionRouter = Router();
const body = z
  .object({
    registerKey: z.enum(REGISTER_KEYS),
    fileIds: z.array(objectIdSchema).min(1).max(30),
  })
  .strict();

mountRoutes(extractionRouter, "/extractions", [
  {
    method: "post",
    path: "/",
    tags: ["Extractions"],
    auth: ["admin", "parish_priest"],
    status: 201,
    middleware: [uploadLimiter],
    body,
    summary:
      "Run the configured OCR/AI provider over uploaded files and create DRAFT records flagged for human review. With the mock provider no real extraction occurs (response says so).",
    handler: c.create,
  },
  {
    method: "get",
    path: "/:id",
    tags: ["Extractions"],
    auth: ["admin", "parish_priest"],
    params: idParams,
    summary: "Extraction job status and the drafts it produced",
    handler: c.get,
  },
]);
