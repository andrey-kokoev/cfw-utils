import { createSchemaHandler, err, json } from "@cfw-utils/worker-kit";
import {
  HealthResponseSchema,
  SegmentsToChaptersAiResponseSchema,
  YouTubeTranscriptJsonToChaptersAiRequestSchema,
  type HealthResponse,
  type SegmentsToChaptersAiResponse,
} from "@cfw-utils/schemas";
import { createSegmentsToChaptersAiClient } from "@cfw-utils/client/segments-to-chapters-ai";
import { createYouTubeTranscriptJsonToSegmentsClient } from "@cfw-utils/client/youtube-transcript-json-to-segments";

type Env = {
  YOUTUBE_TRANSCRIPT_JSON_TO_SEGMENTS: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
  SEGMENTS_TO_CHAPTERS_AI: { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
};

const handler = createSchemaHandler({
  method: "POST",
  req: YouTubeTranscriptJsonToChaptersAiRequestSchema,
  res: SegmentsToChaptersAiResponseSchema,
  async impl(value, _request, env: Env): Promise<SegmentsToChaptersAiResponse | Response> {
    const normalize = createYouTubeTranscriptJsonToSegmentsClient(env.YOUTUBE_TRANSCRIPT_JSON_TO_SEGMENTS);
    const normalized = await normalize({
      youtubeTranscript: value.youtubeTranscript,
      timeUnit: value.timeUnit,
    });
    if (!normalized.ok) {
      return json(err(normalized.error), { status: 502 });
    }

    const summarize = createSegmentsToChaptersAiClient(env.SEGMENTS_TO_CHAPTERS_AI);
    const chapters = await summarize({
      segments: normalized.data.segments,
      maxChapters: value.maxChapters,
      temperature: value.temperature,
      model: value.model,
    });
    if (!chapters.ok) {
      return json(err(chapters.error), { status: 502 });
    }

    return chapters.data;
  },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const health: HealthResponse = { ok: true, service: "youtube-transcript-json-to-chapters-ai" };
      return json(HealthResponseSchema.parse(health));
    }
    if (request.method !== "POST" || url.pathname !== "/run") {
      return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404 });
    }
    return handler(request, env);
  },
};
