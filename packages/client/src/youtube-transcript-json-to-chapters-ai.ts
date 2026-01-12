import type {
  ApiError,
  SegmentsToChaptersAiResponse,
  YouTubeTranscriptJsonToChaptersAiRequest,
} from "@cfw-utils/schemas";
import {
  SegmentsToChaptersAiResponseSchema,
  YouTubeTranscriptJsonToChaptersAiRequestSchema,
} from "@cfw-utils/schemas";
import { createSchemaClient, type ServiceFetcher } from "./schema-client";

export function createYouTubeTranscriptJsonToChaptersAiClient(
  fetcher: ServiceFetcher,
  options?: { url?: string },
): (
  request: YouTubeTranscriptJsonToChaptersAiRequest,
) => Promise<{ ok: true; data: SegmentsToChaptersAiResponse } | { ok: false; error: ApiError }> {
  const url = options?.url ?? "https://internal/run";
  return createSchemaClient({
    fetcher,
    url,
    method: "POST",
    req: YouTubeTranscriptJsonToChaptersAiRequestSchema,
    res: SegmentsToChaptersAiResponseSchema,
  });
}
