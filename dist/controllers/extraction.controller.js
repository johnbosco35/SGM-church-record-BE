"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractionController = void 0;
exports.runExtraction = runExtraction;
exports.getJob = getJob;
const helpers_1 = require("../helpers");
const http_1 = require("../middleware/http");
const ExtractionJob_1 = require("../models/ExtractionJob");
const registers_1 = require("../models/registers");
const UploadedFile_1 = require("../models/UploadedFile");
const helpers_2 = require("../helpers");
const extraction_1 = require("../providers/extraction");
const register_controller_1 = require("./register.controller");
const upload_controller_1 = require("./upload.controller");
function setPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts.slice(0, -1))
        cur = (cur[p] ??= {});
    cur[parts[parts.length - 1]] = value;
}
/**
 * Turns provider output into a storable draft. Anything that can't be stored cleanly is kept in
 * `extraction.unparsedValues` and flagged uncertain — values are never silently discarded.
 */
function sanitize(def, rawFields, providerUncertain) {
    const fields = {};
    const unparsed = {};
    const uncertain = new Set(providerUncertain);
    for (const f of def.fields) {
        const raw = (0, helpers_1.getByPath)(rawFields, f.path) ?? rawFields[f.path];
        if ((0, helpers_1.isEmpty)(raw))
            continue;
        const text = String(raw).trim();
        if (f.type === "number") {
            const n = Number(text.replace(/[,\s]/g, ""));
            if (Number.isFinite(n) && n >= 0)
                setPath(fields, f.path, n);
            else {
                unparsed[f.path] = raw;
                uncertain.add(f.path);
            }
        }
        else if (f.type === "date") {
            setPath(fields, f.path, text.slice(0, 50));
            if (!helpers_2.partialDate.safeParse(text).success)
                uncertain.add(f.path); // kept as read, flagged
        }
        else if (text.length > (f.maxLength ?? 500)) {
            unparsed[f.path] = raw;
            uncertain.add(f.path);
        }
        else {
            setPath(fields, f.path, text);
        }
    }
    return { fields, unparsed, uncertain: [...uncertain] };
}
async function runExtraction(input, actor) {
    const { def, model } = (0, registers_1.getRegister)(input.registerKey);
    const files = await UploadedFile_1.UploadedFile.find({ _id: { $in: input.fileIds } }).lean();
    if (files.length !== new Set(input.fileIds).size)
        throw http_1.AppError.notFound("One or more uploaded files were not found");
    const provider = (0, extraction_1.getExtractionProvider)();
    const job = await ExtractionJob_1.ExtractionJob.create({
        registerKey: def.key,
        files: input.fileIds,
        provider: provider.name,
        isMock: provider.isMock,
        requestedBy: actor.id,
    });
    try {
        const result = await provider.extract({
            register: def,
            files: files.map((f) => ({
                id: String(f._id),
                path: (0, upload_controller_1.resolveStoredPath)(String(f.storedName)),
                mimeType: String(f.mimeType),
                originalName: f.originalName,
            })),
        });
        const service = new register_controller_1.RegisterService(def, model);
        const created = [];
        for (const r of result.records) {
            const { fields, unparsed, uncertain } = sanitize(def, r.fields, r.uncertainFields);
            const { record } = await service.create(fields, actor, {
                action: "extraction_create",
                uncertainFields: uncertain,
                sourceDocument: r.sourceFileId
                    ? { fileId: r.sourceFileId, page: r.page }
                    : undefined,
                extraction: {
                    jobId: job._id,
                    provider: result.providerName,
                    isMock: result.isMock,
                    confidence: r.confidence,
                    unparsedValues: Object.keys(unparsed).length ? unparsed : undefined,
                },
            });
            created.push(record);
        }
        job.status = "completed";
        job.warnings = result.warnings;
        job.createdRecordIds = created.map((c) => c.id);
        await job.save();
        return {
            jobId: String(job._id),
            provider: result.providerName,
            isMock: result.isMock,
            warnings: result.warnings,
            notice: "All extracted records are drafts. A human must review, correct, submit and verify them before they become official.",
            records: created,
        };
    }
    catch (e) {
        job.status = "failed";
        job.error =
            e instanceof Error ? e.message.slice(0, 500) : "Extraction failed";
        await job.save();
        throw e;
    }
}
async function getJob(id) {
    const job = await ExtractionJob_1.ExtractionJob.findById(id).lean();
    if (!job)
        throw http_1.AppError.notFound("Extraction job not found");
    return { ...job, id: String(job._id), _id: undefined, __v: undefined };
}
// ───────────── handlers ─────────────
exports.extractionController = {
    create: async (req, res) => (0, http_1.ok)(res, await runExtraction(req.body, req.user), 201),
    get: async (req, res) => (0, http_1.ok)(res, await getJob(req.params.id)),
};
//# sourceMappingURL=extraction.controller.js.map