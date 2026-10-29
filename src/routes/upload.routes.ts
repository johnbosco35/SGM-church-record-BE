import { Router } from "express";
import { z } from "zod";
import {
  uploadController as c,
  uploadFilesMiddleware,
} from "../controllers/upload.controller";
import { idParams } from "../helpers";
import { uploadLimiter } from "../middleware/rateLimit";
import { mountRoutes } from "./define";

export const uploadRouter = Router();
const staff = ["admin", "parish_priest"] as const;
const fileView = z.object({
  id: z.string(),
  originalName: z.string().optional(),
  mimeType: z.string(),
  size: z.number(),
  sha256: z.string(),
});

mountRoutes(uploadRouter, "/uploads", [
  {
    method: "post",
    path: "/",
    tags: ["Uploads"],
    auth: staff,
    status: 201,
    multipart: true,
    summary:
      'Upload scanned register pages / photos / PDFs (multipart field "files"; JPEG, PNG, WebP, PDF). Stored privately, content verified by magic bytes.',
    docBody: z.object({
      files: z.array(z.string().describe("binary file")).max(30),
    }),
    response: z.array(fileView),
    middleware: [uploadLimiter, uploadFilesMiddleware],
    handler: c.create,
  },
  {
    method: "get",
    path: "/:id",
    tags: ["Uploads"],
    auth: staff,
    params: idParams,
    summary: "Upload metadata",
    response: fileView,
    handler: c.get,
  },
  {
    method: "get",
    path: "/:id/file",
    tags: ["Uploads"],
    auth: staff,
    params: idParams,
    summary:
      "Stream the private file to an authorised staff member (never publicly served)",
    contentType: "application/octet-stream",
    handler: c.file,
  },
]);
