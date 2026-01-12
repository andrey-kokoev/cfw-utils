import { describe, expect, it } from "vitest";
import worker from "./index";

type Env = Parameters<typeof worker.fetch>[1];

describe("telegram-update-to-chapters-ai", () => {
  it("returns 401 when secret is set and header missing", async () => {
    const env = {
      TELEGRAM_WEBHOOK_SECRET: "secret",
      YOUTUBE_TRANSCRIPT_JSON_TO_CHAPTERS_AI: { fetch: async () => new Response("{}", { status: 500 }) },
    } satisfies Env;

    const ctx = { waitUntil() {} };
    const response = await worker.fetch(
      new Request("https://internal/run", { method: "POST", body: "{}" }),
      env,
      ctx,
    );
    expect(response.status).toBe(401);
  });

  it("queues update when valid", async () => {
    const env = {
      TELEGRAM_WEBHOOK_SECRET: "secret",
      YOUTUBE_TRANSCRIPT_JSON_TO_CHAPTERS_AI: { fetch: async () => new Response("{}", { status: 500 }) },
    } satisfies Env;

    let waitUntilCalled = false;
    const ctx = { waitUntil() { waitUntilCalled = true; } };
    const response = await worker.fetch(
      new Request("https://internal/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "secret",
        },
        body: JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 1 }, text: "/chapters {}" } }),
      }),
      env,
      ctx,
    );
    expect(response.status).toBe(200);
    expect(waitUntilCalled).toBe(true);
  });
});

