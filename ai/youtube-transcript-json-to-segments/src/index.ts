import { createSchemaHandler, err, json } from "@cfw-utils/worker-kit";
import {
  HealthResponseSchema,
  YouTubeTranscriptJsonToSegmentsRequestSchema,
  YouTubeTranscriptJsonToSegmentsResponseSchema,
  type HealthResponse,
  type YouTubeTranscriptJsonToSegmentsResponse,
} from "@cfw-utils/schemas";
import { normalizeYouTubeTranscriptJson } from "./youtube";

type Env = Record<string, never>;

const normalizeHandler = createSchemaHandler({
  method: "POST",
  req: YouTubeTranscriptJsonToSegmentsRequestSchema,
  res: YouTubeTranscriptJsonToSegmentsResponseSchema,
  impl(value): YouTubeTranscriptJsonToSegmentsResponse | Response {
    try {
      const segments = normalizeYouTubeTranscriptJson(value.youtubeTranscript, {
        timeUnit: value.timeUnit,
      });
      return { segments };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid transcript";
      return json(err({ error: message, code: "INVALID_TRANSCRIPT" }), { status: 400 });
    }
  },
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      const health: HealthResponse = { ok: true, service: "youtube-transcript-json-to-segments" };
      return json(HealthResponseSchema.parse(health));
    }
    if (request.method !== "POST" || url.pathname !== "/run") {
      return json(err({ error: "Not Found", code: "NOT_FOUND" }), { status: 404 });
    }
    return normalizeHandler(request, env);
  },
};
