"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminEnquiryRouter = void 0;
const express_1 = require("express");
const adminEnquiry_controller_1 = require("../controllers/adminEnquiry.controller");
const helpers_1 = require("../helpers");
const define_1 = require("./define");
const request_routes_1 = require("./request.routes");
exports.adminEnquiryRouter = (0, express_1.Router)();
const tags = ["Admin enquiries"];
(0, define_1.mountRoutes)(exports.adminEnquiryRouter, "/admin-enquiries", [
    {
        method: "get",
        path: "/",
        tags,
        auth: ["admin", "customer_care"],
        query: request_routes_1.enquiryListQuery,
        summary: "Admins see all enquiries; customer care sees only the ones they forwarded (without admin-internal notes)",
        handler: adminEnquiry_controller_1.adminEnquiryController.list,
    },
    {
        method: "get",
        path: "/:id",
        tags,
        auth: ["admin", "customer_care"],
        params: helpers_1.idParams,
        summary: "Enquiry detail incl. the admin response once answered",
        handler: adminEnquiry_controller_1.adminEnquiryController.get,
    },
    {
        method: "post",
        path: "/:id/acknowledge",
        tags,
        auth: ["admin"],
        params: helpers_1.idParams,
        summary: "Admin acknowledges the enquiry (request moves to awaiting_admin_response)",
        handler: adminEnquiry_controller_1.adminEnquiryController.acknowledge,
    },
    {
        method: "post",
        path: "/:id/respond",
        tags,
        auth: ["admin"],
        params: helpers_1.idParams,
        body: request_routes_1.respondBody,
        summary: "Admin records a response (request moves to response_received)",
        handler: adminEnquiry_controller_1.adminEnquiryController.respond,
    },
]);
//# sourceMappingURL=adminEnquiry.routes.js.map