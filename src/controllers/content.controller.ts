import type { Request, Response } from "express";
import type { Model } from "mongoose";
import { escapeRegex } from "../helpers";
import { AppError, ok, paged } from "../middleware/http";
import { audit } from "../models/AuditLog";

type Plain = Record<string, unknown>;
const PUBLIC_SELECT = "-createdBy -updatedBy -__v";
const view = (d: Plain): Plain => {
  const { _id, __v, ...rest } = d;
  return { id: String(_id), ...rest };
};

/**
 * Public handlers return PUBLISHED content only (unpublished ids respond 404, same as missing).
 * Management handlers are admin-only (enforced in routes). The no-delete rule applies to the seven
 * sacramental registers, not to website content.
 */
export function createContentController(cfg: {
  tag: string;
  model: Model<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  searchFields: string[];
  sort: Record<string, 1 | -1>;
}) {
  const { model } = cfg;
  const searchFilter = (q?: string): Plain => {
    if (!q) return {};
    const rx = new RegExp(escapeRegex(q), "i");
    return { $or: cfg.searchFields.map((f) => ({ [f]: rx })) };
  };
  const found = <T>(doc: T | null): T => {
    if (!doc) throw AppError.notFound();
    return doc;
  };

  return {
    list: async (req: Request, res: Response) => {
      const q = req.query as unknown as {
        page: number;
        limit: number;
        q?: string;
      };
      const filter = { published: true, ...searchFilter(q.q) };
      const [items, total] = await Promise.all([
        model
          .find(filter)
          .select(PUBLIC_SELECT)
          .sort(cfg.sort)
          .skip((q.page - 1) * q.limit)
          .limit(q.limit)
          .lean(),
        model.countDocuments(filter),
      ]);
      paged(
        res,
        items.map((i: Plain) => view(i)),
        q.page,
        q.limit,
        total,
      );
    },
    manageList: async (req: Request, res: Response) => {
      const q = req.query as unknown as {
        page: number;
        limit: number;
        q?: string;
        published?: "true" | "false";
      };
      const filter: Plain = {
        ...searchFilter(q.q),
        ...(q.published ? { published: q.published === "true" } : {}),
      };
      const [items, total] = await Promise.all([
        model
          .find(filter)
          .sort(cfg.sort)
          .skip((q.page - 1) * q.limit)
          .limit(q.limit)
          .lean(),
        model.countDocuments(filter),
      ]);
      paged(
        res,
        items.map((i: Plain) => view(i)),
        q.page,
        q.limit,
        total,
      );
    },
    manageGet: async (req: Request, res: Response) =>
      ok(res, view(found(await model.findById(req.params.id).lean()) as Plain)),
    get: async (req: Request, res: Response) =>
      ok(
        res,
        view(
          found(
            await model
              .findOne({ _id: req.params.id, published: true })
              .select(PUBLIC_SELECT)
              .lean(),
          ) as Plain,
        ),
      ),
    create: async (req: Request, res: Response) => {
      const doc = await model.create({
        ...req.body,
        published: false,
        createdBy: req.user!.id,
        updatedBy: req.user!.id,
      });
      ok(res, view(doc.toObject()), 201);
    },
    update: async (req: Request, res: Response) => {
      const doc = await model
        .findByIdAndUpdate(
          req.params.id,
          { $set: { ...req.body, updatedBy: req.user!.id } },
          { new: true, runValidators: true },
        )
        .lean();
      ok(res, view(found(doc) as Plain));
    },
    publish: async (req: Request, res: Response) => {
      const doc = await model
        .findByIdAndUpdate(
          req.params.id,
          {
            $set: {
              published: true,
              publishedAt: new Date(),
              updatedBy: req.user!.id,
            },
          },
          { new: true },
        )
        .lean();
      ok(res, view(found(doc) as Plain));
    },
    unpublish: async (req: Request, res: Response) => {
      const doc = await model
        .findByIdAndUpdate(
          req.params.id,
          { $set: { published: false, updatedBy: req.user!.id } },
          { new: true },
        )
        .lean();
      ok(res, view(found(doc) as Plain));
    },
    remove: async (req: Request, res: Response) => {
      found(await model.findByIdAndDelete(req.params.id).lean());
      await audit(req, "content.deleted", {
        targetType: cfg.tag,
        targetId: req.params.id,
      });
      ok(res, { deleted: true });
    },
  };
}
