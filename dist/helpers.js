"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partialDate = exports.passwordSchema = exports.emailSchema = exports.idParams = exports.objectIdSchema = exports.paginationSchema = exports.normalizeKeyPart = exports.escapeRegex = void 0;
exports.getByPath = getByPath;
exports.flatten = flatten;
exports.isEmpty = isEmpty;
exports.serialize = serialize;
exports.csvCell = csvCell;
exports.toCsv = toCsv;
exports.buildTree = buildTree;
exports.parseSort = parseSort;
const zod_1 = require("zod");
// ───────────── text & object helpers ─────────────
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
exports.escapeRegex = escapeRegex;
const normalizeKeyPart = (v) => String(v ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
exports.normalizeKeyPart = normalizeKeyPart;
function getByPath(obj, path) {
    return path.split(".").reduce((acc, key) => {
        if (acc && typeof acc === "object")
            return acc[key];
        return undefined;
    }, obj);
}
/** Flatten a nested plain object into [dottedPath, leafValue] pairs. Arrays and Dates are leaves. */
function flatten(obj, prefix = "") {
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
        const p = prefix ? `${prefix}.${k}` : k;
        if (v &&
            typeof v === "object" &&
            !Array.isArray(v) &&
            !(v instanceof Date)) {
            out.push(...flatten(v, p));
        }
        else {
            out.push([p, v]);
        }
    }
    return out;
}
function isEmpty(v) {
    return (v === undefined || v === null || (typeof v === "string" && v.trim() === ""));
}
/** Convert a lean Mongo document to an API object: `_id` -> `id`, drop `__v`. */
function serialize(doc) {
    const { _id, __v, ...rest } = doc;
    return { id: String(_id), ...rest };
}
// ───────────── CSV ─────────────
/**
 * CSV writer with spreadsheet formula-injection protection (OWASP CSV injection):
 * cells starting with = + - @ tab or CR get a leading apostrophe.
 */
function csvCell(value) {
    let s = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(s))
        s = `'${s}`;
    if (/[",\r\n]/.test(s))
        s = `"${s.replace(/"/g, '""')}"`;
    return s;
}
function toCsv(headers, rows) {
    const lines = [headers.map(csvCell).join(",")];
    for (const r of rows)
        lines.push(r.map(csvCell).join(","));
    // BOM so Excel opens UTF-8 correctly.
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
/** Build a nested object from dotted field paths, using `leaf` to create each leaf. */
function buildTree(fields, leaf) {
    const root = {};
    for (const f of fields) {
        const parts = f.path.split(".");
        let cur = root;
        for (const p of parts.slice(0, -1)) {
            if (typeof cur[p] !== "object" || cur[p] === null)
                cur[p] = {};
            cur = cur[p];
        }
        cur[parts[parts.length - 1]] = leaf(f);
    }
    return root;
}
// ───────────── shared Zod schemas & pagination ─────────────
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
});
exports.objectIdSchema = zod_1.z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
exports.idParams = zod_1.z.object({ id: exports.objectIdSchema });
function parseSort(sort, allowed, fallback) {
    if (!sort)
        return fallback;
    const [field, dir] = sort.split(":");
    if (!allowed.includes(field))
        return fallback;
    return { [field]: dir === "desc" ? -1 : 1, _id: 1 };
}
exports.emailSchema = zod_1.z.string().trim().toLowerCase().email().max(254);
exports.passwordSchema = zod_1.z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128)
    .regex(/[a-z]/, "Password needs a lowercase letter")
    .regex(/[A-Z]/, "Password needs an uppercase letter")
    .regex(/\d/, "Password needs a digit");
/**
 * Dates in old registers are often incomplete, so we accept YYYY, YYYY-MM or YYYY-MM-DD
 * (validated as real calendar values). An empty string clears the field.
 */
exports.partialDate = zod_1.z
    .string()
    .trim()
    .refine((v) => {
    if (v === "")
        return true;
    const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v);
    if (!m)
        return false;
    const [, y, mo, d] = m;
    if (Number(y) < 1000 || Number(y) > 2200)
        return false;
    if (mo && (Number(mo) < 1 || Number(mo) > 12))
        return false;
    if (d) {
        const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
        if (dt.getUTCMonth() !== Number(mo) - 1)
            return false;
    }
    return true;
}, "Use YYYY, YYYY-MM or YYYY-MM-DD");
//# sourceMappingURL=helpers.js.map