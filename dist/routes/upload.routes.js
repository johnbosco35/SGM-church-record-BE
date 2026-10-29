"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const upload_controller_1 = require("../controllers/upload.controller");
const helpers_1 = require("../helpers");
const rateLimit_1 = require("../middleware/rateLimit");
const define_1 = require("./define");
exports.uploadRouter = (0, express_1.Router)();
const staff = ["admin", "parish_priest"];
const fileView = zod_1.z.object({
    id: zod_1.z.string(),
    originalName: zod_1.z.string().optional(),
    mimeType: zod_1.z.string(),
    size: zod_1.z.number(),
    sha256: zod_1.z.string(),
});
(0, define_1.mountRoutes)(exports.uploadRouter, "/uploads", [
    {
        method: "post",
        path: "/",
        tags: ["Uploads"],
        auth: staff,
        status: 201,
        multipart: true,
        summary: 'Upload scanned register pages / photos / PDFs (multipart field "files"; JPEG, PNG, WebP, PDF). Stored privately, content verified by magic bytes.',
        docBody: zod_1.z.object({
            files: zod_1.z.array(zod_1.z.string().describe("binary file")).max(30),
        }),
        response: zod_1.z.array(fileView),
        middleware: [rateLimit_1.uploadLimiter, upload_controller_1.uploadFilesMiddleware],
        handler: upload_controller_1.uploadController.create,
    },
    {
        method: "get",
        path: "/:id",
        tags: ["Uploads"],
        auth: staff,
        params: helpers_1.idParams,
        summary: "Upload metadata",
        response: fileView,
        handler: upload_controller_1.uploadController.get,
    },
    {
        method: "get",
        path: "/:id/file",
        tags: ["Uploads"],
        auth: staff,
        params: helpers_1.idParams,
        summary: "Stream the private file to an authorised staff member (never publicly served)",
        contentType: "application/octet-stream",
        handler: upload_controller_1.uploadController.file,
    },
]);
//# sourceMappingURL=upload.routes.js.map