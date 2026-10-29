import type { Request, Response } from "express";
import { AppError, ok, paged } from "../middleware/http";
import { audit } from "../models/AuditLog";
import { Donation, Message, WebsiteSettings } from "../models/content";

type Plain = Record<string, unknown>;
const view = (d: Plain): Plain => {
  const { _id, __v, ...rest } = d;
  return { id: String(_id), ...rest };
};
const found = <T>(doc: T | null): T => {
  if (!doc) throw AppError.notFound();
  return doc;
};
const pageOf = (req: Request) =>
  req.query as unknown as { page: number; limit: number; status?: string };

export const settingsController = {
  get: async (_req: Request, res: Response) => {
    const s = await WebsiteSettings.findOne({ key: "singleton" })
      .select("-updatedBy -__v -key")
      .lean();
    ok(res, s ? view(s as Plain) : {});
  },
  update: async (req: Request, res: Response) => {
    const s = await WebsiteSettings.findOneAndUpdate(
      { key: "singleton" },
      { $set: { ...req.body, updatedBy: req.user!.id } },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
    await audit(req, "settings.updated");
    ok(res, view(s as Plain));
  },
};

/** Donation RECORDS only: no payment is processed and none is claimed. */
export const donationController = {
  create: async (req: Request, res: Response) => {
    const d = await Donation.create({
      ...req.body,
      isDemo: true,
      paymentStatus: "not_processed",
    });
    ok(
      res,
      {
        id: String(d._id),
        paymentStatus: "not_processed",
        isDemo: true,
        message:
          "Your donation intention has been recorded. No payment has been processed. The parish office will advise how to give.",
      },
      201,
    );
  },
  list: async (req: Request, res: Response) => {
    const q = pageOf(req);
    const [items, total] = await Promise.all([
      Donation.find()
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      Donation.countDocuments(),
    ]);
    paged(
      res,
      items.map((i: Plain) => view(i)),
      q.page,
      q.limit,
      total,
    );
  },
  get: async (req: Request, res: Response) =>
    ok(
      res,
      view(found(await Donation.findById(req.params.id).lean()) as Plain),
    ),
  addNote: async (req: Request, res: Response) =>
    ok(
      res,
      view(
        found(
          await Donation.findByIdAndUpdate(
            req.params.id,
            { $set: { adminNote: req.body.adminNote } },
            { new: true },
          ).lean(),
        ) as Plain,
      ),
    ),
};

export const messageController = {
  create: async (req: Request, res: Response) => {
    const { website, ...data } = req.body;
    if (!website) await Message.create(data); // honeypot: silently drop bot submissions
    ok(res, { message: "Thank you. Your message has been received." }, 201);
  },
  list: async (req: Request, res: Response) => {
    const q = pageOf(req);
    const filter = q.status ? { status: q.status } : {};
    const [items, total] = await Promise.all([
      Message.find(filter)
        .sort({ createdAt: -1 })
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .lean(),
      Message.countDocuments(filter),
    ]);
    paged(
      res,
      items.map((i: Plain) => view(i)),
      q.page,
      q.limit,
      total,
    );
  },
  get: async (req: Request, res: Response) =>
    ok(res, view(found(await Message.findById(req.params.id).lean()) as Plain)),
  setStatus: async (req: Request, res: Response) =>
    ok(
      res,
      view(
        found(
          await Message.findByIdAndUpdate(
            req.params.id,
            { $set: { status: req.body.status } },
            { new: true },
          ).lean(),
        ) as Plain,
      ),
    ),
  remove: async (req: Request, res: Response) => {
    found(await Message.findByIdAndDelete(req.params.id).lean());
    ok(res, { deleted: true });
  },
};
