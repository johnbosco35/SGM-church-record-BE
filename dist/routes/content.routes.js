"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.homilyRouter = exports.galleryRouter = exports.newsRouter = exports.sacramentInfoRouter = exports.societyRouter = exports.ministryRouter = exports.massScheduleRouter = exports.eventRouter = exports.announcementRouter = exports.simpleListQuery = exports.manageListQuery = exports.contentListQuery = exports.messageStatusBody = exports.messageBody = exports.donationNoteBody = exports.donationBody = exports.websiteSettingsBody = exports.homilyBody = exports.galleryBody = exports.newsBody = exports.sacramentInfoBody = exports.societyBody = exports.ministryBody = exports.massScheduleBody = exports.eventBody = exports.announcementBody = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const content_controller_1 = require("../controllers/content.controller");
const helpers_1 = require("../helpers");
const content_1 = require("../models/content");
const define_1 = require("./define");
// ───────────── schemas (site.routes.ts reuses the settings/donation/message ones) ─────────────
const t = (max, min = 1) => zod_1.z.string().trim().min(min).max(max);
const opt = (max) => zod_1.z.string().trim().max(max).optional();
const url = zod_1.z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) URL");
const date = zod_1.z.coerce.date();
exports.announcementBody = zod_1.z
    .object({
    title: t(200),
    body: t(5000),
    pinned: zod_1.z.boolean().optional(),
    startsAt: date.optional(),
    endsAt: date.optional(),
})
    .strict();
exports.eventBody = zod_1.z
    .object({
    title: t(200),
    description: opt(5000),
    startsAt: date,
    endsAt: date.optional(),
    location: opt(200),
})
    .strict();
exports.massScheduleBody = zod_1.z
    .object({
    dayOfWeek: zod_1.z.number().int().min(0).max(6),
    time: zod_1.z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24h HH:mm"),
    kind: zod_1.z.enum(["sunday", "weekday", "holy_day", "special"]).optional(),
    language: opt(60),
    location: opt(200),
    notes: opt(500),
})
    .strict();
const groupBody = zod_1.z
    .object({
    name: t(160),
    description: opt(5000),
    leaderName: opt(120),
    meetingSchedule: opt(300),
    contactEmail: helpers_1.emailSchema.optional(),
})
    .strict();
exports.ministryBody = groupBody;
exports.societyBody = groupBody;
exports.sacramentInfoBody = zod_1.z
    .object({
    sacrament: zod_1.z.enum([
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
exports.newsBody = zod_1.z
    .object({
    title: t(200),
    slug: zod_1.z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(120),
    summary: opt(500),
    body: t(20000),
    coverImageUrl: url.optional(),
})
    .strict();
exports.galleryBody = zod_1.z
    .object({ title: t(200), caption: opt(500), album: opt(120), imageUrl: url })
    .strict();
exports.homilyBody = zod_1.z
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
exports.websiteSettingsBody = zod_1.z
    .object({
    churchName: opt(200),
    tagline: opt(300),
    about: opt(5000),
    address: opt(300),
    phone: opt(40),
    email: helpers_1.emailSchema.optional(),
    officeHours: opt(500),
    donationInstructions: opt(2000),
    heroImageUrl: url.optional(),
    socialLinks: zod_1.z
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
exports.donationBody = zod_1.z
    .object({
    donorName: opt(120),
    email: helpers_1.emailSchema.optional(),
    amount: zod_1.z.number().positive().max(100_000_000),
    currency: zod_1.z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("NGN"),
    purpose: opt(200),
    message: opt(1000),
    anonymous: zod_1.z.boolean().optional(),
})
    .strict();
exports.donationNoteBody = zod_1.z.object({ adminNote: t(1000) }).strict();
exports.messageBody = zod_1.z
    .object({
    name: t(120, 2),
    email: helpers_1.emailSchema,
    phone: opt(40),
    subject: opt(200),
    body: t(4000, 5),
    consentGiven: zod_1.z.literal(true, {
        errorMap: () => ({ message: "Consent is required" }),
    }),
    website: zod_1.z.string().max(200).optional(), // honeypot
})
    .strict();
exports.messageStatusBody = zod_1.z
    .object({ status: zod_1.z.enum(["unread", "read", "archived"]) })
    .strict();
exports.contentListQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    q: zod_1.z.string().trim().max(100).optional(),
});
exports.manageListQuery = exports.contentListQuery.extend({
    published: zod_1.z.enum(["true", "false"]).optional(),
});
exports.simpleListQuery = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(25),
    status: zod_1.z.string().max(30).optional(),
});
function createContentRouter(cfg) {
    const router = (0, express_1.Router)();
    const c = (0, content_controller_1.createContentController)(cfg);
    const tags = [cfg.tag];
    const admin = ["admin"];
    const specs = [
        {
            method: "get",
            path: "/",
            tags,
            auth: "public",
            query: exports.contentListQuery,
            summary: `List published ${cfg.label} (public)`,
            handler: c.list,
        },
        {
            method: "get",
            path: "/manage/all",
            tags,
            auth: admin,
            query: exports.manageListQuery,
            summary: `List all ${cfg.label} including unpublished (admin)`,
            handler: c.manageList,
        },
        {
            method: "get",
            path: "/manage/:id",
            tags,
            auth: admin,
            params: helpers_1.idParams,
            summary: "Get any item, published or not (admin)",
            handler: c.manageGet,
        },
        {
            method: "get",
            path: "/:id",
            tags,
            auth: "public",
            params: helpers_1.idParams,
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
            params: helpers_1.idParams,
            body: cfg.body.partial().strict(),
            summary: `Update ${cfg.label}`,
            handler: c.update,
        },
        {
            method: "post",
            path: "/:id/publish",
            tags,
            auth: admin,
            params: helpers_1.idParams,
            summary: "Publish (makes it visible on the public site)",
            handler: c.publish,
        },
        {
            method: "post",
            path: "/:id/unpublish",
            tags,
            auth: admin,
            params: helpers_1.idParams,
            summary: "Unpublish (hides it from the public site)",
            handler: c.unpublish,
        },
        {
            method: "delete",
            path: "/:id",
            tags,
            auth: admin,
            params: helpers_1.idParams,
            summary: `Delete ${cfg.label} (website content only)`,
            handler: c.remove,
        },
    ];
    (0, define_1.mountRoutes)(router, cfg.basePath, specs);
    return router;
}
exports.announcementRouter = createContentRouter({
    basePath: "/announcements",
    tag: "Announcements",
    label: "announcements",
    model: content_1.Announcement,
    body: exports.announcementBody,
    searchFields: ["title", "body"],
    sort: { pinned: -1, publishedAt: -1, _id: -1 },
});
exports.eventRouter = createContentRouter({
    basePath: "/events",
    tag: "Events",
    label: "events",
    model: content_1.ChurchEvent,
    body: exports.eventBody,
    searchFields: ["title", "description", "location"],
    sort: { startsAt: 1 },
});
exports.massScheduleRouter = createContentRouter({
    basePath: "/mass-schedules",
    tag: "Mass schedules",
    label: "mass schedule entries",
    model: content_1.MassSchedule,
    body: exports.massScheduleBody,
    searchFields: ["location", "notes", "language"],
    sort: { dayOfWeek: 1, time: 1 },
});
exports.ministryRouter = createContentRouter({
    basePath: "/ministries",
    tag: "Ministries",
    label: "ministries",
    model: content_1.Ministry,
    body: exports.ministryBody,
    searchFields: ["name", "description"],
    sort: { name: 1 },
});
exports.societyRouter = createContentRouter({
    basePath: "/societies",
    tag: "Societies",
    label: "societies",
    model: content_1.Society,
    body: exports.societyBody,
    searchFields: ["name", "description"],
    sort: { name: 1 },
});
exports.sacramentInfoRouter = createContentRouter({
    basePath: "/sacraments-information",
    tag: "Sacraments information",
    label: "sacrament information",
    model: content_1.SacramentInfo,
    body: exports.sacramentInfoBody,
    searchFields: ["title", "summary", "body"],
    sort: { sacrament: 1 },
});
exports.newsRouter = createContentRouter({
    basePath: "/news",
    tag: "News",
    label: "news articles",
    model: content_1.News,
    body: exports.newsBody,
    searchFields: ["title", "summary", "body"],
    sort: { publishedAt: -1, _id: -1 },
});
exports.galleryRouter = createContentRouter({
    basePath: "/gallery",
    tag: "Gallery",
    label: "gallery items",
    model: content_1.GalleryItem,
    body: exports.galleryBody,
    searchFields: ["title", "caption", "album"],
    sort: { createdAt: -1 },
});
exports.homilyRouter = createContentRouter({
    basePath: "/homilies",
    tag: "Homilies",
    label: "homilies and reflections",
    model: content_1.Homily,
    body: exports.homilyBody,
    searchFields: ["title", "summary", "body", "preacher"],
    sort: { deliveredOn: -1, _id: -1 },
});
//# sourceMappingURL=content.routes.js.map