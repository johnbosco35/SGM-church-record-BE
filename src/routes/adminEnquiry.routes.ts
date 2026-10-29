import { Router } from "express";
import { adminEnquiryController as c } from "../controllers/adminEnquiry.controller";
import { idParams } from "../helpers";
import { mountRoutes } from "./define";
import { enquiryListQuery, respondBody } from "./request.routes";

export const adminEnquiryRouter = Router();
const tags = ["Admin enquiries"];

mountRoutes(adminEnquiryRouter, "/admin-enquiries", [
  {
    method: "get",
    path: "/",
    tags,
    auth: ["admin", "customer_care"],
    query: enquiryListQuery,
    summary:
      "Admins see all enquiries; customer care sees only the ones they forwarded (without admin-internal notes)",
    handler: c.list,
  },
  {
    method: "get",
    path: "/:id",
    tags,
    auth: ["admin", "customer_care"],
    params: idParams,
    summary: "Enquiry detail incl. the admin response once answered",
    handler: c.get,
  },
  {
    method: "post",
    path: "/:id/acknowledge",
    tags,
    auth: ["admin"],
    params: idParams,
    summary:
      "Admin acknowledges the enquiry (request moves to awaiting_admin_response)",
    handler: c.acknowledge,
  },
  {
    method: "post",
    path: "/:id/respond",
    tags,
    auth: ["admin"],
    params: idParams,
    body: respondBody,
    summary: "Admin records a response (request moves to response_received)",
    handler: c.respond,
  },
]);
