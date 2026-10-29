import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import type { Request, RequestHandler, Response } from "express";
import multer from "multer";
import { env } from "../config/env";
import { AppError, ok } from "../middleware/http";
import { audit } from "../models/AuditLog";
import { UploadedFile } from "../models/UploadedFile";
export const uploadRoot = path.resolve(env.UPLOAD_DIR);
fs.mkdirSync(uploadRoot, { recursive: true, mode: 0o700 });

/** MIME type -> extension we assign ourselves. The client-supplied file name is never used on disk. */
const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) =>
    cb(null, `${crypto.randomUUID()}${EXT[file.mimetype] ?? ".bin"}`),
});

const uploader = multer({
  storage,
  limits: {
    fileSize: env.UPLOAD_MAX_FILE_MB * 1024 * 1024,
    files: env.UPLOAD_MAX_FILES,
    fields: 5,
    parts: env.UPLOAD_MAX_FILES + 5,
  },
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) return cb(null, true);
    cb(
      new AppError(
        415,
        "UNSUPPORTED_FILE_TYPE",
        "Only JPEG, PNG, WebP images and PDF files are accepted",
      ),
    );
  },
});

export const uploadFilesMiddleware: RequestHandler = uploader.array(
  "files",
  env.UPLOAD_MAX_FILES,
);

/** Verifies real file content (magic bytes) rather than trusting the declared MIME type. */
export async function sniffMime(filePath: string): Promise<string | null> {
  const fh = await fsp.open(filePath, "r");
  try {
    const buf = Buffer.alloc(12);
    await fh.read(buf, 0, 12, 0);
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
      return "image/jpeg";
    if (
      buf
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return "image/png";
    if (
      buf.subarray(0, 4).toString("ascii") === "RIFF" &&
      buf.subarray(8, 12).toString("ascii") === "WEBP"
    )
      return "image/webp";
    if (buf.subarray(0, 5).toString("ascii") === "%PDF-")
      return "application/pdf";
    return null;
  } finally {
    await fh.close();
  }
}

function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
}

export async function discardFiles(
  files: Express.Multer.File[],
): Promise<void> {
  await Promise.all(
    files.map((f) => fsp.unlink(f.path).catch(() => undefined)),
  );
}

export async function registerUploads(req: Request) {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (!files.length)
    throw AppError.badRequest('Attach at least one file in the "files" field');
  try {
    const docs = [];
    for (const f of files) {
      const real = await sniffMime(f.path);
      if (!real || real !== f.mimetype) {
        throw new AppError(
          415,
          "FILE_CONTENT_MISMATCH",
          `File content does not match its declared type (${f.originalname.slice(0, 60)})`,
        );
      }
      docs.push({
        storedName: f.filename,
        originalName: path.basename(f.originalname).slice(0, 255),
        mimeType: real,
        size: f.size,
        sha256: await hashFile(f.path),
        uploadedBy: req.user!.id,
      });
    }
    const created = await UploadedFile.insertMany(docs);
    return created.map(toView);
  } catch (e) {
    await discardFiles(files); // all-or-nothing
    throw e;
  }
}

export const toView = (f: {
  _id: unknown;
  originalName?: string | null;
  mimeType: string;
  size: number;
  sha256: string;
  uploadedBy: unknown;
  createdAt?: Date;
}) => ({
  id: String(f._id),
  originalName: f.originalName,
  mimeType: f.mimeType,
  size: f.size,
  sha256: f.sha256,
  uploadedBy: String(f.uploadedBy),
  createdAt: f.createdAt,
});

/** Resolves a stored file to an absolute path, refusing anything that escapes the private upload directory. */
export function resolveStoredPath(storedName: string): string {
  const full = path.resolve(uploadRoot, storedName);
  if (!full.startsWith(uploadRoot + path.sep))
    throw AppError.forbidden("Invalid file path");
  return full;
}

// ───────────── handlers ─────────────
export const uploadController = {
  create: async (req: Request, res: Response) => {
    const files = await registerUploads(req);
    await audit(req, "upload.created", { meta: { count: files.length } });
    ok(res, files, 201);
  },
  get: async (req: Request, res: Response) => {
    const f: any = await UploadedFile.findById(req.params.id).lean();
    if (!f) throw AppError.notFound("File not found");
    ok(res, toView(f));
  },
  file: async (req: Request, res: Response) => {
    const f: any = await UploadedFile.findById(req.params.id).lean();
    if (!f) throw AppError.notFound("File not found");
    const full = resolveStoredPath(f.storedName);
    if (!fs.existsSync(full))
      throw AppError.notFound("File content is missing from storage");
    await audit(req, "upload.accessed", {
      targetType: "UploadedFile",
      targetId: req.params.id,
    });
    res.setHeader("Content-Type", f.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="scan-${String(f._id)}"`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    fs.createReadStream(full).pipe(res);
  },
};
