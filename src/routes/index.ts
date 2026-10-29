import type { Express, RequestHandler, Router } from "express";
import { API_PREFIX } from "../config/constants";
import { adminEnquiryRouter } from "./adminEnquiry.routes";
import { authRouter } from "./auth.routes";
import { chatRouter } from "./chat.routes";
import {
  announcementRouter,
  eventRouter,
  galleryRouter,
  homilyRouter,
  massScheduleRouter,
  ministryRouter,
  newsRouter,
  sacramentInfoRouter,
  societyRouter,
} from "./content.routes";
import { extractionRouter } from "./extraction.routes";
import { registerRouters } from "./register.routes";
import { requestRouter } from "./request.routes";
import { revisionRouter } from "./revision.routes";
import {
  donationRouter,
  messageRouter,
  websiteSettingsRouter,
} from "./site.routes";
import { uploadRouter } from "./upload.routes";
import { userRouter } from "./user.routes";

const mounts: Array<[string, Router]> = [
  ["/auth", authRouter],
  ["/users", userRouter],
  ...registerRouters, // membership-cards, baptisms, first-holy-communions, confirmations, holy-matrimonies, holy-orders, sick-calls
  ["/uploads", uploadRouter],
  ["/extractions", extractionRouter],
  ["/revisions", revisionRouter],
  ["/requests", requestRouter],
  ["/admin-enquiries", adminEnquiryRouter],
  ["/chat", chatRouter],
  ["/website-settings", websiteSettingsRouter],
  ["/announcements", announcementRouter],
  ["/events", eventRouter],
  ["/mass-schedules", massScheduleRouter],
  ["/ministries", ministryRouter],
  ["/societies", societyRouter],
  ["/sacraments-information", sacramentInfoRouter],
  ["/news", newsRouter],
  ["/gallery", galleryRouter],
  ["/homilies", homilyRouter],
  ["/donations", donationRouter],
  ["/messages", messageRouter],
];

export function mountApi(app: Express, middleware: RequestHandler[]): void {
  for (const [path, router] of mounts)
    app.use(`${API_PREFIX}${path}`, ...middleware, router);
}
