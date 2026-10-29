import type { Request, Response } from "express";
import { serialize } from "../helpers";
import { AppError, ok, paged } from "../middleware/http";
import { Revision, listRevisions } from "../models/Revision";

export const revisionController = {
  list: async (req: Request, res: Response) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      registerKey?: string;
      recordId?: string;
    };
    const { items, total } = await listRevisions(
      { registerKey: q.registerKey, recordId: q.recordId },
      q.page,
      q.limit,
    );
    paged(res, items, q.page, q.limit, total);
  },
  get: async (req: Request, res: Response) => {
    const r = await Revision.findById(req.params.id).lean();
    if (!r) throw AppError.notFound("Revision not found");
    ok(res, serialize(r as Record<string, unknown>));
  },
};
