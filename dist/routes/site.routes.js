"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageRouter = exports.donationRouter = exports.websiteSettingsRouter = void 0;
const express_1 = require("express");
const site_controller_1 = require("../controllers/site.controller");
const helpers_1 = require("../helpers");
const rateLimit_1 = require("../middleware/rateLimit");
const define_1 = require("./define");
const content_routes_1 = require("./content.routes");
exports.websiteSettingsRouter = (0, express_1.Router)();
exports.donationRouter = (0, express_1.Router)();
exports.messageRouter = (0, express_1.Router)();
(0, define_1.mountRoutes)(exports.websiteSettingsRouter, "/website-settings", [
    {
        method: "get",
        path: "/",
        tags: ["Website settings"],
        auth: "public",
        summary: "Public church settings (name, contact details, office hours...)",
        handler: site_controller_1.settingsController.get,
    },
    {
        method: "put",
        path: "/",
        tags: ["Website settings"],
        auth: ["admin"],
        body: content_routes_1.websiteSettingsBody,
        summary: "Update settings (admin)",
        handler: site_controller_1.settingsController.update,
    },
]);
(0, define_1.mountRoutes)(exports.donationRouter, "/donations", [
    {
        method: "post",
        path: "/",
        tags: ["Donations"],
        auth: "public",
        status: 201,
        middleware: [rateLimit_1.publicFormLimiter],
        body: content_routes_1.donationBody,
        summary: "Record a donation intention. DEMO ONLY: no payment is processed and none is claimed.",
        handler: site_controller_1.donationController.create,
    },
    {
        method: "get",
        path: "/",
        tags: ["Donations"],
        auth: ["admin"],
        query: content_routes_1.simpleListQuery,
        summary: "List recorded donations (admin)",
        handler: site_controller_1.donationController.list,
    },
    {
        method: "get",
        path: "/:id",
        tags: ["Donations"],
        auth: ["admin"],
        params: helpers_1.idParams,
        summary: "Donation detail (admin)",
        handler: site_controller_1.donationController.get,
    },
    {
        method: "patch",
        path: "/:id",
        tags: ["Donations"],
        auth: ["admin"],
        params: helpers_1.idParams,
        body: content_routes_1.donationNoteBody,
        summary: "Add an admin note to a donation record. Donation records cannot be deleted.",
        handler: site_controller_1.donationController.addNote,
    },
]);
(0, define_1.mountRoutes)(exports.messageRouter, "/messages", [
    {
        method: "post",
        path: "/",
        tags: ["Messages"],
        auth: "public",
        status: 201,
        middleware: [rateLimit_1.publicFormLimiter],
        body: content_routes_1.messageBody,
        summary: "Visitor sends a general message/contact-form enquiry",
        handler: site_controller_1.messageController.create,
    },
    {
        method: "get",
        path: "/",
        tags: ["Messages"],
        auth: ["admin"],
        query: content_routes_1.simpleListQuery,
        summary: "List messages (admin)",
        handler: site_controller_1.messageController.list,
    },
    {
        method: "get",
        path: "/:id",
        tags: ["Messages"],
        auth: ["admin"],
        params: helpers_1.idParams,
        summary: "Message detail (admin)",
        handler: site_controller_1.messageController.get,
    },
    {
        method: "patch",
        path: "/:id",
        tags: ["Messages"],
        auth: ["admin"],
        params: helpers_1.idParams,
        body: content_routes_1.messageStatusBody,
        summary: "Mark read/unread/archived (admin)",
        handler: site_controller_1.messageController.setStatus,
    },
    {
        method: "delete",
        path: "/:id",
        tags: ["Messages"],
        auth: ["admin"],
        params: helpers_1.idParams,
        summary: "Delete a message (admin)",
        handler: site_controller_1.messageController.remove,
    },
]);
//# sourceMappingURL=site.routes.js.map