import { Router } from "express";
import type { Model } from "mongoose";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { createContentController } from "../controllers/content.controller";
import { emailSchema, idParams } from "../helpers";
import {
  Announcement,
  ChurchEvent,
  GalleryItem,
  Homily,
  MassSchedule,
  Ministry,
  News,
  SacramentInfo,
  Society,
} from "../models/content";
import { mountRoutes, type RouteSpec } from "./define";

// ───────────── schemas (site.routes.ts reuses the settings/donation/message ones) ─────────────
const t = (max: number, min = 1) => z.string().trim().min(min).max(max);
const opt = (max: number) => z.string().trim().max(max).optional();
const url = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL");
const date = z.coerce.date();

export const announcementBody = z
  .object({
    title: t(200),
    body: t(5000),
    pinned: z.boolean().optional(),
    startsAt: date.optional(),
    endsAt: date.optional(),
  })
  .strict();

export const eventBody = z
  .object({
    title: t(200),
    description: opt(5000),
    startsAt: date,
    endsAt: date.optional(),
    location: opt(200),
  })
  .strict();

export const massScheduleBody = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24h HH:mm"),
    kind: z.enum(["sunday", "weekday", "holy_day", "special"]).optional(),
    language: opt(60),
    location: opt(200),
    notes: opt(500),
  })
  .strict();

const groupBody = z
  .object({
    name: t(160),
    description: opt(5000),
    leaderName: opt(120),
    meetingSchedule: opt(300),
    contactEmail: emailSchema.optional(),
  })
  .strict();
export const ministryBody = groupBody;
export const societyBody = groupBody;

export const sacramentInfoBody = z
  .object({
    sacrament: z.enum([
      "baptism",
      "confirmation",
      "eucharist",
      "reconciliation",
      "anointing_of_the_sick",
      "holy_matrimony",
      "holy_orders",
    ]),
    title: t(200),
    summary: opt(1000),
    requirements: opt(5000),
    body: opt(10000),
  })
  .strict();

export const newsBody = z
  .object({
    title: t(200),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    summary: opt(500),
    body: t(20000),
    coverImageUrl: url.optional(),
  })
  .strict();

export const galleryBody = z
  .object({ title: t(200), caption: opt(500), album: opt(120), imageUrl: url })
  .strict();

export const homilyBody = z
  .object({
    title: t(200),
    preacher: opt(120),
    deliveredOn: date.optional(),
    summary: opt(1000),
    body: opt(30000),
    audioUrl: url.optional(),
    videoUrl: url.optional(),
  })
  .strict();

export const websiteSettingsBody = z
  .object({
    churchName: opt(200),
    tagline: opt(300),
    about: opt(5000),
    address: opt(300),
    phone: opt(40),
    email: emailSchema.optional(),
    officeHours: opt(500),
    donationInstructions: opt(2000),
    heroImageUrl: url.optional(),
    socialLinks: z
      .object({
        facebook: url.optional(),
        instagram: url.optional(),
        youtube: url.optional(),
        x: url.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const donationBody = z
  .object({
    donorName: opt(120),
    email: emailSchema.optional(),
    amount: z.number().positive().max(100_000_000),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default("NGN"),
    purpose: opt(200),
    message: opt(1000),
    anonymous: z.boolean().optional(),
  })
  .strict();
export const donationNoteBody = z.object({ adminNote: t(1000) }).strict();

export const messageBody = z
  .object({
    name: t(120, 2),
    email: emailSchema,
    phone: opt(40),
    subject: opt(200),
    body: t(4000, 5),
    consentGiven: z.literal(true, {
      errorMap: () => ({ message: "Consent is required" }),
    }),
    website: z.string().max(200).optional(), // honeypot
  })
  .strict();
export const messageStatusBody = z
  .object({ status: z.enum(["unread", "read", "archived"]) })
  .strict();

export const contentListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
});
export const manageListQuery = contentListQuery.extend({
  published: z.enum(["true", "false"]).optional(),
});
export const simpleListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().max(30).optional(),
});

// ───────────── generic router: public = published only, manage = admin ─────────────
interface ContentConfig {
  basePath: string;
  tag: string;
  label: string;
  model: Model<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  body: ZodObject<ZodRawShape>;
  searchFields: string[];
  sort: Record<string, 1 | -1>;
}

function createContentRouter(cfg: ContentConfig): Router {
  const router = Router();
  const c = createContentController(cfg);
  const tags = [cfg.tag];
  const admin = ["admin"] as const;
  const specs: RouteSpec[] = [
    {
      method: "get",
      path: "/",
      tags,
      auth: "public",
      query: contentListQuery,
      summary: `List published ${cfg.label} (public)`,
      handler: c.list,
    },
    {
      method: "get",
      path: "/manage/all",
      tags,
      auth: admin,
      query: manageListQuery,
      summary: `List all ${cfg.label} including unpublished (admin)`,
      handler: c.manageList,
    },
    {
      method: "get",
      path: "/manage/:id",
      tags,
      auth: admin,
      params: idParams,
      summary: "Get any item, published or not (admin)",
      handler: c.manageGet,
    },
    {
      method: "get",
      path: "/:id",
      tags,
      auth: "public",
      params: idParams,
      summary: "Get one published item (public)",
      handler: c.get,
    },
    {
      method: "post",
      path: "/",
      tags,
      auth: admin,
      status: 201,
      body: cfg.body,
      summary: `Create ${cfg.label} (unpublished by default)`,
      handler: c.create,
    },
    {
      method: "patch",
      path: "/:id",
      tags,
      auth: admin,
      params: idParams,
      body: cfg.body.partial().strict(),
      summary: `Update ${cfg.label}`,
      handler: c.update,
    },
    {
      method: "post",
      path: "/:id/publish",
      tags,
      auth: admin,
      params: idParams,
      summary: "Publish (makes it visible on the public site)",
      handler: c.publish,
    },
    {
      method: "post",
      path: "/:id/unpublish",
      tags,
      auth: admin,
      params: idParams,
      summary: "Unpublish (hides it from the public site)",
      handler: c.unpublish,
    },
    {
      method: "delete",
      path: "/:id",
      tags,
      auth: admin,
      params: idParams,
      summary: `Delete ${cfg.label} (website content only)`,
      handler: c.remove,
    },
  ];
  mountRoutes(router, cfg.basePath, specs);
  return router;
}

export const announcementRouter = createContentRouter({
  basePath: "/announcements",
  tag: "Announcements",
  label: "announcements",
  model: Announcement,
  body: announcementBody,
  searchFields: ["title", "body"],
  sort: { pinned: -1, publishedAt: -1, _id: -1 },
});
export const eventRouter = createContentRouter({
  basePath: "/events",
  tag: "Events",
  label: "events",
  model: ChurchEvent,
  body: eventBody,
  searchFields: ["title", "description", "location"],
  sort: { startsAt: 1 },
});
export const massScheduleRouter = createContentRouter({
  basePath: "/mass-schedules",
  tag: "Mass schedules",
  label: "mass schedule entries",
  model: MassSchedule,
  body: massScheduleBody,
  searchFields: ["location", "notes", "language"],
  sort: { dayOfWeek: 1, time: 1 },
});
export const ministryRouter = createContentRouter({
  basePath: "/ministries",
  tag: "Ministries",
  label: "ministries",
  model: Ministry,
  body: ministryBody,
  searchFields: ["name", "description"],
  sort: { name: 1 },
});
export const societyRouter = createContentRouter({
  basePath: "/societies",
  tag: "Societies",
  label: "societies",
  model: Society,
  body: societyBody,
  searchFields: ["name", "description"],
  sort: { name: 1 },
});
export const sacramentInfoRouter = createContentRouter({
  basePath: "/sacraments-information",
  tag: "Sacraments information",
  label: "sacrament information",
  model: SacramentInfo,
  body: sacramentInfoBody,
  searchFields: ["title", "summary", "body"],
  sort: { sacrament: 1 },
});
export const newsRouter = createContentRouter({
  basePath: "/news",
  tag: "News",
  label: "news articles",
  model: News,
  body: newsBody,
  searchFields: ["title", "summary", "body"],
  sort: { publishedAt: -1, _id: -1 },
});
export const galleryRouter = createContentRouter({
  basePath: "/gallery",
  tag: "Gallery",
  label: "gallery items",
  model: GalleryItem,
  body: galleryBody,
  searchFields: ["title", "caption", "album"],
  sort: { createdAt: -1 },
});
export const homilyRouter = createContentRouter({
  basePath: "/homilies",
  tag: "Homilies",
  label: "homilies and reflections",
  model: Homily,
  body: homilyBody,
  searchFields: ["title", "summary", "body", "preacher"],
  sort: { deliveredOn: -1, _id: -1 },
});
