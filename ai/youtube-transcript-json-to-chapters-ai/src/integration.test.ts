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

describe("youtube-transcript-json-to-chapters-ai", () => {
  it("returns health on GET /health", async () => {
    const response = await worker.fetch(new Request("https://internal/health"), {} as Env);
    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toEqual({
      ok: true,
      service: "youtube-transcript-json-to-chapters-ai",
    });
  });

  it("pipes normalization into summarization", async () => {
    const body: YouTubeTranscriptJsonToChaptersAiRequest = {
      youtubeTranscript: [{ text: "Hello", offset: 0, duration: 2 }],
      maxChapters: 2,
    };

    const env = {
      YOUTUBE_TRANSCRIPT_JSON_TO_SEGMENTS: {
        fetch: async () =>
          jsonResponse({
            ok: true,
            data: { segments: [{ startSec: 0, endSec: 2, text: "Hello" }] },
          }),
      },
      SEGMENTS_TO_CHAPTERS_AI: {
        fetch: async () =>
          jsonResponse({
            ok: true,
            data: {
              chapters: [
                {
                  title: "Intro",
                  summary: "Greeting.",
                  keyPoints: [],
                  keywords: [],
                  startSec: 0,
                  endSec: 2,
                },
              ],
            },
          }),
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

    expect(response.status).toBe(200);
    const result = ResultSchema(SegmentsToChaptersAiResponseSchema).parse(await response.json());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.chapters[0].title).toBe("Intro");
  });
});
