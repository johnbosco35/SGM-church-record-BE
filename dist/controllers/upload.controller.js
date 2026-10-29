"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadController = exports.toView = exports.uploadFilesMiddleware = exports.uploadRoot = void 0;
exports.sniffMime = sniffMime;
exports.discardFiles = discardFiles;
exports.registerUploads = registerUploads;
exports.resolveStoredPath = resolveStoredPath;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const multer_1 = __importDefault(require("multer"));
const env_1 = require("../config/env");
const http_1 = require("../middleware/http");
const AuditLog_1 = require("../models/AuditLog");
const UploadedFile_1 = require("../models/UploadedFile");
exports.uploadRoot = node_path_1.default.resolve(env_1.env.UPLOAD_DIR);
node_fs_1.default.mkdirSync(exports.uploadRoot, { recursive: true, mode: 0o700 });
/** MIME type -> extension we assign ourselves. The client-supplied file name is never used on disk. */
const EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
};
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => cb(null, exports.uploadRoot),
    filename: (_req, file, cb) => cb(null, `${node_crypto_1.default.randomUUID()}${EXT[file.mimetype] ?? ".bin"}`),
});
const uploader = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: env_1.env.UPLOAD_MAX_FILE_MB * 1024 * 1024,
        files: env_1.env.UPLOAD_MAX_FILES,
        fields: 5,
        parts: env_1.env.UPLOAD_MAX_FILES + 5,
    },
    fileFilter: (_req, file, cb) => {
        if (EXT[file.mimetype])
            return cb(null, true);
        cb(new http_1.AppError(415, "UNSUPPORTED_FILE_TYPE", "Only JPEG, PNG, WebP images and PDF files are accepted"));
    },
});
exports.uploadFilesMiddleware = uploader.array("files", env_1.env.UPLOAD_MAX_FILES);
/** Verifies real file content (magic bytes) rather than trusting the declared MIME type. */
async function sniffMime(filePath) {
    const fh = await promises_1.default.open(filePath, "r");
    try {
        const buf = Buffer.alloc(12);
        await fh.read(buf, 0, 12, 0);
        if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
            return "image/jpeg";
        if (buf
            .subarray(0, 8)
            .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
            return "image/png";
        if (buf.subarray(0, 4).toString("ascii") === "RIFF" &&
            buf.subarray(8, 12).toString("ascii") === "WEBP")
            return "image/webp";
        if (buf.subarray(0, 5).toString("ascii") === "%PDF-")
            return "application/pdf";
        return null;
    }
    finally {
        await fh.close();
    }
}
function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const h = node_crypto_1.default.createHash("sha256");
        node_fs_1.default.createReadStream(filePath)
            .on("data", (d) => h.update(d))
            .on("end", () => resolve(h.digest("hex")))
            .on("error", reject);
    });
}
async function discardFiles(files) {
    await Promise.all(files.map((f) => promises_1.default.unlink(f.path).catch(() => undefined)));
}
async function registerUploads(req) {
    const files = req.files ?? [];
    if (!files.length)
        throw http_1.AppError.badRequest('Attach at least one file in the "files" field');
    try {
        const docs = [];
        for (const f of files) {
            const real = await sniffMime(f.path);
            if (!real || real !== f.mimetype) {
                throw new http_1.AppError(415, "FILE_CONTENT_MISMATCH", `File content does not match its declared type (${f.originalname.slice(0, 60)})`);
            }
            docs.push({
                storedName: f.filename,
                originalName: node_path_1.default.basename(f.originalname).slice(0, 255),
                mimeType: real,
                size: f.size,
                sha256: await hashFile(f.path),
                uploadedBy: req.user.id,
            });
        }
        const created = await UploadedFile_1.UploadedFile.insertMany(docs);
        return created.map(exports.toView);
    }
    catch (e) {
        await discardFiles(files); // all-or-nothing
        throw e;
    }
}
const toView = (f) => ({
    id: String(f._id),
    originalName: f.originalName,
    mimeType: f.mimeType,
    size: f.size,
    sha256: f.sha256,
    uploadedBy: String(f.uploadedBy),
    createdAt: f.createdAt,
});
exports.toView = toView;
/** Resolves a stored file to an absolute path, refusing anything that escapes the private upload directory. */
function resolveStoredPath(storedName) {
    const full = node_path_1.default.resolve(exports.uploadRoot, storedName);
    if (!full.startsWith(exports.uploadRoot + node_path_1.default.sep))
        throw http_1.AppError.forbidden("Invalid file path");
    return full;
}
// ───────────── handlers ─────────────
exports.uploadController = {
    create: async (req, res) => {
        const files = await registerUploads(req);
        await (0, AuditLog_1.audit)(req, "upload.created", { meta: { count: files.length } });
        (0, http_1.ok)(res, files, 201);
    },
    get: async (req, res) => {
        const f = await UploadedFile_1.UploadedFile.findById(req.params.id).lean();
        if (!f)
            throw http_1.AppError.notFound("File not found");
        (0, http_1.ok)(res, (0, exports.toView)(f));
    },
    file: async (req, res) => {
        const f = await UploadedFile_1.UploadedFile.findById(req.params.id).lean();
        if (!f)
            throw http_1.AppError.notFound("File not found");
        const full = resolveStoredPath(f.storedName);
        if (!node_fs_1.default.existsSync(full))
            throw http_1.AppError.notFound("File content is missing from storage");
        await (0, AuditLog_1.audit)(req, "upload.accessed", {
            targetType: "UploadedFile",
            targetId: req.params.id,
        });
        res.setHeader("Content-Type", f.mimeType);
        res.setHeader("Content-Disposition", `inline; filename="scan-${String(f._id)}"`);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "private, no-store");
        node_fs_1.default.createReadStream(full).pipe(res);
    },
};
//# sourceMappingURL=upload.controller.js.map