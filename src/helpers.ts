import { z } from "zod";
import type { FieldDef } from "./config/registerTypes";

// ───────────── text & object helpers ─────────────
export const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizeKeyPart = (v: unknown): string =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");

export function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object")
      return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/** Flatten a nested plain object into [dottedPath, leafValue] pairs. Arrays and Dates are leaves. */
export function flatten(
  obj: Record<string, unknown>,
  prefix = "",
): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      !(v instanceof Date)
    ) {
      out.push(...flatten(v as Record<string, unknown>, p));
    } else {
      out.push([p, v]);
    }
  }
  return out;
}

export function isEmpty(v: unknown): boolean {
  return (
    v === undefined || v === null || (typeof v === "string" && v.trim() === "")
  );
}

/** Convert a lean Mongo document to an API object: `_id` -> `id`, drop `__v`. */
export function serialize(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
}

// ───────────── CSV ─────────────
/**
 * CSV writer with spreadsheet formula-injection protection (OWASP CSV injection):
 * cells starting with = + - @ tab or CR get a leading apostrophe.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  // BOM so Excel opens UTF-8 correctly.
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// ───────────── nested field tree (register definitions → schemas) ─────────────
export type Tree = { [key: string]: unknown };

/** Build a nested object from dotted field paths, using `leaf` to create each leaf. */
export function buildTree(
  fields: FieldDef[],
  leaf: (f: FieldDef) => unknown,
): Tree {
  const root: Tree = {};
  for (const f of fields) {
    const parts = f.path.split(".");
    let cur = root;
    for (const p of parts.slice(0, -1)) {
      if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
      cur = cur[p] as Tree;
    }
    cur[parts[parts.length - 1]] = leaf(f);
  }
  return root;
}

// ───────────── shared Zod schemas & pagination ─────────────
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
export const idParams = z.object({ id: objectIdSchema });

export function parseSort(
  sort: string | undefined,
  allowed: string[],
  fallback: Record<string, 1 | -1>,
): Record<string, 1 | -1> {
  if (!sort) return fallback;
  const [field, dir] = sort.split(":");
  if (!allowed.includes(field)) return fallback;
  return { [field]: dir === "desc" ? -1 : 1, _id: 1 };
}

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z
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
export const partialDate = z
  .string()
  .trim()
  .refine((v) => {
    if (v === "") return true;
    const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(v);
    if (!m) return false;
    const [, y, mo, d] = m;
    if (Number(y) < 1000 || Number(y) > 2200) return false;
    if (mo && (Number(mo) < 1 || Number(mo) > 12)) return false;
    if (d) {
      const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
      if (dt.getUTCMonth() !== Number(mo) - 1) return false;
    }
    return true;
  }, "Use YYYY, YYYY-MM or YYYY-MM-DD");
