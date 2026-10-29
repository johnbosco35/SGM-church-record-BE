import type { Request, Response } from "express";
import { getByPath, isEmpty } from "../helpers";
import { AppError, ok } from "../middleware/http";
import type { AuthUser } from "../middleware/auth";
import { ExtractionJob } from "../models/ExtractionJob";
import { getRegister } from "../models/registers";
import { UploadedFile } from "../models/UploadedFile";
import { partialDate } from "../helpers";
import { getExtractionProvider } from "../providers/extraction";
import { RegisterService } from "./register.controller";
import { resolveStoredPath } from "./upload.controller";

type Plain = Record<string, unknown>;

function setPath(obj: Plain, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Plain;
  cur[parts[parts.length - 1]] = value;
}

/**
 * Turns provider output into a storable draft. Anything that can't be stored cleanly is kept in
 * `extraction.unparsedValues` and flagged uncertain — values are never silently discarded.
 */
function sanitize(
  def: ReturnType<typeof getRegister>["def"],
  rawFields: Plain,
  providerUncertain: string[],
) {
  const fields: Plain = {};
  const unparsed: Plain = {};
  const uncertain = new Set(providerUncertain);

  for (const f of def.fields) {
    const raw = getByPath(rawFields, f.path) ?? rawFields[f.path];
    if (isEmpty(raw)) continue;
    const text = String(raw).trim();
    if (f.type === "number") {
      const n = Number(text.replace(/[,\s]/g, ""));
      if (Number.isFinite(n) && n >= 0) setPath(fields, f.path, n);
      else {
        unparsed[f.path] = raw;
        uncertain.add(f.path);
      }
    } else if (f.type === "date") {
      setPath(fields, f.path, text.slice(0, 50));
      if (!partialDate.safeParse(text).success) uncertain.add(f.path); // kept as read, flagged
    } else if (text.length > (f.maxLength ?? 500)) {
      unparsed[f.path] = raw;
      uncertain.add(f.path);
    } else {
      setPath(fields, f.path, text);
    }
  }
  return { fields, unparsed, uncertain: [...uncertain] };
}

export async function runExtraction(
  input: { registerKey: string; fileIds: string[] },
  actor: AuthUser,
) {
  const { def, model } = getRegister(input.registerKey);
  const files = await UploadedFile.find({ _id: { $in: input.fileIds } }).lean();
  if (files.length !== new Set(input.fileIds).size)
    throw AppError.notFound("One or more uploaded files were not found");

  const provider = getExtractionProvider();
  const job = await ExtractionJob.create({
    registerKey: def.key,
    files: input.fileIds,
    provider: provider.name,
    isMock: provider.isMock,
    requestedBy: actor.id,
  });

  try {
    const result = await provider.extract({
      register: def,
      files: files.map((f: Plain) => ({
        id: String(f._id),
        path: resolveStoredPath(String(f.storedName)),
        mimeType: String(f.mimeType),
        originalName: f.originalName as string | undefined,
      })),
    });
    const service = new RegisterService(def, model);
    const created: unknown[] = [];

    for (const r of result.records) {
      const { fields, unparsed, uncertain } = sanitize(
        def,
        r.fields,
        r.uncertainFields,
      );
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
    job.createdRecordIds = created.map((c) => (c as Plain).id) as never;
    await job.save();

    return {
      jobId: String(job._id),
      provider: result.providerName,
      isMock: result.isMock,
      warnings: result.warnings,
      notice:
        "All extracted records are drafts. A human must review, correct, submit and verify them before they become official.",
      records: created,
    };
  } catch (e) {
    job.status = "failed";
    job.error =
      e instanceof Error ? e.message.slice(0, 500) : "Extraction failed";
    await job.save();
    throw e;
  }
}

export async function getJob(id: string) {
  const job: any = await ExtractionJob.findById(id).lean();
  if (!job) throw AppError.notFound("Extraction job not found");
  return { ...job, id: String(job._id), _id: undefined, __v: undefined };
}

// ───────────── handlers ─────────────
export const extractionController = {
  create: async (req: Request, res: Response) =>
    ok(res, await runExtraction(req.body, req.user!), 201),
  get: async (req: Request, res: Response) =>
    ok(res, await getJob(req.params.id)),
};
