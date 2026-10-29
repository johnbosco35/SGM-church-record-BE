import { Router } from "express";
import {
  donationController,
  messageController,
  settingsController,
} from "../controllers/site.controller";
import { idParams } from "../helpers";
import { publicFormLimiter } from "../middleware/rateLimit";
import { mountRoutes } from "./define";
import {
  donationBody,
  donationNoteBody,
  messageBody,
  messageStatusBody,
  simpleListQuery,
  websiteSettingsBody,
} from "./content.routes";

export const websiteSettingsRouter = Router();
export const donationRouter = Router();
export const messageRouter = Router();

mountRoutes(websiteSettingsRouter, "/website-settings", [
  {
    method: "get",
    path: "/",
    tags: ["Website settings"],
    auth: "public",
    summary: "Public church settings (name, contact details, office hours...)",
    handler: settingsController.get,
  },
  {
    method: "put",
    path: "/",
    tags: ["Website settings"],
    auth: ["admin"],
    body: websiteSettingsBody,
    summary: "Update settings (admin)",
    handler: settingsController.update,
  },
]);

mountRoutes(donationRouter, "/donations", [
  {
    method: "post",
    path: "/",
    tags: ["Donations"],
    auth: "public",
    status: 201,
    middleware: [publicFormLimiter],
    body: donationBody,
    summary:
      "Record a donation intention. DEMO ONLY: no payment is processed and none is claimed.",
    handler: donationController.create,
  },
  {
    method: "get",
    path: "/",
    tags: ["Donations"],
    auth: ["admin"],
    query: simpleListQuery,
    summary: "List recorded donations (admin)",
    handler: donationController.list,
  },
  {
    method: "get",
    path: "/:id",
    tags: ["Donations"],
    auth: ["admin"],
    params: idParams,
    summary: "Donation detail (admin)",
    handler: donationController.get,
  },
  {
    method: "patch",
    path: "/:id",
    tags: ["Donations"],
    auth: ["admin"],
    params: idParams,
    body: donationNoteBody,
    summary:
      "Add an admin note to a donation record. Donation records cannot be deleted.",
    handler: donationController.addNote,
  },
]);

mountRoutes(messageRouter, "/messages", [
  {
    method: "post",
    path: "/",
    tags: ["Messages"],
    auth: "public",
    status: 201,
    middleware: [publicFormLimiter],
    body: messageBody,
    summary: "Visitor sends a general message/contact-form enquiry",
    handler: messageController.create,
  },
  {
    method: "get",
    path: "/",
    tags: ["Messages"],
    auth: ["admin"],
    query: simpleListQuery,
    summary: "List messages (admin)",
    handler: messageController.list,
  },
  {
    method: "get",
    path: "/:id",
    tags: ["Messages"],
    auth: ["admin"],
    params: idParams,
    summary: "Message detail (admin)",
    handler: messageController.get,
  },
  {
    method: "patch",
    path: "/:id",
    tags: ["Messages"],
    auth: ["admin"],
    params: idParams,
    body: messageStatusBody,
    summary: "Mark read/unread/archived (admin)",
    handler: messageController.setStatus,
  },
  {
    method: "delete",
    path: "/:id",
    tags: ["Messages"],
    auth: ["admin"],
    params: idParams,
    summary: "Delete a message (admin)",
    handler: messageController.remove,
  },
]);
