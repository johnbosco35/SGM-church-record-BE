import { env } from "../config/env";
import { AppError } from "../middleware/http";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Only PUBLISHED, public website content ever reaches a chat provider. */
export interface PublicContext {
  churchName: string;
  contact: {
    address?: string;
    phone?: string;
    email?: string;
    officeHours?: string;
  };
  massSchedules: Array<{
    dayOfWeek: number;
    time: string;
    kind?: string;
    language?: string;
    location?: string;
    notes?: string;
  }>;
  events: Array<{
    title: string;
    startsAt: string;
    location?: string;
    description?: string;
  }>;
  announcements: Array<{ title: string; body: string }>;
  ministries: Array<{
    name: string;
    description?: string;
    meetingSchedule?: string;
  }>;
  societies: Array<{
    name: string;
    description?: string;
    meetingSchedule?: string;
  }>;
  sacraments: Array<{
    sacrament: string;
    title: string;
    summary?: string;
    requirements?: string;
  }>;
}

export interface ChatProviderResult {
  reply: string;
}

/** Implement this to swap AI vendors. Providers receive public context only. */
export interface ChatProvider {
  readonly name: string;
  readonly isMock: boolean;
  generate(input: {
    system: string;
    context: PublicContext;
    messages: ChatMessage[];
  }): Promise<ChatProviderResult>;
}

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
export const MOCK_PREFIX =
  "(Demo assistant: automated keyword replies from published website content, not an AI model.) ";

const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w));

/** Deterministic keyword fallback used when no AI provider is configured. */
export class MockChatProvider implements ChatProvider {
  readonly name = "mock";
  readonly isMock = true;

  async generate({
    context,
    messages,
  }: {
    system: string;
    context: PublicContext;
    messages: ChatMessage[];
  }): Promise<ChatProviderResult> {
    const q =
      [...messages]
        .reverse()
        .find((m) => m.role === "user")
        ?.content.toLowerCase() ?? "";
    return { reply: MOCK_PREFIX + this.answer(q, context) };
  }

  private answer(q: string, c: PublicContext): string {
    if (has(q, "mass", "schedule", "service time", "what time")) {
      if (!c.massSchedules.length)
        return "The Mass schedule has not been published yet. Please contact the parish office.";
      return (
        "Mass schedule: " +
        c.massSchedules
          .map(
            (m) =>
              `${DAYS[m.dayOfWeek]} ${m.time}${m.location ? ` (${m.location})` : ""}${m.language ? ` [${m.language}]` : ""}`,
          )
          .join("; ") +
        "."
      );
    }
    if (has(q, "event", "upcoming", "happening")) {
      if (!c.events.length)
        return "There are no upcoming events published right now.";
      return (
        "Upcoming events: " +
        c.events
          .map(
            (e) =>
              `${e.title} on ${e.startsAt.slice(0, 10)}${e.location ? ` at ${e.location}` : ""}`,
          )
          .join("; ") +
        "."
      );
    }
    if (has(q, "announcement", "news", "notice")) {
      if (!c.announcements.length) return "There are no current announcements.";
      return (
        "Announcements: " + c.announcements.map((a) => a.title).join("; ") + "."
      );
    }
    if (has(q, "ministr")) {
      return c.ministries.length
        ? "Ministries: " +
            c.ministries
              .map(
                (m) =>
                  `${m.name}${m.meetingSchedule ? ` (${m.meetingSchedule})` : ""}`,
              )
              .join("; ") +
            "."
        : "No ministries are published yet.";
    }
    if (has(q, "societ")) {
      return c.societies.length
        ? "Societies: " +
            c.societies
              .map(
                (m) =>
                  `${m.name}${m.meetingSchedule ? ` (${m.meetingSchedule})` : ""}`,
              )
              .join("; ") +
            "."
        : "No societies are published yet.";
    }
    const sacramentWords: Record<string, string[]> = {
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

// ───────────── Anthropic provider ─────────────
/** Calls the Anthropic Messages API from the backend (the key never reaches the browser). Not exercised by the automated tests. */
export class AnthropicChatProvider implements ChatProvider {
  readonly name = "anthropic";
  readonly isMock = false;

  async generate({
    system,
    context,
    messages,
  }: {
    system: string;
    context: PublicContext;
    messages: ChatMessage[];
  }): Promise<ChatProviderResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: env.CHAT_MODEL,
          max_tokens: 600,
          system: `${system}\n\nPUBLIC CONTEXT (JSON, the only facts you may use):\n${JSON.stringify(context)}`,
          messages,
        }),
      });
      if (!res.ok)
        throw new AppError(
          502,
          "CHAT_PROVIDER_ERROR",
          "The assistant is temporarily unavailable",
        );
      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (data.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n")
        .trim();
      if (!text)
        throw new AppError(
          502,
          "CHAT_PROVIDER_ERROR",
          "The assistant returned an empty response",
        );
      return { reply: text };
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(
        502,
        "CHAT_PROVIDER_ERROR",
        "The assistant is temporarily unavailable",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export function getChatProvider(): ChatProvider {
  return env.CHAT_PROVIDER === "anthropic"
    ? new AnthropicChatProvider()
    : new MockChatProvider();
}
