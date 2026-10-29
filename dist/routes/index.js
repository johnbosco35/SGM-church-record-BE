"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountApi = mountApi;
const constants_1 = require("../config/constants");
const adminEnquiry_routes_1 = require("./adminEnquiry.routes");
const auth_routes_1 = require("./auth.routes");
const chat_routes_1 = require("./chat.routes");
const content_routes_1 = require("./content.routes");
const extraction_routes_1 = require("./extraction.routes");
const register_routes_1 = require("./register.routes");
const request_routes_1 = require("./request.routes");
const revision_routes_1 = require("./revision.routes");
const site_routes_1 = require("./site.routes");
const upload_routes_1 = require("./upload.routes");
const user_routes_1 = require("./user.routes");
const mounts = [
    ["/auth", auth_routes_1.authRouter],
    ["/users", user_routes_1.userRouter],
    ...register_routes_1.registerRouters, // membership-cards, baptisms, first-holy-communions, confirmations, holy-matrimonies, holy-orders, sick-calls
    ["/uploads", upload_routes_1.uploadRouter],
    ["/extractions", extraction_routes_1.extractionRouter],
    ["/revisions", revision_routes_1.revisionRouter],
    ["/requests", request_routes_1.requestRouter],
    ["/admin-enquiries", adminEnquiry_routes_1.adminEnquiryRouter],
    ["/chat", chat_routes_1.chatRouter],
    ["/website-settings", site_routes_1.websiteSettingsRouter],
    ["/announcements", content_routes_1.announcementRouter],
    ["/events", content_routes_1.eventRouter],
    ["/mass-schedules", content_routes_1.massScheduleRouter],
    ["/ministries", content_routes_1.ministryRouter],
    ["/societies", content_routes_1.societyRouter],
    ["/sacraments-information", content_routes_1.sacramentInfoRouter],
    ["/news", content_routes_1.newsRouter],
    ["/gallery", content_routes_1.galleryRouter],
    ["/homilies", content_routes_1.homilyRouter],
    ["/donations", site_routes_1.donationRouter],
    ["/messages", site_routes_1.messageRouter],
];
function mountApi(app, middleware) {
    for (const [path, router] of mounts)
        app.use(`${constants_1.API_PREFIX}${path}`, ...middleware, router);
}
//# sourceMappingURL=index.js.map