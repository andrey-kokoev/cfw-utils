import { createYouTubeTranscriptJsonToChaptersAiClient } from "@cfw-utils/client/youtube-transcript-json-to-chapters-ai";
import type { ApiError, SegmentsToChaptersAiResponse } from "@cfw-utils/schemas";
import { json, ok, err } from "@cfw-utils/worker-kit";
import { z } from "zod";

type Env = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  YOUTUBE_TRANSCRIPT_JSON_TO_CHAPTERS_AI: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
};

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

const TelegramChatSchema = z.object({
  id: z.number(),
});

const TelegramMessageSchema = z.object({
  message_id: z.number(),
  chat: TelegramChatSchema,
  text: z.string().optional(),
});

const TelegramUpdateSchema = z
  .object({
    update_id: z.number(),
    message: TelegramMessageSchema.optional(),
  })
  .passthrough();

type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;

function formatTime(seconds: number | null): string {
  if (seconds === null) return "";
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

function formatChapters(response: SegmentsToChaptersAiResponse): string {
  if (response.chapters.length === 0) return "No chapters produced.";
  const lines: string[] = [];
  for (const [index, chapter] of response.chapters.entries()) {
    const start = formatTime(chapter.startSec);
    const end = formatTime(chapter.endSec);
    const range = start || end ? ` (${start}${end ? `–${end}` : ""})` : "";
    lines.push(`${index + 1}. ${chapter.title}${range}`);
    lines.push(`   ${chapter.summary}`);
  }
  return lines.join("\n");
}

async function telegramSendMessage(
  env: Env,
  chatId: number,
  text: string,
): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    return { ok: false, error: { error: "Missing TELEGRAM_BOT_TOKEN", code: "CONFIG_ERROR" } };
  }

  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  if (!response.ok) {
    return { ok: false, error: { error: "Failed to send Telegram message", code: "TELEGRAM_ERROR" } };
  }
  return { ok: true };
}

async function handleUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  const message = update.message;
  const text = message?.text?.trim() ?? "";
  if (!message || !text) return;

  if (!text.startsWith("/chapters")) return;

  const payload = text.replace(/^\/chapters\s*/i, "");
  if (!payload) {
    await telegramSendMessage(env, message.chat.id, "Usage: /chapters <youtube transcript json>");
    return;
  }

  let youtubeTranscript: unknown;
  try {
    youtubeTranscript = JSON.parse(payload) as unknown;
  } catch {
    await telegramSendMessage(env, message.chat.id, "Invalid JSON. Paste the transcript JSON after /chapters.");
    return;
  }

  const client = createYouTubeTranscriptJsonToChaptersAiClient(env.YOUTUBE_TRANSCRIPT_JSON_TO_CHAPTERS_AI);
  const result = await client({ youtubeTranscript });
  if (!result.ok) {
    await telegramSendMessage(env, message.chat.id, `Failed: ${result.error.error}`);
    return;
  }

  await telegramSendMessage(env, message.chat.id, formatChapters(result.data));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "telegram-update-to-chapters-ai" });
    }

    if (request.method !== "POST" || url.pathname !== "/run") {
      return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404 });
    }

    const expected = env.TELEGRAM_WEBHOOK_SECRET;
    if (expected) {
      const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (got !== expected) {
        return json(err({ error: "Unauthorized", code: "UNAUTHORIZED" }), { status: 401 });
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(err({ error: "Invalid JSON", code: "VALIDATION_ERROR" }), { status: 400 });
    }

    const parsed = TelegramUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return json(err({ error: "Invalid Telegram update", code: "VALIDATION_ERROR" }), { status: 400 });
    }

    ctx.waitUntil(handleUpdate(parsed.data, env));
    return json(ok({ queued: true }));
  },
};
