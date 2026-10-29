"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicChatProvider = exports.MockChatProvider = exports.MOCK_PREFIX = void 0;
exports.getChatProvider = getChatProvider;
const env_1 = require("../config/env");
const http_1 = require("../middleware/http");
// ───────────── mock provider ─────────────
const DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
exports.MOCK_PREFIX = "(Demo assistant: automated keyword replies from published website content, not an AI model.) ";
const has = (s, ...words) => words.some((w) => s.includes(w));
/** Deterministic keyword fallback used when no AI provider is configured. */
class MockChatProvider {
    name = "mock";
    isMock = true;
    async generate({ context, messages, }) {
        const q = [...messages]
            .reverse()
            .find((m) => m.role === "user")
            ?.content.toLowerCase() ?? "";
        return { reply: exports.MOCK_PREFIX + this.answer(q, context) };
    }
    answer(q, c) {
        if (has(q, "mass", "schedule", "service time", "what time")) {
            if (!c.massSchedules.length)
                return "The Mass schedule has not been published yet. Please contact the parish office.";
            return ("Mass schedule: " +
                c.massSchedules
                    .map((m) => `${DAYS[m.dayOfWeek]} ${m.time}${m.location ? ` (${m.location})` : ""}${m.language ? ` [${m.language}]` : ""}`)
                    .join("; ") +
                ".");
        }
        if (has(q, "event", "upcoming", "happening")) {
            if (!c.events.length)
                return "There are no upcoming events published right now.";
            return ("Upcoming events: " +
                c.events
                    .map((e) => `${e.title} on ${e.startsAt.slice(0, 10)}${e.location ? ` at ${e.location}` : ""}`)
                    .join("; ") +
                ".");
        }
        if (has(q, "announcement", "news", "notice")) {
            if (!c.announcements.length)
                return "There are no current announcements.";
            return ("Announcements: " + c.announcements.map((a) => a.title).join("; ") + ".");
        }
        if (has(q, "ministr")) {
            return c.ministries.length
                ? "Ministries: " +
                    c.ministries
                        .map((m) => `${m.name}${m.meetingSchedule ? ` (${m.meetingSchedule})` : ""}`)
                        .join("; ") +
                    "."
                : "No ministries are published yet.";
        }
        if (has(q, "societ")) {
            return c.societies.length
                ? "Societies: " +
                    c.societies
                        .map((m) => `${m.name}${m.meetingSchedule ? ` (${m.meetingSchedule})` : ""}`)
                        .join("; ") +
                    "."
                : "No societies are published yet.";
        }
        const sacramentWords = {
            baptism: ["baptism", "baptise", "baptize"],
            confirmation: ["confirmation"],
            eucharist: ["communion", "eucharist"],
            reconciliation: ["confession", "reconciliation"],
            anointing_of_the_sick: ["anoint"],
            holy_matrimony: ["marriage", "matrimony", "wedding"],
            holy_orders: ["holy orders", "ordination", "priesthood"],
        };
        for (const s of c.sacraments) {
            if (has(q, ...(sacramentWords[s.sacrament] ?? []))) {
                return `${s.title}: ${s.summary ?? ""}${s.requirements ? ` Requirements: ${s.requirements}` : ""}`.trim();
            }
        }
        if (has(q, "contact", "office", "address", "phone", "email", "where")) {
            const k = c.contact;
            const parts = [
                k.address && `Address: ${k.address}`,
                k.phone && `Phone: ${k.phone}`,
                k.email && `Email: ${k.email}`,
                k.officeHours && `Office hours: ${k.officeHours}`,
            ].filter(Boolean);
            return parts.length
                ? parts.join(". ") + "."
                : "Contact details have not been published yet.";
        }
        return `I can help with Mass times, sacraments information, events, announcements, ministries and societies at ${c.churchName}. I can also pass a request to our customer-care team.`;
    }
}
exports.MockChatProvider = MockChatProvider;
// ───────────── Anthropic provider ─────────────
/** Calls the Anthropic Messages API from the backend (the key never reaches the browser). Not exercised by the automated tests. */
class AnthropicChatProvider {
    name = "anthropic";
    isMock = false;
    async generate({ system, context, messages, }) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20_000);
        try {
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                signal: controller.signal,
                headers: {
                    "content-type": "application/json",
                    "x-api-key": env_1.env.ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                },
                body: JSON.stringify({
                    model: env_1.env.CHAT_MODEL,
                    max_tokens: 600,
                    system: `${system}\n\nPUBLIC CONTEXT (JSON, the only facts you may use):\n${JSON.stringify(context)}`,
                    messages,
                }),
            });
            if (!res.ok)
                throw new http_1.AppError(502, "CHAT_PROVIDER_ERROR", "The assistant is temporarily unavailable");
            const data = (await res.json());
            const text = (data.content ?? [])
                .filter((b) => b.type === "text")
                .map((b) => b.text ?? "")
                .join("\n")
                .trim();
            if (!text)
                throw new http_1.AppError(502, "CHAT_PROVIDER_ERROR", "The assistant returned an empty response");
            return { reply: text };
        }
        catch (e) {
            if (e instanceof http_1.AppError)
                throw e;
            throw new http_1.AppError(502, "CHAT_PROVIDER_ERROR", "The assistant is temporarily unavailable");
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.AnthropicChatProvider = AnthropicChatProvider;
function getChatProvider() {
    return env_1.env.CHAT_PROVIDER === "anthropic"
        ? new AnthropicChatProvider()
        : new MockChatProvider();
}
//# sourceMappingURL=chat.js.map