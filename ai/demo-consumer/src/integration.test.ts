import { describe, expect, it } from "vitest";
import {
  HealthResponseSchema,
  ResultSchema,
  SegmentsToChaptersAiResponseSchema,
  type YouTubeTranscriptJsonToChaptersAiRequest,
} from "@cfw-utils/schemas";
import worker from "./index";

type Env = Parameters<typeof worker.fetch>[1];

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

describe("demo-consumer", () => {
  it("returns health on GET /health", async () => {
    const response = await worker.fetch(new Request("https://internal/health"), {} as Env);
    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toEqual({ ok: true, service: "demo-consumer" });
  });

  it("proxies downstream Result", async () => {
    const body: YouTubeTranscriptJsonToChaptersAiRequest = { youtubeTranscript: [] };
    const env = {
      YOUTUBE_TRANSCRIPT_JSON_TO_CHAPTERS_AI: {
        fetch: async () => jsonResponse({ ok: true, data: { chapters: [] } }),
      },
    } satisfies Env;

    const response = await worker.fetch(
      new Request("https://internal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
    );

    const parsed = ResultSchema(SegmentsToChaptersAiResponseSchema).parse(await response.json());
    expect(parsed.ok).toBe(true);
  });
});

