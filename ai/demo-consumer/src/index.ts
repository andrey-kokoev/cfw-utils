import { createSchemaHandler, err, json } from "@cfw-utils/worker-kit";
import {
  HealthResponseSchema,
  SegmentsToChaptersAiResponseSchema,
  YouTubeTranscriptJsonToChaptersAiRequestSchema,
  type HealthResponse,
} from "@cfw-utils/schemas";
import { createYouTubeTranscriptJsonToChaptersAiClient } from "@cfw-utils/client/youtube-transcript-json-to-chapters-ai";

type Env = {
  YOUTUBE_TRANSCRIPT_JSON_TO_CHAPTERS_AI: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
};

const run = createSchemaHandler({
  method: "POST",
  req: YouTubeTranscriptJsonToChaptersAiRequestSchema,
  res: SegmentsToChaptersAiResponseSchema,
  async impl(value, _request, env: Env): Promise<Response> {
    const client = createYouTubeTranscriptJsonToChaptersAiClient(env.YOUTUBE_TRANSCRIPT_JSON_TO_CHAPTERS_AI);
    const result = await client(value);
    return json(result, { status: result.ok ? 200 : 502 });
  },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const health: HealthResponse = { ok: true, service: "demo-consumer" };
      return json(HealthResponseSchema.parse(health));
    }
    if (request.method !== "POST" || url.pathname !== "/run") {
      return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404 });
    }
    return run(request, env);
  },
};
