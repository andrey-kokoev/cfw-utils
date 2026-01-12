import { describe, expect, it } from "vitest";
import {
  HealthResponseSchema,
  ResultSchema,
  SegmentsToChaptersAiResponseSchema,
  type SegmentsToChaptersAiRequest,
} from "@cfw-utils/schemas";
import worker from "./index";

type Env = Parameters<typeof worker.fetch>[1];

describe("segments-to-chapters-ai (service)", () => {
  it("returns health on GET /health", async () => {
    const response = await worker.fetch(new Request("https://internal/health"), {} as Env);
    expect(response.status).toBe(200);
    const health = HealthResponseSchema.parse(await response.json());
    expect(health).toEqual({ ok: true, service: "segments-to-chapters-ai" });
  });

  it("rejects invalid JSON", async () => {
    const response = await worker.fetch(
      new Request("https://internal/run", { method: "POST", body: "{" }),
      { AI: { run: async () => ({ response: "{}" }) } } as Env,
    );
    expect(response.status).toBe(400);
    const body = ResultSchema(SegmentsToChaptersAiResponseSchema).parse(await response.json());
    expect(body.ok).toBe(false);
  });

  it("requires AI binding", async () => {
    const body: SegmentsToChaptersAiRequest = { text: "Hello world" };
    const response = await worker.fetch(
      new Request("https://internal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      {} as Env,
    );
    expect(response.status).toBe(500);
    const payload = ResultSchema(SegmentsToChaptersAiResponseSchema).parse(await response.json());
    expect(payload.ok).toBe(false);
  });

  it("returns chapters via mocked AI", async () => {
    const body: SegmentsToChaptersAiRequest = { text: "One. Two. Three.", maxChapters: 2 };
    const response = await worker.fetch(
      new Request("https://internal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      {
        AI: {
          run: async () => ({
            response: JSON.stringify({
              chapters: [
                {
                  title: "Chapter 1",
                  summary: "Summary.",
                  keyPoints: ["Point A"],
                  keywords: ["one"],
                  startSec: null,
                  endSec: null,
                },
              ],
            }),
          }),
        },
      } as Env,
    );
    expect(response.status).toBe(200);
    const result = ResultSchema(SegmentsToChaptersAiResponseSchema).parse(await response.json());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.chapters.length).toBe(1);
    expect(result.data.chapters[0].keywords).toEqual(["one"]);
  });

  it("accepts timestamped transcript segments", async () => {
    const body: SegmentsToChaptersAiRequest = {
      segments: [
        { startSec: 0, endSec: 5, text: "Hello and welcome." },
        { startSec: 5, endSec: 10, text: "Today we discuss X." },
      ],
      maxChapters: 2,
    };
    const response = await worker.fetch(
      new Request("https://internal/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      {
        AI: {
          run: async () => ({
            response: JSON.stringify({
              chapters: [
                {
                  title: "Intro",
                  summary: "Opening and topic setup.",
                  keyPoints: ["Welcome", "Topic X"],
                  keywords: ["welcome", "topic"],
                  startSec: 0,
                  endSec: 10,
                },
              ],
            }),
          }),
        },
      } as Env,
    );
    expect(response.status).toBe(200);
    const result = ResultSchema(SegmentsToChaptersAiResponseSchema).parse(await response.json());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.chapters[0].startSec).toBe(0);
    expect(result.data.chapters[0].endSec).toBe(10);
  });
});
