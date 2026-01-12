import { describe, expect, it } from "vitest";
import {
  HealthResponseSchema,
  ResultSchema,
  YouTubeTranscriptJsonToSegmentsResponseSchema,
  type YouTubeTranscriptJsonToSegmentsRequest,
} from "@cfw-utils/schemas";
import worker from "./index";

type Env = Parameters<typeof worker.fetch>[1];

describe("youtube-transcript-json-to-segments", () => {
  it("returns health on GET /health", async () => {
    const response = await worker.fetch(new Request("https://internal/health"), {} as Env);
    expect(response.status).toBe(200);
    expect(HealthResponseSchema.parse(await response.json())).toEqual({
      ok: true,
      service: "youtube-transcript-json-to-segments",
    });
  });

  it("normalizes a youtube transcript array", async () => {
    const body: YouTubeTranscriptJsonToSegmentsRequest = {
      youtubeTranscript: [
        { text: "Hello", offset: 0, duration: 2 },
        { text: "World", offset: 2, duration: 3 },
      ],
    };
    const response = await worker.fetch(
      new Request("https://internal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      {} as Env,
    );
    expect(response.status).toBe(200);
    const result = ResultSchema(YouTubeTranscriptJsonToSegmentsResponseSchema).parse(await response.json());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.segments.length).toBe(2);
    expect(result.data.segments[0]).toEqual({ startSec: 0, endSec: 2, text: "Hello" });
  });
});
