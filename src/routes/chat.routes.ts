import { Router } from "express";
import { z } from "zod";
import { chatController as c } from "../controllers/chat.controller";
import { chatLimiter, publicFormLimiter } from "../middleware/rateLimit";
import { mountRoutes } from "./define";
import { publicRequestBody, publicRequestResponse } from "./request.routes";

export const chatRouter = Router();

const chatBody = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .refine((b) => b.messages[b.messages.length - 1].role === "user", {
    message: "The last message must come from the user",
    path: ["messages"],
  });

const chatResponse = z.object({
  reply: z.string(),
  provider: z.object({ name: z.string(), isMock: z.boolean() }),
  blocked: z.boolean(),
  suggestedAction: z.enum(["create_support_request"]).nullable(),
});

mountRoutes(chatRouter, "/chat", [
  {
    method: "post",
    path: "/",
    tags: ["JOHNBOSCO chat"],
    auth: "public",
    middleware: [chatLimiter],
    body: chatBody,
    response: chatResponse,
    summary:
      "Ask the JOHNBOSCO assistant. Uses published website content only; refuses record lookups and identity verification. Mock mode is labelled in the reply and provider fields.",
    handler: c.ask,
  },
  {
    method: "post",
    path: "/support-request",
    tags: ["JOHNBOSCO chat"],
    auth: "public",
    status: 201,
    middleware: [publicFormLimiter],
    body: publicRequestBody,
    response: publicRequestResponse,
    summary:
      "Forward a visitor request from the chat to customer care (same fields and consent rules as POST /requests)",
    handler: c.supportRequest,
  },
]);
