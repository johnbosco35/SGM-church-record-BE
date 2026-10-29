import type { HydratedDocument } from "mongoose";
import type { Request, Response } from "express";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { RegisterDef } from "../config/registerTypes";
import {
  escapeRegex,
  flatten,
  getByPath,
  isEmpty,
  normalizeKeyPart,
  parseSort,
  serialize,
  toCsv,
} from "../helpers";
import { AppError, ok, paged } from "../middleware/http";
import type { AuthUser } from "../middleware/auth";
import { audit } from "../models/AuditLog";
import type { RegisterModel } from "../models/registers";
import { Revision, listRevisions, writeRevision } from "../models/Revision";

/** Query accepted by list / export / print (validated by the Zod schema in routes/register.routes.ts). */
export interface RegisterListQuery {
  page: number;
  limit: number;
  q?: string;
  status?: string;
  year?: number;
  yearFrom?: number;
  yearTo?: number;
  source?: "manual" | "extraction";
  sort?: string;
}

// ───────────── DOCX table builder ─────────────
export interface DocxTableInput {
  title: string;
  headers: string[];
  rows: string[][];
  note?: string;
}

/**
 * Editable Word table. A3 landscape for wide registers (>12 columns), A4 landscape otherwise.
 * Widths are explicit DXA values so the table renders the same in Word and LibreOffice.
 */
export async function buildDocx({
  title,
  headers,
  rows,
  note,
}: DocxTableInput): Promise<Buffer> {
  const wide = headers.length > 12;
  // docx-js expects portrait dimensions and swaps them when orientation is LANDSCAPE.
  const portrait = wide
    ? { width: 16838, height: 23811 }
    : { width: 11906, height: 16838 };
  const margin = 720;
  const contentWidth = portrait.height - margin * 2;
  const colWidth = Math.floor(contentWidth / headers.length);
  const fontSize = wide ? 14 : 18; // half-points

  const border = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
  const borders = { top: border, bottom: border, left: border, right: border };

  const cell = (text: string, header = false): TableCell =>
    new TableCell({
      width: { size: colWidth, type: WidthType.DXA },
      borders,
      margins: { top: 40, bottom: 40, left: 60, right: 60 },
      ...(header
        ? {
            shading: { type: ShadingType.CLEAR, fill: "E7E6E6", color: "auto" },
          }
        : {}),
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: header, size: fontSize })],
        }),
      ],
    });

  const table = new Table({
    width: { size: colWidth * headers.length, type: WidthType.DXA },
    columnWidths: headers.map(() => colWidth),
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((h) => cell(h, true)),
      }),
      ...rows.map(
        (r) =>
          new TableRow({ cantSplit: true, children: r.map((c) => cell(c)) }),
      ),
    ],
  });

  const doc = new Document({
    creator: "Church Management System",
    title,
    sections: [
      {
        properties: {
          page: {
            size: {
              width: portrait.width,
              height: portrait.height,
              orientation: PageOrientation.LANDSCAPE,
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
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: title })],
          }),
          ...(note
            ? [
                new Paragraph({
                  children: [
                    new TextRun({ text: note, italics: true, size: 18 }),
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
  return Packer.toBuffer(doc);
}

// ───────────── register logic (workflow, revisions, duplicates, signature, tables) ─────────────
type Doc = HydratedDocument<Record<string, unknown>>;
type Plain = Record<string, unknown>;

export const EXPORT_MAX_ROWS = 5000;

export interface DuplicateWarning {
  recordId: string;
  number?: unknown;
  status: unknown;
  reason: "same_identity" | "same_number";
}
export interface RegisterTable {
  title: string;
  headers: string[];
  rows: string[][];
  count: number;
}

function setByPath(obj: Plain, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p] as Plain;
  }
  cur[parts[parts.length - 1]] = value;
}

export class RegisterService {
  constructor(
    readonly def: RegisterDef,
    readonly model: RegisterModel,
  ) {}

  private get hasNumber(): boolean {
    return this.def.fields.some((f) => f.path === "number");
  }

  private snapshot(doc: Doc): Plain {
    return serialize(JSON.parse(JSON.stringify(doc.toObject())) as Plain);
  }

  private applyDerived(doc: Doc): void {
    const raw = doc.get(this.def.eventYearPath) as unknown;
    let year: number | undefined;
    if (typeof raw === "number") year = raw;
    else if (typeof raw === "string") {
      const m = /^(\d{4})/.exec(raw);
      if (m) year = Number(m[1]);
    }
    doc.set("eventYear", year);

    const parts = this.def.duplicatePaths.map((p) =>
      normalizeKeyPart(doc.get(p)),
    );
    const filled = parts.filter(Boolean).length;
    doc.set(
      "duplicateKey",
      filled >= Math.min(2, parts.length) ? parts.join("|") : undefined,
    );
  }

  private async mustFind(id: string): Promise<Doc> {
    const doc = await this.model.findById(id);
    if (!doc) throw AppError.notFound("Record not found");
    return doc as Doc;
  }

  private diff(before: Plain | null, after: Plain): string[] {
    const paths = [
      ...this.def.fields.map((f) => f.path),
      "status",
      "uncertainFields",
      "parishPriestSignature.status",
    ];
    return paths.filter(
      (p) =>
        JSON.stringify(getByPath(before, p)) !==
        JSON.stringify(getByPath(after, p)),
    );
  }

  async findDuplicates(doc: Doc): Promise<DuplicateWarning[]> {
    const or: Plain[] = [];
    const dk = doc.get("duplicateKey") as string | undefined;
    if (dk) or.push({ duplicateKey: dk });
    const number = this.hasNumber
      ? (doc.get("number") as string | undefined)
      : undefined;
    if (number) or.push({ number });
    if (!or.length) return [];
    const matches = (await this.model
      .find({ _id: { $ne: doc._id }, $or: or })
      .select("number duplicateKey status")
      .limit(10)
      .lean()) as Plain[];
    return matches.map((m) => ({
      recordId: String(m._id),
      number: m.number,
      status: m.status,
      reason: dk && m.duplicateKey === dk ? "same_identity" : "same_number",
    }));
  }

  async create(
    input: Plain,
    actor: AuthUser,
    opts: {
      extraction?: Plain;
      sourceDocument?: Plain;
      uncertainFields?: string[];
      action?: "create" | "extraction_create";
    } = {},
  ) {
    const { revisionReason, uncertainFields, ...fields } = input;
    const doc = new this.model({
      ...fields,
      status: "draft",
      version: 1,
      source: opts.extraction ? "extraction" : "manual",
      extraction: opts.extraction,
      sourceDocument: opts.sourceDocument,
      uncertainFields:
        opts.uncertainFields ?? (uncertainFields as string[] | undefined) ?? [],
      createdBy: actor.id,
      updatedBy: actor.id,
    }) as Doc;
    this.applyDerived(doc);
    await doc.save();
    const after = this.snapshot(doc);
    await writeRevision({
      registerKey: this.def.key,
      recordId: doc._id,
      version: 1,
      action: opts.action ?? "create",
      actor,
      before: null,
      after,
      changedPaths: this.diff(null, after),
      reason: revisionReason as string | undefined,
    });
    return {
      record: this.present(after),
      warnings: await this.findDuplicates(doc),
    };
  }

  buildFilter(q: Partial<RegisterListQuery>): Plain {
    const filter: Plain = {};
    if (q.status) filter.status = q.status;
    if (q.source) filter.source = q.source;
    if (q.year) filter.eventYear = q.year;
    else if (q.yearFrom || q.yearTo) {
      filter.eventYear = {
        ...(q.yearFrom ? { $gte: q.yearFrom } : {}),
        ...(q.yearTo ? { $lte: q.yearTo } : {}),
      };
    }
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), "i");
      filter.$or = this.def.searchPaths.map((p) => ({ [p]: rx }));
    }
    return filter;
  }

  private sortSpec(sort?: string): Record<string, 1 | -1> {
    const allowed = [
      ...this.def.fields.map((f) => f.path),
      "createdAt",
      "updatedAt",
      "eventYear",
      "status",
    ];
    return parseSort(sort, allowed, { createdAt: -1, _id: 1 });
  }

  async list(q: RegisterListQuery) {
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
      items: (items as Plain[]).map((i) => this.present(serialize(i))),
      total,
    };
  }

  async get(id: string) {
    const doc = await this.mustFind(id);
    return {
      record: this.present(this.snapshot(doc)),
      warnings: await this.findDuplicates(doc),
    };
  }

  async duplicates(id: string) {
    return this.findDuplicates(await this.mustFind(id));
  }

  async update(id: string, input: Plain, actor: AuthUser) {
    const { revisionReason, expectedVersion, uncertainFields, ...changes } =
      input;
    const doc = await this.mustFind(id);
    if (
      expectedVersion !== undefined &&
      doc.get("version") !== expectedVersion
    ) {
      throw AppError.conflict(
        "This record was changed by someone else. Reload and try again.",
        { currentVersion: doc.get("version") },
      );
    }
    const wasVerified = doc.get("status") === "verified";
    if (wasVerified && !revisionReason) {
      throw AppError.unprocessable(
        "REVISION_REASON_REQUIRED",
        "A reason is required to correct a verified record (revisionReason).",
      );
    }

    const before = this.snapshot(doc);
    for (const [path, value] of flatten(changes))
      doc.set(path, value === "" ? undefined : value);
    if (uncertainFields !== undefined)
      doc.set("uncertainFields", uncertainFields);
    if (!doc.modifiedPaths().length)
      return {
        record: this.present(before),
        warnings: [] as DuplicateWarning[],
        changed: false,
      };

    let reason = revisionReason as string | undefined;
    if (
      this.def.hasPriestSignature &&
      doc.get("parishPriestSignature.status") === "signed"
    ) {
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
    doc.set("version", (doc.get("version") as number) + 1);
    doc.set("updatedBy", actor.id);
    this.applyDerived(doc);
    await doc.save();

    const after = this.snapshot(doc);
    await writeRevision({
      registerKey: this.def.key,
      recordId: doc._id,
      version: after.version as number,
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

  private missingRequired(doc: Doc): string[] {
    return this.def.requiredForReview.filter((p) => isEmpty(doc.get(p)));
  }

  async transition(
    id: string,
    action: "submit" | "request_correction" | "verify",
    actor: AuthUser,
    note?: string,
  ) {
    const doc = await this.mustFind(id);
    const status = doc.get("status") as string;
    const before = this.snapshot(doc);

    if (action === "submit") {
      if (!["draft", "correction_required"].includes(status))
        throw AppError.conflict(
          `Only draft or correction_required records can be submitted (current: ${status})`,
        );
      const missing = this.missingRequired(doc);
      if (missing.length)
        throw AppError.unprocessable(
          "MISSING_REQUIRED_FIELDS",
          "Required fields are missing",
          { missing },
        );
      doc.set("status", "pending_review");
      doc.set("submittedBy", actor.id);
      doc.set("submittedAt", new Date());
    } else if (action === "request_correction") {
      if (status !== "pending_review")
        throw AppError.conflict(
          `Only pending_review records can be sent back for correction (current: ${status})`,
        );
      doc.set("status", "correction_required");
      doc.set("reviewNotes", note);
      doc.set("reviewedBy", actor.id);
      doc.set("reviewedAt", new Date());
    } else {
      if (status !== "pending_review")
        throw AppError.conflict(
          `Only pending_review records can be verified (current: ${status})`,
        );
      const missing = this.missingRequired(doc);
      if (missing.length)
        throw AppError.unprocessable(
          "MISSING_REQUIRED_FIELDS",
          "Required fields are missing",
          { missing },
        );
      const uncertain =
        (doc.get("uncertainFields") as string[] | undefined) ?? [];
      if (uncertain.length) {
        throw AppError.unprocessable(
          "UNCERTAIN_FIELDS_UNRESOLVED",
          "Resolve and clear all fields flagged as uncertain before verifying",
          { uncertainFields: uncertain },
        );
      }
      doc.set("status", "verified");
      doc.set("reviewNotes", undefined);
      doc.set("reviewedBy", actor.id);
      doc.set("reviewedAt", new Date());
      doc.set("verifiedBy", actor.id);
      doc.set("verifiedAt", new Date());
    }

    doc.set("version", (doc.get("version") as number) + 1);
    doc.set("updatedBy", actor.id);
    await doc.save();
    const after = this.snapshot(doc);
    await writeRevision({
      registerKey: this.def.key,
      recordId: doc._id,
      version: after.version as number,
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
  async sign(id: string, actor: AuthUser) {
    if (!this.def.hasPriestSignature)
      throw AppError.notFound("This register has no signature workflow");
    if (actor.role !== "parish_priest")
      throw AppError.forbidden("Only the parish priest can sign");
    const doc = await this.mustFind(id);
    if (!["pending_review", "verified"].includes(doc.get("status") as string)) {
      throw AppError.conflict(
        "A card can only be signed once it has been submitted for review",
      );
    }
    if (doc.get("parishPriestSignature.status") === "signed")
      throw AppError.conflict("This card is already signed");
    const before = this.snapshot(doc);
    doc.set("parishPriestSignature", {
      status: "signed",
      signedBy: actor.id,
      signedName: actor.name,
      signedAt: new Date(),
      statement:
        "Electronically signed by the authenticated parish priest account",
    });
    doc.set("version", (doc.get("version") as number) + 1);
    doc.set("updatedBy", actor.id);
    await doc.save();
    const after = this.snapshot(doc);
    await writeRevision({
      registerKey: this.def.key,
      recordId: doc._id,
      version: after.version as number,
      action: "sign",
      actor,
      before,
      after,
      changedPaths: ["parishPriestSignature.status"],
    });
    return this.present(after);
  }

  async revisions(id: string, page: number, limit: number) {
    await this.mustFind(id);
    return listRevisions(
      { registerKey: this.def.key, recordId: id },
      page,
      limit,
    );
  }

  async revisionCount(id: string): Promise<number> {
    return Revision.countDocuments({ registerKey: this.def.key, recordId: id });
  }

  // ---------- presentation & export ----------

  /** Adds a `presentation` block with display-only transforms (e.g. UPPERCASE names) while stored values stay untouched. */
  present(record: Plain): Plain {
    const upper = this.def.fields.filter((f) => f.uppercaseInPresentation);
    if (!upper.length) return record;
    const presentation: Plain = {};
    for (const f of upper) {
      const v = getByPath(record, f.path);
      if (typeof v === "string")
        setByPath(presentation, f.path, v.toUpperCase());
    }
    return { ...record, presentation };
  }

  private cell(
    record: Plain,
    f: { path: string; uppercaseInPresentation?: boolean },
  ): string {
    const v = getByPath(record, f.path);
    if (v === undefined || v === null) return "";
    const s = String(v);
    return f.uppercaseInPresentation ? s.toUpperCase() : s;
  }

  async table(q: Partial<RegisterListQuery>): Promise<RegisterTable> {
    const filter = this.buildFilter(q);
    const docs = (await this.model
      .find(filter)
      .sort(this.sortSpec(q.sort ?? "eventYear:asc"))
      .limit(EXPORT_MAX_ROWS + 1)
      .lean()) as Plain[];
    if (docs.length > EXPORT_MAX_ROWS) {
      throw AppError.unprocessable(
        "EXPORT_TOO_LARGE",
        `Export is limited to ${EXPORT_MAX_ROWS} rows. Narrow the filters (e.g. by year).`,
      );
    }
    const headers = this.def.fields.map((f) => f.label);
    if (this.def.hasPriestSignature) headers.push("Parish Priest Signature");
    const rows = docs.map((d) => {
      const row = this.def.fields.map((f) => this.cell(d, f));
      if (this.def.hasPriestSignature) {
        const sig = d.parishPriestSignature as Plain | undefined;
        row.push(
          sig?.status === "signed"
            ? `Signed by ${String(sig.signedName ?? "")} on ${sig.signedAt ? new Date(String(sig.signedAt)).toISOString().slice(0, 10) : ""}`
            : "",
        );
      }
      return row;
    });
    return { title: this.def.title, headers, rows, count: rows.length };
  }
}

// ───────────── HTTP handlers ─────────────
const today = (): string => new Date().toISOString().slice(0, 10);

function describeFilters(q: Partial<RegisterListQuery>): string {
  const parts = Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${String(v)}`);
  return parts.length ? parts.join(", ") : "none";
}

/** Thin HTTP layer: parse request, call the service, shape the response. All rules live in RegisterService. */
export function createRegisterController(
  def: RegisterDef,
  model: RegisterModel,
) {
  const svc = new RegisterService(def, model);
  const sendDownload = (
    res: Response,
    filename: string,
    type: string,
    body: string | Buffer,
  ) => {
    res.setHeader("Content-Type", type);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(body);
  };

  return {
    list: async (req: Request, res: Response) => {
      const q = req.query as unknown as RegisterListQuery;
      const { items, total } = await svc.list(q);
      paged(res, items, q.page, q.limit, total);
    },
    create: async (req: Request, res: Response) => {
      const { record, warnings } = await svc.create(req.body, req.user!);
      ok(res, record, 201, { warnings });
    },
    get: async (req: Request, res: Response) => {
      const { record, warnings } = await svc.get(req.params.id);
      ok(res, record, 200, { warnings });
    },
    update: async (req: Request, res: Response) => {
      const { record, warnings, changed } = await svc.update(
        req.params.id,
        req.body,
        req.user!,
      );
      ok(res, record, 200, { warnings, changed });
    },
    submit: async (req: Request, res: Response) =>
      ok(
        res,
        await svc.transition(
          req.params.id,
          "submit",
          req.user!,
          req.body?.note,
        ),
      ),
    requestCorrection: async (req: Request, res: Response) =>
      ok(
        res,
        await svc.transition(
          req.params.id,
          "request_correction",
          req.user!,
          req.body.note,
        ),
      ),
    verify: async (req: Request, res: Response) =>
      ok(
        res,
        await svc.transition(
          req.params.id,
          "verify",
          req.user!,
          req.body?.note,
        ),
      ),
    sign: async (req: Request, res: Response) =>
      ok(res, await svc.sign(req.params.id, req.user!)),
    duplicates: async (req: Request, res: Response) =>
      ok(res, await svc.duplicates(req.params.id)),
    revisions: async (req: Request, res: Response) => {
      const { page, limit } = req.query as unknown as {
        page: number;
        limit: number;
      };
      const { items, total } = await svc.revisions(req.params.id, page, limit);
      paged(res, items, page, limit, total);
    },
    print: async (req: Request, res: Response) => {
      const table = await svc.table(req.query as Partial<RegisterListQuery>);
      await audit(req, "register.print_data", {
        targetType: svc.def.key,
        meta: { count: table.count },
      });
      res.setHeader("Cache-Control", "no-store");
      ok(res, {
        ...table,
        generatedAt: new Date().toISOString(),
        generatedBy: req.user!.name,
        filters: describeFilters(req.query as Partial<RegisterListQuery>),
      });
    },
    exportCsv: async (req: Request, res: Response) => {
      const table = await svc.table(req.query as Partial<RegisterListQuery>);
      await audit(req, "register.export_csv", {
        targetType: svc.def.key,
        meta: { count: table.count },
      });
      sendDownload(
        res,
        `${svc.def.slug}-${today()}.csv`,
        "text/csv; charset=utf-8",
        toCsv(table.headers, table.rows),
      );
    },
    exportDocx: async (req: Request, res: Response) => {
      const q = req.query as Partial<RegisterListQuery>;
      const table = await svc.table(q);
      await audit(req, "register.export_docx", {
        targetType: svc.def.key,
        meta: { count: table.count },
      });
      const buf = await buildDocx({
        title: table.title,
        headers: table.headers,
        rows: table.rows,
        note: `Generated ${today()} · ${table.count} record(s) · filters: ${describeFilters(q)}. Entries not in "verified" status are unofficial drafts.`,
      });
      sendDownload(
        res,
        `${svc.def.slug}-${today()}.docx`,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        buf,
      );
    },
  };
}
