"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const chat_controller_1 = require("../controllers/chat.controller");
const rateLimit_1 = require("../middleware/rateLimit");
const define_1 = require("./define");
const request_routes_1 = require("./request.routes");
exports.chatRouter = (0, express_1.Router)();
const chatBody = zod_1.z
    .object({
    messages: zod_1.z
        .array(zod_1.z
        .object({
        role: zod_1.z.enum(["user", "assistant"]),
        content: zod_1.z.string().trim().min(1).max(1000),
    })
        .strict())
        .min(1)
        .max(12),
})
    .strict()
    .refine((b) => b.messages[b.messages.length - 1].role === "user", {
    message: "The last message must come from the user",
    path: ["messages"],
});
const chatResponse = zod_1.z.object({
    reply: zod_1.z.string(),
    provider: zod_1.z.object({ name: zod_1.z.string(), isMock: zod_1.z.boolean() }),
    blocked: zod_1.z.boolean(),
    suggestedAction: zod_1.z.enum(["create_support_request"]).nullable(),
});
(0, define_1.mountRoutes)(exports.chatRouter, "/chat", [
    {
        method: "post",
        path: "/",
        tags: ["JOHNBOSCO chat"],
        auth: "public",
        middleware: [rateLimit_1.chatLimiter],
        body: chatBody,
        response: chatResponse,
        summary: "Ask the JOHNBOSCO assistant. Uses published website content only; refuses record lookups and identity verification. Mock mode is labelled in the reply and provider fields.",
        handler: chat_controller_1.chatController.ask,
    },
    {
        method: "post",
        path: "/support-request",
        tags: ["JOHNBOSCO chat"],
        auth: "public",
        status: 201,
        middleware: [rateLimit_1.publicFormLimiter],
        body: request_routes_1.publicRequestBody,
        response: request_routes_1.publicRequestResponse,
        summary: "Forward a visitor request from the chat to customer care (same fields and consent rules as POST /requests)",
        handler: chat_controller_1.chatController.supportRequest,
    },
]);
//# sourceMappingURL=chat.routes.js.map