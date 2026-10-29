"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegisterService = exports.EXPORT_MAX_ROWS = void 0;
exports.buildDocx = buildDocx;
exports.createRegisterController = createRegisterController;
const docx_1 = require("docx");
const helpers_1 = require("../helpers");
const http_1 = require("../middleware/http");
const AuditLog_1 = require("../models/AuditLog");
const Revision_1 = require("../models/Revision");
/**
 * Editable Word table. A3 landscape for wide registers (>12 columns), A4 landscape otherwise.
 * Widths are explicit DXA values so the table renders the same in Word and LibreOffice.
 */
async function buildDocx({ title, headers, rows, note, }) {
    const wide = headers.length > 12;
    // docx-js expects portrait dimensions and swaps them when orientation is LANDSCAPE.
    const portrait = wide
        ? { width: 16838, height: 23811 }
        : { width: 11906, height: 16838 };
    const margin = 720;
    const contentWidth = portrait.height - margin * 2;
    const colWidth = Math.floor(contentWidth / headers.length);
    const fontSize = wide ? 14 : 18; // half-points
    const border = { style: docx_1.BorderStyle.SINGLE, size: 4, color: "999999" };
    const borders = { top: border, bottom: border, left: border, right: border };
    const cell = (text, header = false) => new docx_1.TableCell({
        width: { size: colWidth, type: docx_1.WidthType.DXA },
        borders,
        margins: { top: 40, bottom: 40, left: 60, right: 60 },
        ...(header
            ? {
                shading: { type: docx_1.ShadingType.CLEAR, fill: "E7E6E6", color: "auto" },
            }
            : {}),
        children: [
            new docx_1.Paragraph({
                children: [new docx_1.TextRun({ text, bold: header, size: fontSize })],
            }),
        ],
    });
    const table = new docx_1.Table({
        width: { size: colWidth * headers.length, type: docx_1.WidthType.DXA },
        columnWidths: headers.map(() => colWidth),
        rows: [
            new docx_1.TableRow({
                tableHeader: true,
                cantSplit: true,
                children: headers.map((h) => cell(h, true)),
            }),
            ...rows.map((r) => new docx_1.TableRow({ cantSplit: true, children: r.map((c) => cell(c)) })),
        ],
    });
    const doc = new docx_1.Document({
        creator: "Church Management System",
        title,
        sections: [
            {
                properties: {
                    page: {
                        size: {
                            width: portrait.width,
                            height: portrait.height,
                            orientation: docx_1.PageOrientation.LANDSCAPE,
                        },
                        margin: {
                            top: margin,
                            bottom: margin,
                            left: margin,
                            right: margin,
                        },
                    },
                },
                children: [
                    new docx_1.Paragraph({
                        heading: docx_1.HeadingLevel.HEADING_1,
                        alignment: docx_1.AlignmentType.CENTER,
                        children: [new docx_1.TextRun({ text: title })],
                    }),
                    ...(note
                        ? [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({ text: note, italics: true, size: 18 }),
                                ],
                                spacing: { after: 200 },
                            }),
                        ]
                        : []),
                    table,
                ],
            },
        ],
    });
    return docx_1.Packer.toBuffer(doc);
}
exports.EXPORT_MAX_ROWS = 5000;
function setByPath(obj, path, value) {
    const parts = path.split(".");
    let cur = obj;
    for (const p of parts.slice(0, -1)) {
        if (typeof cur[p] !== "object" || cur[p] === null)
            cur[p] = {};
        cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
}
class RegisterService {
    def;
    model;
    constructor(def, model) {
        this.def = def;
        this.model = model;
    }
    get hasNumber() {
        return this.def.fields.some((f) => f.path === "number");
    }
    snapshot(doc) {
        return (0, helpers_1.serialize)(JSON.parse(JSON.stringify(doc.toObject())));
    }
    applyDerived(doc) {
        const raw = doc.get(this.def.eventYearPath);
        let year;
        if (typeof raw === "number")
            year = raw;
        else if (typeof raw === "string") {
            const m = /^(\d{4})/.exec(raw);
            if (m)
                year = Number(m[1]);
        }
        doc.set("eventYear", year);
        const parts = this.def.duplicatePaths.map((p) => (0, helpers_1.normalizeKeyPart)(doc.get(p)));
        const filled = parts.filter(Boolean).length;
        doc.set("duplicateKey", filled >= Math.min(2, parts.length) ? parts.join("|") : undefined);
    }
    async mustFind(id) {
        const doc = await this.model.findById(id);
        if (!doc)
            throw http_1.AppError.notFound("Record not found");
        return doc;
    }
    diff(before, after) {
        const paths = [
            ...this.def.fields.map((f) => f.path),
            "status",
            "uncertainFields",
            "parishPriestSignature.status",
        ];
        return paths.filter((p) => JSON.stringify((0, helpers_1.getByPath)(before, p)) !==
            JSON.stringify((0, helpers_1.getByPath)(after, p)));
    }
    async findDuplicates(doc) {
        const or = [];
        const dk = doc.get("duplicateKey");
        if (dk)
            or.push({ duplicateKey: dk });
        const number = this.hasNumber
            ? doc.get("number")
            : undefined;
        if (number)
            or.push({ number });
        if (!or.length)
            return [];
        const matches = (await this.model
            .find({ _id: { $ne: doc._id }, $or: or })
            .select("number duplicateKey status")
            .limit(10)
            .lean());
        return matches.map((m) => ({
            recordId: String(m._id),
            number: m.number,
            status: m.status,
            reason: dk && m.duplicateKey === dk ? "same_identity" : "same_number",
        }));
    }
    async create(input, actor, opts = {}) {
        const { revisionReason, uncertainFields, ...fields } = input;
        const doc = new this.model({
            ...fields,
            status: "draft",
            version: 1,
            source: opts.extraction ? "extraction" : "manual",
            extraction: opts.extraction,
            sourceDocument: opts.sourceDocument,
            uncertainFields: opts.uncertainFields ?? uncertainFields ?? [],
            createdBy: actor.id,
            updatedBy: actor.id,
        });
        this.applyDerived(doc);
        await doc.save();
        const after = this.snapshot(doc);
        await (0, Revision_1.writeRevision)({
            registerKey: this.def.key,
            recordId: doc._id,
            version: 1,
            action: opts.action ?? "create",
            actor,
            before: null,
            after,
            changedPaths: this.diff(null, after),
            reason: revisionReason,
        });
        return {
            record: this.present(after),
            warnings: await this.findDuplicates(doc),
        };
    }
    buildFilter(q) {
        const filter = {};
        if (q.status)
            filter.status = q.status;
        if (q.source)
            filter.source = q.source;
        if (q.year)
            filter.eventYear = q.year;
        else if (q.yearFrom || q.yearTo) {
            filter.eventYear = {
                ...(q.yearFrom ? { $gte: q.yearFrom } : {}),
                ...(q.yearTo ? { $lte: q.yearTo } : {}),
            };
        }
        if (q.q) {
            const rx = new RegExp((0, helpers_1.escapeRegex)(q.q), "i");
            filter.$or = this.def.searchPaths.map((p) => ({ [p]: rx }));
        }
        return filter;
    }
    sortSpec(sort) {
        const allowed = [
            ...this.def.fields.map((f) => f.path),
            "createdAt",
            "updatedAt",
            "eventYear",
            "status",
        ];
        return (0, helpers_1.parseSort)(sort, allowed, { createdAt: -1, _id: 1 });
    }
    async list(q) {
        const filter = this.buildFilter(q);
        const [items, total] = await Promise.all([
            this.model
                .find(filter)
                .sort(this.sortSpec(q.sort))
                .skip((q.page - 1) * q.limit)
                .limit(q.limit)
                .lean(),
            this.model.countDocuments(filter),
        ]);
        return {
            items: items.map((i) => this.present((0, helpers_1.serialize)(i))),
            total,
        };
    }
    async get(id) {
        const doc = await this.mustFind(id);
        return {
            record: this.present(this.snapshot(doc)),
            warnings: await this.findDuplicates(doc),
        };
    }
    async duplicates(id) {
        return this.findDuplicates(await this.mustFind(id));
    }
    async update(id, input, actor) {
        const { revisionReason, expectedVersion, uncertainFields, ...changes } = input;
        const doc = await this.mustFind(id);
        if (expectedVersion !== undefined &&
            doc.get("version") !== expectedVersion) {
            throw http_1.AppError.conflict("This record was changed by someone else. Reload and try again.", { currentVersion: doc.get("version") });
        }
        const wasVerified = doc.get("status") === "verified";
        if (wasVerified && !revisionReason) {
            throw http_1.AppError.unprocessable("REVISION_REASON_REQUIRED", "A reason is required to correct a verified record (revisionReason).");
        }
        const before = this.snapshot(doc);
        for (const [path, value] of (0, helpers_1.flatten)(changes))
            doc.set(path, value === "" ? undefined : value);
        if (uncertainFields !== undefined)
            doc.set("uncertainFields", uncertainFields);
        if (!doc.modifiedPaths().length)
            return {
                record: this.present(before),
                warnings: [],
                changed: false,
            };
        let reason = revisionReason;
        if (this.def.hasPriestSignature &&
            doc.get("parishPriestSignature.status") === "signed") {
            // Content changed after signing: the signature no longer covers what is on the record.
            doc.set("parishPriestSignature", { status: "unsigned" });
            reason = `${reason ?? "Edited"} (priest signature invalidated; previous signed version kept in history)`;
        }
        // Any edit to a verified record sends it back for re-verification; the verified version stays in history.
        if (wasVerified) {
            doc.set("status", "pending_review");
            doc.set("verifiedBy", undefined);
            doc.set("verifiedAt", undefined);
        }
        doc.set("version", doc.get("version") + 1);
        doc.set("updatedBy", actor.id);
        this.applyDerived(doc);
        await doc.save();
        const after = this.snapshot(doc);
        await (0, Revision_1.writeRevision)({
            registerKey: this.def.key,
            recordId: doc._id,
            version: after.version,
            action: "update",
            actor,
            before,
            after,
            changedPaths: this.diff(before, after),
            reason,
        });
        return {
            record: this.present(after),
            warnings: await this.findDuplicates(doc),
            changed: true,
        };
    }
    missingRequired(doc) {
        return this.def.requiredForReview.filter((p) => (0, helpers_1.isEmpty)(doc.get(p)));
    }
    async transition(id, action, actor, note) {
        const doc = await this.mustFind(id);
        const status = doc.get("status");
        const before = this.snapshot(doc);
        if (action === "submit") {
            if (!["draft", "correction_required"].includes(status))
                throw http_1.AppError.conflict(`Only draft or correction_required records can be submitted (current: ${status})`);
            const missing = this.missingRequired(doc);
            if (missing.length)
                throw http_1.AppError.unprocessable("MISSING_REQUIRED_FIELDS", "Required fields are missing", { missing });
            doc.set("status", "pending_review");
            doc.set("submittedBy", actor.id);
            doc.set("submittedAt", new Date());
        }
        else if (action === "request_correction") {
            if (status !== "pending_review")
                throw http_1.AppError.conflict(`Only pending_review records can be sent back for correction (current: ${status})`);
            doc.set("status", "correction_required");
            doc.set("reviewNotes", note);
            doc.set("reviewedBy", actor.id);
            doc.set("reviewedAt", new Date());
        }
        else {
            if (status !== "pending_review")
                throw http_1.AppError.conflict(`Only pending_review records can be verified (current: ${status})`);
            const missing = this.missingRequired(doc);
            if (missing.length)
                throw http_1.AppError.unprocessable("MISSING_REQUIRED_FIELDS", "Required fields are missing", { missing });
            const uncertain = doc.get("uncertainFields") ?? [];
            if (uncertain.length) {
                throw http_1.AppError.unprocessable("UNCERTAIN_FIELDS_UNRESOLVED", "Resolve and clear all fields flagged as uncertain before verifying", { uncertainFields: uncertain });
            }
            doc.set("status", "verified");
            doc.set("reviewNotes", undefined);
            doc.set("reviewedBy", actor.id);
            doc.set("reviewedAt", new Date());
            doc.set("verifiedBy", actor.id);
            doc.set("verifiedAt", new Date());
        }
        doc.set("version", doc.get("version") + 1);
        doc.set("updatedBy", actor.id);
        await doc.save();
        const after = this.snapshot(doc);
        await (0, Revision_1.writeRevision)({
            registerKey: this.def.key,
            recordId: doc._id,
            version: after.version,
            action,
            actor,
            before,
            after,
            changedPaths: this.diff(before, after),
            reason: note,
        });
        return this.present(after);
    }
    /** Parish priest signature workflow (membership cards). Only an authenticated parish_priest account can sign. */
    async sign(id, actor) {
        if (!this.def.hasPriestSignature)
            throw http_1.AppError.notFound("This register has no signature workflow");
        if (actor.role !== "parish_priest")
            throw http_1.AppError.forbidden("Only the parish priest can sign");
        const doc = await this.mustFind(id);
        if (!["pending_review", "verified"].includes(doc.get("status"))) {
            throw http_1.AppError.conflict("A card can only be signed once it has been submitted for review");
        }
        if (doc.get("parishPriestSignature.status") === "signed")
            throw http_1.AppError.conflict("This card is already signed");
        const before = this.snapshot(doc);
        doc.set("parishPriestSignature", {
            status: "signed",
            signedBy: actor.id,
            signedName: actor.name,
            signedAt: new Date(),
            statement: "Electronically signed by the authenticated parish priest account",
        });
        doc.set("version", doc.get("version") + 1);
        doc.set("updatedBy", actor.id);
        await doc.save();
        const after = this.snapshot(doc);
        await (0, Revision_1.writeRevision)({
            registerKey: this.def.key,
            recordId: doc._id,
            version: after.version,
            action: "sign",
            actor,
            before,
            after,
            changedPaths: ["parishPriestSignature.status"],
        });
        return this.present(after);
    }
    async revisions(id, page, limit) {
        await this.mustFind(id);
        return (0, Revision_1.listRevisions)({ registerKey: this.def.key, recordId: id }, page, limit);
    }
    async revisionCount(id) {
        return Revision_1.Revision.countDocuments({ registerKey: this.def.key, recordId: id });
    }
    // ---------- presentation & export ----------
    /** Adds a `presentation` block with display-only transforms (e.g. UPPERCASE names) while stored values stay untouched. */
    present(record) {
        const upper = this.def.fields.filter((f) => f.uppercaseInPresentation);
        if (!upper.length)
            return record;
        const presentation = {};
        for (const f of upper) {
            const v = (0, helpers_1.getByPath)(record, f.path);
            if (typeof v === "string")
                setByPath(presentation, f.path, v.toUpperCase());
        }
        return { ...record, presentation };
    }
    cell(record, f) {
        const v = (0, helpers_1.getByPath)(record, f.path);
        if (v === undefined || v === null)
            return "";
        const s = String(v);
        return f.uppercaseInPresentation ? s.toUpperCase() : s;
    }
    async table(q) {
        const filter = this.buildFilter(q);
        const docs = (await this.model
            .find(filter)
            .sort(this.sortSpec(q.sort ?? "eventYear:asc"))
            .limit(exports.EXPORT_MAX_ROWS + 1)
            .lean());
        if (docs.length > exports.EXPORT_MAX_ROWS) {
            throw http_1.AppError.unprocessable("EXPORT_TOO_LARGE", `Export is limited to ${exports.EXPORT_MAX_ROWS} rows. Narrow the filters (e.g. by year).`);
        }
        const headers = this.def.fields.map((f) => f.label);
        if (this.def.hasPriestSignature)
            headers.push("Parish Priest Signature");
        const rows = docs.map((d) => {
            const row = this.def.fields.map((f) => this.cell(d, f));
            if (this.def.hasPriestSignature) {
                const sig = d.parishPriestSignature;
                row.push(sig?.status === "signed"
                    ? `Signed by ${String(sig.signedName ?? "")} on ${sig.signedAt ? new Date(String(sig.signedAt)).toISOString().slice(0, 10) : ""}`
                    : "");
            }
            return row;
        });
        return { title: this.def.title, headers, rows, count: rows.length };
    }
}
exports.RegisterService = RegisterService;
// ───────────── HTTP handlers ─────────────
const today = () => new Date().toISOString().slice(0, 10);
function describeFilters(q) {
    const parts = Object.entries(q)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}=${String(v)}`);
    return parts.length ? parts.join(", ") : "none";
}
/** Thin HTTP layer: parse request, call the service, shape the response. All rules live in RegisterService. */
function createRegisterController(def, model) {
    const svc = new RegisterService(def, model);
    const sendDownload = (res, filename, type, body) => {
        res.setHeader("Content-Type", type);
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Cache-Control", "no-store");
        res.send(body);
    };
    return {
        list: async (req, res) => {
            const q = req.query;
            const { items, total } = await svc.list(q);
            (0, http_1.paged)(res, items, q.page, q.limit, total);
        },
        create: async (req, res) => {
            const { record, warnings } = await svc.create(req.body, req.user);
            (0, http_1.ok)(res, record, 201, { warnings });
        },
        get: async (req, res) => {
            const { record, warnings } = await svc.get(req.params.id);
            (0, http_1.ok)(res, record, 200, { warnings });
        },
        update: async (req, res) => {
            const { record, warnings, changed } = await svc.update(req.params.id, req.body, req.user);
            (0, http_1.ok)(res, record, 200, { warnings, changed });
        },
        submit: async (req, res) => (0, http_1.ok)(res, await svc.transition(req.params.id, "submit", req.user, req.body?.note)),
        requestCorrection: async (req, res) => (0, http_1.ok)(res, await svc.transition(req.params.id, "request_correction", req.user, req.body.note)),
        verify: async (req, res) => (0, http_1.ok)(res, await svc.transition(req.params.id, "verify", req.user, req.body?.note)),
        sign: async (req, res) => (0, http_1.ok)(res, await svc.sign(req.params.id, req.user)),
        duplicates: async (req, res) => (0, http_1.ok)(res, await svc.duplicates(req.params.id)),
        revisions: async (req, res) => {
            const { page, limit } = req.query;
            const { items, total } = await svc.revisions(req.params.id, page, limit);
            (0, http_1.paged)(res, items, page, limit, total);
        },
        print: async (req, res) => {
            const table = await svc.table(req.query);
            await (0, AuditLog_1.audit)(req, "register.print_data", {
                targetType: svc.def.key,
                meta: { count: table.count },
            });
            res.setHeader("Cache-Control", "no-store");
            (0, http_1.ok)(res, {
                ...table,
                generatedAt: new Date().toISOString(),
                generatedBy: req.user.name,
                filters: describeFilters(req.query),
            });
        },
        exportCsv: async (req, res) => {
            const table = await svc.table(req.query);
            await (0, AuditLog_1.audit)(req, "register.export_csv", {
                targetType: svc.def.key,
                meta: { count: table.count },
            });
            sendDownload(res, `${svc.def.slug}-${today()}.csv`, "text/csv; charset=utf-8", (0, helpers_1.toCsv)(table.headers, table.rows));
        },
        exportDocx: async (req, res) => {
            const q = req.query;
            const table = await svc.table(q);
            await (0, AuditLog_1.audit)(req, "register.export_docx", {
                targetType: svc.def.key,
                meta: { count: table.count },
            });
            const buf = await buildDocx({
                title: table.title,
                headers: table.headers,
                rows: table.rows,
                note: `Generated ${today()} · ${table.count} record(s) · filters: ${describeFilters(q)}. Entries not in "verified" status are unofficial drafts.`,
            });
            sendDownload(res, `${svc.def.slug}-${today()}.docx`, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buf);
        },
    };
}
//# sourceMappingURL=register.controller.js.map